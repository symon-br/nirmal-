/* API client: talks to the Cloudflare Worker (/api/*).
 *
 * PRODUCTION (vite build): the Worker + D1 is the single source of truth.
 * If /api is unreachable or errors, functions THROW so the UI shows a clear
 * error state. There is intentionally NO localStorage fallback in production —
 * silently saving "successfully" to the browser while D1 failed would create
 * two sources of truth and pretend writes succeeded.
 *
 * DEVELOPMENT (`npm run dev` without `wrangler dev`): the Worker isn't running,
 * so calls fall back to a browser-local store purely so pages still render.
 * Dev fallback data never leaves the browser and is never used in production. */

const PROD =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD) ||
  (typeof globalThis !== 'undefined' && globalThis.__CRETURES_PROD === true);

export function isProduction() {
  return !!PROD;
}

const LS_KEY = 'cretures_admin_v1';

function loadStore() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.upcoming) && Array.isArray(s.blogs)) return s;
    }
  } catch { /* ignore */ }
  return { upcoming: [], blogs: [] };
}

function saveStore(s) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

const uid = () =>
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

export function slugify(s) {
  return (
    String(s || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || `post-${Date.now()}`
  );
}

async function req(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    });
  } catch {
    const err = new Error('API unavailable — please try again later');
    err.status = 0;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* ---------- public reads ---------- */
export async function fetchUpcoming() {
  try {
    return await req('/api/upcoming');
  } catch (err) {
    if (PROD) throw err;
    return loadStore().upcoming.filter((p) => p.published !== false && !p.deleted);
  }
}

export async function fetchBlogs() {
  try {
    return await req('/api/blogs');
  } catch (err) {
    if (PROD) throw err;
    return loadStore().blogs.filter((b) => b.published && !b.deleted);
  }
}

export async function fetchBlogBySlug(slug) {
  try {
    return await req(`/api/blogs/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (PROD) throw err;
    const found = loadStore().blogs.find((b) => b.slug === slug && b.published && !b.deleted);
    if (!found) {
      const nf = new Error('Not found');
      nf.status = 404;
      throw nf;
    }
    return found;
  }
}

export async function fetchMe() {
  try {
    return await req('/api/auth/me');
  } catch {
    // No identity provable without the Worker: dev keeps a local preview
    // mode, production shows the Restricted gate (local: false).
    return { email: null, access_configured: false, local: !PROD };
  }
}

/* ---------- admin (server only in production) ---------- */
async function adminReq(path, method, body) {
  try {
    return { data: await req(path, { method, body: body ? JSON.stringify(body) : undefined }), remote: true };
  } catch (err) {
    // 401/403/422/429 from the Worker are authoritative — always surface.
    if (PROD || (err.status !== 0 && err.status !== 500 && err.status !== 404)) throw err;
    // Dev-only: API unreachable → browser-local store.
    if (err.status === 401 || err.status === 403) throw err;
    return { data: null, remote: false };
  }
}

function devStore() {
  if (PROD) {
    const err = new Error('API unavailable — please try again later');
    err.status = 0;
    throw err;
  }
  return loadStore();
}

export async function adminListUpcoming(opts = {}) {
  const qs = opts.trash ? '?trash=1' : '';
  const r = await adminReq(`/api/admin/upcoming${qs}`, 'GET');
  if (r.remote) return { items: r.data, remote: true };
  const s = devStore();
  return { items: s.upcoming.filter((p) => (opts.trash ? p.deleted : !p.deleted)), remote: false };
}

export async function adminSaveUpcoming(item) {
  const isEdit = !!item.id;
  const r = await adminReq(
    isEdit ? `/api/admin/upcoming/${encodeURIComponent(item.id)}` : '/api/admin/upcoming',
    isEdit ? 'PUT' : 'POST',
    item
  );
  if (r.remote) return r.data;
  const s = devStore();
  if (isEdit) {
    s.upcoming = s.upcoming.map((p) => (p.id === item.id ? { ...p, ...item } : p));
  } else {
    s.upcoming.unshift({ id: uid(), created_at: new Date().toISOString(), ...item });
  }
  saveStore(s);
  return item;
}

export async function adminDeleteUpcoming(id, permanent = false) {
  const qs = permanent ? '?permanent=1' : '';
  const r = await adminReq(`/api/admin/upcoming/${encodeURIComponent(id)}${qs}`, 'DELETE');
  if (r.remote) return true;
  const s = devStore();
  if (permanent) {
    s.upcoming = s.upcoming.filter((p) => p.id !== id);
  } else {
    s.upcoming = s.upcoming.map((p) => (p.id === id ? { ...p, deleted: true } : p));
  }
  saveStore(s);
  return true;
}

export async function adminRestoreUpcoming(id) {
  const r = await adminReq(`/api/admin/upcoming/${encodeURIComponent(id)}/restore`, 'POST');
  if (r.remote) return r.data;
  const s = devStore();
  s.upcoming = s.upcoming.map((p) => (p.id === id ? { ...p, deleted: false } : p));
  saveStore(s);
  return true;
}

export async function adminListBlogs(opts = {}) {
  const qs = opts.trash ? '?trash=1' : '';
  const r = await adminReq(`/api/admin/blogs${qs}`, 'GET');
  if (r.remote) return { items: r.data, remote: true };
  const s = devStore();
  return { items: s.blogs.filter((b) => (opts.trash ? b.deleted : !b.deleted)), remote: false };
}

export async function adminSaveBlog(item) {
  const payload = { ...item };
  if (!payload.slug) payload.slug = slugify(payload.title);
  const r = await adminReq(
    item.id ? `/api/admin/blogs/${encodeURIComponent(item.id)}` : '/api/admin/blogs',
    item.id ? 'PUT' : 'POST',
    payload
  );
  if (r.remote) return r.data;
  const s = devStore();
  const ts = new Date().toISOString();
  if (item.id) {
    s.blogs = s.blogs.map((b) => (b.id === item.id ? { ...b, ...payload, updated_at: ts } : b));
  } else {
    s.blogs.unshift({ id: uid(), created_at: ts, updated_at: ts, ...payload });
  }
  if (s.blogs.filter((b) => b.slug === payload.slug).length > 1) {
    payload.slug = `${payload.slug}-${String(uid()).slice(0, 6)}`;
    s.blogs[0] = { ...s.blogs[0], slug: payload.slug };
  }
  saveStore(s);
  return { ...payload, id: item.id || s.blogs[0].id };
}

export async function adminDeleteBlog(idOrSlug, permanent = false) {
  const qs = permanent ? '?permanent=1' : '';
  const r = await adminReq(`/api/admin/blogs/${encodeURIComponent(idOrSlug)}${qs}`, 'DELETE');
  if (r.remote) return true;
  const s = devStore();
  if (permanent) {
    s.blogs = s.blogs.filter((b) => b.id !== idOrSlug && b.slug !== idOrSlug);
  } else {
    s.blogs = s.blogs.map((b) => (b.id === idOrSlug || b.slug === idOrSlug ? { ...b, deleted: true } : b));
  }
  saveStore(s);
  return true;
}

export async function adminRestoreBlog(idOrSlug) {
  const r = await adminReq(`/api/admin/blogs/${encodeURIComponent(idOrSlug)}/restore`, 'POST');
  if (r.remote) return r.data;
  const s = devStore();
  s.blogs = s.blogs.map((b) =>
    b.id === idOrSlug || b.slug === idOrSlug ? { ...b, deleted: false } : b
  );
  saveStore(s);
  return true;
}
