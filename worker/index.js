/* Cloudflare Worker (single deployment): serves the SPA frontend (./dist) + JSON API (D1).
 * Public reads:  GET /api/upcoming, /api/blogs, /api/blogs/:slug
 * Admin (ALL methods incl. GET list/detail, POST, PUT, PATCH, DELETE):
 *   /api/admin/* — requires a valid Cloudflare Access JWT, verified server-side
 *   (signature via Access JWKS, issuer, audience, expiry) + ADMIN_EMAILS allowlist.
 * All rich-text HTML is sanitized server-side; user-controlled URLs are validated.
 * Protect /admin* and /api/admin/* with a Cloudflare Access application in Zero Trust.
 */

const json = (data, status = 200, retryAfterSec = 0) => {
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  if (retryAfterSec > 0) headers['retry-after'] = String(retryAfterSec);
  return new Response(JSON.stringify(data), { status, headers });
};

/* Thrown for client errors so the outer handler can map them to clean,
 * non-leaking status codes. Never attach tokens, secrets, or SQL here. */
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

const now = () => new Date().toISOString();
const uid = () =>
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `post-${Date.now()}`;
}

/* ---------- input validation & sanitization ---------- */
/* Semantic validation failures use 422; malformed request bodies use 400. */
function fail(message) {
  const err = new Error(message);
  err.status = 422;
  throw err;
}

function readJsonBody(request) {
  return request
    .json()
    .then((b) => (b && typeof b === 'object' ? b : httpError(400, 'Invalid JSON body')))
    .catch(() => httpError(400, 'Invalid JSON body'));
}

function plainText(v, max) {
  return String(v ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/* Only site-relative ("/...") or http(s) URLs (mailto allowed for links, never images). */
function isSafeUrl(v, kind) {
  const s = String(v || '').trim();
  if (!s || s.length > 2000) return false;
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(s);
  if (m) {
    const scheme = m[1].toLowerCase();
    if (kind === 'img') return scheme === 'http' || scheme === 'https';
    return scheme === 'http' || scheme === 'https' || scheme === 'mailto';
  }
  if (s.startsWith('//')) return false;
  return s.startsWith('/');
}

function assertFieldUrl(v, field) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (!isSafeUrl(s, 'link')) fail(`${field}: URL must be site-relative (/) or http(s)`);
  return s.slice(0, 2000);
}

function cleanTags(v) {
  const arr = (Array.isArray(v) ? v : parseTags(v))
    .map((t) => plainText(t, 40))
    .filter(Boolean);
  return arr.slice(0, 20);
}

const ALLOWED_TAGS = {
  p: [], br: [], hr: [], h2: [], h3: [], blockquote: [],
  ul: [], ol: [], li: [], strong: [], b: [], em: [], i: [], u: [],
  pre: [], code: [], span: [],
  a: ['href', 'title'],
  img: ['src', 'alt', 'title'],
};

/* Allowlist HTML sanitizer (no DOM in Workers): drops scripts/styles/iframes,
 * comments, non-allowlisted tags and attributes (incl. all on* handlers and
 * style), and validates href/src values. Everything else passes through. */
function sanitizeHtml(html) {
  let s = String(html || '').slice(0, 500000);
  s = s.replace(/<script[\s\S]*?(<\/script\s*>|$)/gi, '');
  s = s.replace(/<style[\s\S]*?(<\/style\s*>|$)/gi, '');
  s = s.replace(/<iframe[\s\S]*?(<\/iframe\s*>|$)/gi, '');
  s = s.replace(/<object[\s\S]*?(<\/object\s*>|$)/gi, '');
  s = s.replace(/<embed[\s\S]*?(\/>|>|$)/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  return s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b((?:"[^"]*"|'[^']*'|[^<>"'])*)>/g, (full, rawTag, rawAttrs) => {
    const tag = rawTag.toLowerCase();
    if (!Object.hasOwn(ALLOWED_TAGS, tag)) return '';
    if (full.startsWith('</')) return `</${tag}>`;
    const allowed = ALLOWED_TAGS[tag];
    let out = '';
    if (rawAttrs && allowed.length) {
      const re = /([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
      let m;
      while ((m = re.exec(rawAttrs))) {
        const name = m[1].toLowerCase();
        if (!allowed.includes(name)) continue;
        const val = (m[2] ?? m[3] ?? m[4] ?? '').trim();
        if (name === 'href' && !isSafeUrl(val, 'a')) continue;
        if (name === 'src' && !isSafeUrl(val, 'img')) continue;
        const esc = val.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        out += ` ${name}="${esc}"`;
      }
    }
    if (tag === 'a') return `<a${out} rel="noopener noreferrer">`;
    return `<${tag}${out}>`;
  });
}

const INIT_SQL = [
  `CREATE TABLE IF NOT EXISTS upcoming_projects (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'planned', image_url TEXT NOT NULL DEFAULT '',
    link_url TEXT NOT NULL DEFAULT '', link_label TEXT NOT NULL DEFAULT '',
    target_date TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]',
    progress INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS blog_posts (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    excerpt TEXT NOT NULL DEFAULT '', cover_url TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]', content_html TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 0, published_at TEXT,
    deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_slug ON blog_posts(slug)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_slug_unique ON blog_posts(slug)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_published ON blog_posts(published)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_visible ON blog_posts(published, deleted, published_at)`,
  `CREATE INDEX IF NOT EXISTS idx_upcoming_published ON upcoming_projects(published)`,
  `CREATE INDEX IF NOT EXISTS idx_upcoming_visible ON upcoming_projects(published, deleted, sort_order)`,
];

/* Columns added after 0001: applied idempotently here for robustness, and via
 * migrations/0002_soft_delete.sql through the remote-migrations CI step. */
const ALTER_SQL = [
  `ALTER TABLE upcoming_projects ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE upcoming_projects ADD COLUMN deleted_at TEXT`,
  `ALTER TABLE blog_posts ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE blog_posts ADD COLUMN deleted_at TEXT`,
];

async function ensureTables(db) {
  if (!db) return;
  for (const sql of [...INIT_SQL, ...ALTER_SQL]) {
    try {
      await db.prepare(sql).run();
    } catch {
      /* table/column/index already exists — safe to ignore */
    }
  }
}

/* ---------- Cloudflare Access verification ---------- */
let certsCache = { keys: null, at: 0 };

async function getAccessCerts(teamDomain) {
  if (certsCache.keys && Date.now() - certsCache.at < 10 * 60 * 1000) return certsCache.keys;
  const res = await fetch(`${teamDomain.replace(/\/$/, '')}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('certs fetch failed');
  const data = await res.json();
  certsCache = { keys: data.keys || [], at: Date.now() };
  return certsCache.keys;
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function verifyAccessJwt(token, env) {
  const [hB64, pB64, sB64] = token.split('.');
  if (!hB64 || !pB64 || !sB64) return null;
  let header;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(hB64)));
  } catch {
    return null;
  }
  const keys = await getAccessCerts(env.ACCESS_TEAM_DOMAIN);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const data = new TextEncoder().encode(`${hB64}.${pB64}`);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sB64), data);
  if (!ok) return null;
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(pB64)));
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < nowSec - 30) return null;
  const team = env.ACCESS_TEAM_DOMAIN.replace(/\/$/, '');
  if (payload.iss !== team) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  return payload;
}

function configured(env) {
  return (
    env.ACCESS_TEAM_DOMAIN &&
    !env.ACCESS_TEAM_DOMAIN.includes('REPLACE') &&
    env.ACCESS_AUD &&
    !env.ACCESS_AUD.includes('REPLACE')
  );
}

/* Returns the verified admin email, or throws:
 *   401 — missing, malformed, invalid-signature, wrong-issuer, wrong-audience,
 *         or expired token (or Access not configured server-side).
 *   403 — valid token, but the email is not in the ADMIN_EMAILS allowlist.
 * Trusts ONLY the Cf-Access-Jwt-Assertion request header, verified below.
 * The CF_Authorization cookie is intentionally NEVER read: cookies are ambient
 * credentials the browser attaches automatically, so they cannot authenticate
 * origin intent — the assertion header bound to this request can. */
async function requireAdmin(request, env) {
  const url = new URL(request.url);
  const isLocal =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.local');
  // Development convenience only: requires BOTH a local hostname AND the
  // explicit DEV_ADMIN_BYPASS=true var. Never enabled in production.
  if (isLocal && env.DEV_ADMIN_BYPASS === 'true') return 'dev@localhost';
  if (!configured(env)) httpError(401, 'Access not configured');
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!assertion) httpError(401, 'Missing credentials');
  let payload = null;
  try {
    payload = await verifyAccessJwt(assertion, env);
  } catch {
    payload = null;
  }
  if (!payload || !payload.email) httpError(401, 'Invalid or expired credentials');
  const allow = String(env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length && !allow.includes(String(payload.email).toLowerCase())) {
    httpError(403, 'Forbidden for this account');
  }
  return payload.email;
}

/* Non-throwing wrapper for the public /api/auth/me status endpoint. */
async function getAdminEmail(request, env) {
  try {
    return await requireAdmin(request, env);
  } catch {
    return null;
  }
}

/* CSRF / origin protection for state-changing admin requests.
 * Why: the Access JWT travels in a header that fetch() sends explicitly, but a
 * forged cross-site form/POST from an attacker's page could still ride the
 * victim's Access session if the browser attaches ambient credentials. Browsers
 * always send Origin (or Referer) on POST/PUT/PATCH/DELETE, so requiring it to
 * match this Worker's own origin rejects cross-site forgeries while legitimate
 * same-origin dashboard requests always pass. Requests with neither header
 * (non-browser clients) are rejected for mutations. */
function hasValidOrigin(request) {
  const origin = request.headers.get('Origin');
  let candidate = origin;
  if (!candidate) {
    const referer = request.headers.get('Referer');
    if (!referer) return false;
    try {
      candidate = new URL(referer).origin;
    } catch {
      return false;
    }
  }
  try {
    return new URL(candidate).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/* Best-effort per-isolate rate limiting (Workers have no shared memory across
 * isolates, so this is defense-in-depth, not a global guarantee — enforce
 * strict global limits with Cloudflare Rate Limiting Rules in the dashboard).
 * Limits are generous for normal admin use. */
const RL_BUCKETS = new Map();
function checkRateLimit(request, kind) {
  const limits = { admin_mutation: [120, 60], api: [600, 60] };
  const [max, windowSec] = limits[kind] || limits.api;
  const fwd = request.headers.get('X-Forwarded-For');
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    (fwd ? fwd.split(',')[0].trim() : '') ||
    'unknown';
  const nowMs = Date.now();
  const key = `${kind}:${ip}`;
  if (RL_BUCKETS.size > 5000 || Math.random() < 0.01) {
    for (const [k, v] of RL_BUCKETS) if (v.reset <= nowMs) RL_BUCKETS.delete(k);
  }
  let b = RL_BUCKETS.get(key);
  if (!b || b.reset <= nowMs) {
    b = { count: 0, reset: nowMs + windowSec * 1000 };
    RL_BUCKETS.set(key, b);
  }
  b.count += 1;
  if (b.count > max) {
    const retry = Math.max(1, Math.ceil((b.reset - nowMs) / 1000));
    return json({ error: 'Too many requests, slow down' }, 429, retry);
  }
  return null;
}

/* ---------- row mapping ---------- */
const parseTags = (v) => {
  try {
    const t = JSON.parse(v || '[]');
    return Array.isArray(t) ? t : [];
  } catch {
    return String(v || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
};
const mapUpcoming = (r) => ({
  ...r,
  tags: parseTags(r.tags),
  published: !!r.published,
  deleted: !!r.deleted,
});
const mapBlog = (r) => ({
  ...r,
  tags: parseTags(r.tags),
  published: !!r.published,
  deleted: !!r.deleted,
});

/* True when a D1 error is a UNIQUE-constraint violation (insert/update race on
 * slug): callers retry once with a suffixed slug instead of failing. */
function isUniqueViolation(e) {
  return /unique/i.test(String((e && e.message) || e || ''));
}

/* ---------- handlers ---------- */
async function handleUpcoming(env) {
  // Public route: published, non-deleted rows only. There is intentionally no
  // ?published=0 backdoor — drafts are admin-only data (see /api/admin/*).
  const { results } = await env.DB.prepare(
    'SELECT * FROM upcoming_projects WHERE published = 1 AND deleted = 0 ORDER BY sort_order ASC, created_at DESC'
  ).all();
  return json((results || []).map(mapUpcoming));
}

async function handleBlogs(url, env, admin) {
  const trashOnly = url.searchParams.get('trash') === '1';
  if (!admin) {
    const { results } = await env.DB.prepare(
      'SELECT id, title, slug, excerpt, cover_url, tags, published, published_at, created_at, updated_at FROM blog_posts WHERE published = 1 AND deleted = 0 ORDER BY COALESCE(published_at, created_at) DESC'
    ).all();
    return json((results || []).map(mapBlog));
  }
  const q = trashOnly
    ? 'SELECT * FROM blog_posts WHERE deleted = 1 ORDER BY updated_at DESC'
    : 'SELECT * FROM blog_posts WHERE deleted = 0 ORDER BY updated_at DESC';
  const { results } = await env.DB.prepare(q).all();
  return json((results || []).map(mapBlog));
}

async function handleAdminUpcomingList(url, env) {
  const trashOnly = url.searchParams.get('trash') === '1';
  const q = trashOnly
    ? 'SELECT * FROM upcoming_projects WHERE deleted = 1 ORDER BY updated_at DESC'
    : 'SELECT * FROM upcoming_projects WHERE deleted = 0 ORDER BY sort_order ASC, created_at DESC';
  const { results } = await env.DB.prepare(q).all();
  return json((results || []).map(mapUpcoming));
}

async function handleBlogBySlug(slug, env) {
  const row = await env.DB.prepare('SELECT * FROM blog_posts WHERE slug = ? AND deleted = 0 LIMIT 1')
    .bind(slug)
    .first();
  if (!row || !row.published) return json({ error: 'Not found' }, 404);
  const mapped = mapBlog(row);
  // Defense in depth: sanitize again on public read. sanitizeHtml is
  // idempotent, so already-clean stored HTML passes through unchanged.
  mapped.content_html = sanitizeHtml(mapped.content_html || '');
  return json(mapped);
}

function validateUpcoming(b) {
  if (!b.title || !String(b.title).trim()) fail('Title is required');
  const targetDate = String(b.target_date || '').trim();
  if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) fail('target_date must be YYYY-MM-DD');
  const sortOrder = Number(b.sort_order);
  return {
    title: plainText(b.title, 160),
    description: plainText(b.description, 5000),
    status: ['planned', 'in-progress', 'paused', 'done'].includes(b.status) ? b.status : 'planned',
    image_url: assertFieldUrl(b.image_url ?? b.image ?? '', 'image_url'),
    link_url: assertFieldUrl(b.link_url ?? b.link ?? '', 'link_url'),
    link_label: plainText(b.link_label, 120),
    target_date: targetDate.slice(0, 10),
    tags: JSON.stringify(cleanTags(b.tags)),
    progress: Math.max(0, Math.min(100, Number(b.progress) || 0)),
    published: b.published === false || b.published === 0 ? 0 : 1,
    sort_order: Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : 0,
  };
}

async function upsertUpcoming(request, env, id, isPatch) {
  let b;
  try {
    b = await readJsonBody(request);
    if (isPatch) {
      const existing = await env.DB.prepare('SELECT * FROM upcoming_projects WHERE id = ? AND deleted = 0')
        .bind(id)
        .first();
      if (!existing) return json({ error: 'Not found' }, 404);
      b = { ...mapUpcoming(existing), ...b, id: existing.id };
    }
    const row = validateUpcoming(b);
    const ts = now();
    if (id) {
      const existing = isPatch
        ? { id }
        : await env.DB.prepare('SELECT id FROM upcoming_projects WHERE id = ? AND deleted = 0').bind(id).first();
      if (!existing) return json({ error: 'Not found' }, 404);
      await env.DB.prepare(
        `UPDATE upcoming_projects SET title=?, description=?, status=?, image_url=?, link_url=?, link_label=?, target_date=?, tags=?, progress=?, published=?, sort_order=?, updated_at=? WHERE id=? AND deleted = 0`
      )
        .bind(row.title, row.description, row.status, row.image_url, row.link_url, row.link_label, row.target_date, row.tags, row.progress, row.published, row.sort_order, ts, id)
        .run();
      return json({ id, ...row, tags: JSON.parse(row.tags), published: !!row.published, updated_at: ts });
    }
    const newId = uid();
    await env.DB.prepare(
      `INSERT INTO upcoming_projects (id, title, description, status, image_url, link_url, link_label, target_date, tags, progress, published, sort_order, deleted, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`
    )
      .bind(newId, row.title, row.description, row.status, row.image_url, row.link_url, row.link_label, row.target_date, row.tags, row.progress, row.published, row.sort_order, ts, ts)
      .run();
    return json({ id: newId, ...row, tags: JSON.parse(row.tags), published: !!row.published, created_at: ts, updated_at: ts }, 201);
  } catch (e) {
    return json({ error: e.message || 'Invalid input' }, e.status || 500);
  }
}

function validateBlog(b) {
  if (!b.title || !String(b.title).trim()) fail('Title is required');
  const slug = String(b.slug || '').trim() ? slugify(b.slug) : slugify(b.title);
  const published = b.published === true || b.published === 1 || b.published === '1' ? 1 : 0;
  return {
    title: plainText(b.title, 180),
    slug,
    excerpt: plainText(b.excerpt, 600),
    cover_url: assertFieldUrl(b.cover_url ?? b.cover ?? '', 'cover_url'),
    tags: JSON.stringify(cleanTags(b.tags)),
    content_html: sanitizeHtml(b.content_html ?? b.content ?? ''),
    published,
    published_at: String(b.published_at || '').trim().slice(0, 30) || (published ? now() : null),
  };
}

async function upsertBlog(request, env, idOrSlug, isPatch) {
  try {
    let b = await readJsonBody(request);
    if (isPatch) {
      if (!idOrSlug) return json({ error: 'Not found' }, 404);
      const existing = await env.DB.prepare('SELECT * FROM blog_posts WHERE (id = ? OR slug = ?) AND deleted = 0 LIMIT 1')
        .bind(idOrSlug, idOrSlug)
        .first();
      if (!existing) return json({ error: 'Not found' }, 404);
      // Preserve stored slug unless the patch explicitly sets one.
      const merged = { ...mapBlog(existing), ...b, id: existing.id };
      if (b.slug === undefined) merged.slug = existing.slug;
      b = merged;
    }
    const row = validateBlog(b);
    const ts = now();
    if (idOrSlug) {
      const existing = isPatch
        ? await env.DB.prepare('SELECT * FROM blog_posts WHERE id = ? AND deleted = 0 LIMIT 1').bind(b.id).first()
        : await env.DB.prepare('SELECT * FROM blog_posts WHERE (id = ? OR slug = ?) AND deleted = 0 LIMIT 1')
            .bind(idOrSlug, idOrSlug)
            .first();
      if (!existing) return json({ error: 'Not found' }, 404);
      let slug = row.slug;
      if (slug !== existing.slug) {
        const clash = await env.DB.prepare('SELECT id FROM blog_posts WHERE slug = ? AND id != ?')
          .bind(slug, existing.id)
          .first();
        if (clash) slug = `${slug}-${existing.id.slice(0, 6)}`;
      }
      try {
        await env.DB.prepare(
          `UPDATE blog_posts SET title=?, slug=?, excerpt=?, cover_url=?, tags=?, content_html=?, published=?, published_at=?, updated_at=? WHERE id=? AND deleted = 0`
        )
          .bind(row.title, slug, row.excerpt, row.cover_url, row.tags, row.content_html, row.published, row.published_at, ts, existing.id)
          .run();
      } catch (e) {
        // Check-then-act race on slug: retry once with a suffixed slug.
        if (!isUniqueViolation(e)) throw e;
        slug = `${slug}-${uid().slice(0, 6)}`;
        await env.DB.prepare(
          `UPDATE blog_posts SET title=?, slug=?, excerpt=?, cover_url=?, tags=?, content_html=?, published=?, published_at=?, updated_at=? WHERE id=? AND deleted = 0`
        )
          .bind(row.title, slug, row.excerpt, row.cover_url, row.tags, row.content_html, row.published, row.published_at, ts, existing.id)
          .run();
      }
      return json({ ...row, id: existing.id, slug, tags: JSON.parse(row.tags), published: !!row.published, updated_at: ts });
    }
    // Insert: pre-check for a friendly slug, then rely on the UNIQUE
    // constraint as the backstop against races (retry with suffix).
    let slug = row.slug;
    const clash = await env.DB.prepare('SELECT id FROM blog_posts WHERE slug = ?').bind(slug).first();
    if (clash) slug = `${slug}-${uid().slice(0, 6)}`;
    const newId = uid();
    const insertSql =
      `INSERT INTO blog_posts (id, title, slug, excerpt, cover_url, tags, content_html, published, published_at, deleted, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,0,?,?)`;
    try {
      await env.DB.prepare(insertSql)
        .bind(newId, row.title, slug, row.excerpt, row.cover_url, row.tags, row.content_html, row.published, row.published_at, ts, ts)
        .run();
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      slug = `${slug}-${uid().slice(0, 6)}`;
      await env.DB.prepare(insertSql)
        .bind(newId, row.title, slug, row.excerpt, row.cover_url, row.tags, row.content_html, row.published, row.published_at, ts, ts)
        .run();
    }
    return json({ ...row, id: newId, slug, tags: JSON.parse(row.tags), published: !!row.published, created_at: ts, updated_at: ts }, 201);
  } catch (e) {
    return json({ error: e.message || 'Invalid input' }, e.status || 500);
  }
}

/* Soft-delete: DELETE moves rows to trash (recoverable). Permanent deletion
 * requires ?permanent=1 and is only for explicit "delete forever" actions. */
async function softDelete(env, table, idOrSlug) {
  const ts = now();
  if (table === 'blog_posts') {
    const r = await env.DB.prepare(
      'UPDATE blog_posts SET deleted = 1, deleted_at = ?, updated_at = ? WHERE (id = ? OR slug = ?) AND deleted = 0'
    ).bind(ts, ts, idOrSlug, idOrSlug).run();
    return (r.meta?.changes || 0) > 0;
  }
  const r = await env.DB.prepare(
    'UPDATE upcoming_projects SET deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ? AND deleted = 0'
  ).bind(ts, ts, idOrSlug).run();
  return (r.meta?.changes || 0) > 0;
}

async function restoreRow(env, table, idOrSlug) {
  const ts = now();
  if (table === 'blog_posts') {
    const row = await env.DB.prepare('SELECT * FROM blog_posts WHERE (id = ? OR slug = ?) AND deleted = 1 LIMIT 1')
      .bind(idOrSlug, idOrSlug).first();
    if (!row) return null;
    // A live row may have claimed the slug meanwhile — suffix to keep UNIQUE.
    let slug = row.slug;
    const clash = await env.DB.prepare('SELECT id FROM blog_posts WHERE slug = ? AND id != ? AND deleted = 0')
      .bind(slug, row.id).first();
    if (clash) slug = `${slug}-restored-${row.id.slice(0, 6)}`;
    await env.DB.prepare(
      'UPDATE blog_posts SET deleted = 0, deleted_at = NULL, slug = ?, updated_at = ? WHERE id = ?'
    ).bind(slug, ts, row.id).run();
    return { ...mapBlog(row), slug, deleted: false };
  }
  const row = await env.DB.prepare('SELECT * FROM upcoming_projects WHERE id = ? AND deleted = 1 LIMIT 1')
    .bind(idOrSlug).first();
  if (!row) return null;
  await env.DB.prepare(
    'UPDATE upcoming_projects SET deleted = 0, deleted_at = NULL, updated_at = ? WHERE id = ?'
  ).bind(ts, row.id).run();
  return { ...mapUpcoming(row), deleted: false };
}

async function hardDelete(env, table, idOrSlug) {
  if (table === 'blog_posts') {
    const r = await env.DB.prepare('DELETE FROM blog_posts WHERE id = ? OR slug = ?').bind(idOrSlug, idOrSlug).run();
    return (r.meta?.changes || 0) > 0;
  }
  const r = await env.DB.prepare('DELETE FROM upcoming_projects WHERE id = ?').bind(idOrSlug).run();
  return (r.meta?.changes || 0) > 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method.toUpperCase();

    try {
      if (pathname === '/api/health') return json({ ok: true, time: now() });

      if (pathname === '/api/auth/me') {
        const email = await getAdminEmail(request, env);
        return json({ email: email || null, access_configured: configured(env) });
      }

      if (pathname.startsWith('/api/')) {
        if (!env.DB) {
          return json({ error: 'Service unavailable' }, 500);
        }
        await ensureTables(env.DB);

        if (pathname === '/api/upcoming' && method === 'GET') return handleUpcoming(env);
        if (pathname === '/api/blogs' && method === 'GET')
          return handleBlogs(url, env, false);
        if (pathname.startsWith('/api/blogs/') && method === 'GET')
          return handleBlogBySlug(decodeURIComponent(pathname.slice('/api/blogs/'.length)), env);

        if (pathname.startsWith('/api/admin/')) {
          // Every admin endpoint (GET/POST/PUT/PATCH/DELETE) requires
          // a verified Cloudflare Access identity — reads included, because
          // admin list views expose drafts and trashed items.
          let email;
          try {
            email = await requireAdmin(request, env);
          } catch (e) {
            return json({ error: e.message || 'Unauthorized' }, e.status || 401);
          }
          void email;

          const isMutation = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
          // CSRF: mutations must carry a matching same-origin Origin/Referer.
          if (isMutation && !hasValidOrigin(request)) {
            return json({ error: 'Forbidden origin' }, 403);
          }
          // Rate limits: mutations stricter, then reads.
          const rlKind = isMutation ? 'admin_mutation' : 'api';
          const limited = checkRateLimit(request, rlKind);
          if (limited) return limited;

          if (pathname === '/api/admin/upcoming' && method === 'GET') {
            return handleAdminUpcomingList(url, env);
          }
          if (pathname === '/api/admin/upcoming' && method === 'POST') return upsertUpcoming(request, env, null);
          if (pathname.startsWith('/api/admin/upcoming/')) {
            const rest = decodeURIComponent(pathname.slice('/api/admin/upcoming/'.length));
            if (rest.endsWith('/restore') && method === 'POST') {
              const id = rest.slice(0, -'/restore'.length);
              const restored = await restoreRow(env, 'upcoming_projects', id);
              if (!restored) return json({ error: 'Not found' }, 404);
              return json(restored);
            }
            const id = rest;
            if (method === 'PUT' || method === 'PATCH') {
              return upsertUpcoming(request, env, id, method === 'PATCH');
            }
            if (method === 'DELETE') {
              // Default is recoverable soft-delete; ?permanent=1 hard-deletes
              // (admin UI confirms explicitly).
              if (url.searchParams.get('permanent') === '1') {
                const gone = await hardDelete(env, 'upcoming_projects', id);
                if (!gone) return json({ error: 'Not found' }, 404);
                return json({ ok: true, permanent: true });
              }
              const moved = await softDelete(env, 'upcoming_projects', id);
              if (!moved) return json({ error: 'Not found' }, 404);
              return json({ ok: true, deleted: true });
            }
          }
          if (pathname === '/api/admin/blogs' && method === 'GET') return handleBlogs(url, env, true);
          if (pathname === '/api/admin/blogs' && method === 'POST') return upsertBlog(request, env, null);
          if (pathname.startsWith('/api/admin/blogs/')) {
            const rest = decodeURIComponent(pathname.slice('/api/admin/blogs/'.length));
            if (rest.endsWith('/restore') && method === 'POST') {
              const id = rest.slice(0, -'/restore'.length);
              const restored = await restoreRow(env, 'blog_posts', id);
              if (!restored) return json({ error: 'Not found' }, 404);
              return json(restored);
            }
            const id = rest;
            if (method === 'PUT' || method === 'PATCH') {
              return upsertBlog(request, env, id, method === 'PATCH');
            }
            if (method === 'DELETE') {
              if (url.searchParams.get('permanent') === '1') {
                const gone = await hardDelete(env, 'blog_posts', id);
                if (!gone) return json({ error: 'Not found' }, 404);
                return json({ ok: true, permanent: true });
              }
              const moved = await softDelete(env, 'blog_posts', id);
              if (!moved) return json({ error: 'Not found' }, 404);
              return json({ ok: true, deleted: true });
            }
          }
          return json({ error: 'Not found' }, 404);
        }
        const publicLimited = checkRateLimit(request, 'api');
        if (publicLimited) return publicLimited;
        return json({ error: 'Not found' }, 404);
      }

      // Non-API: serve static assets (SPA fallback handled by assets config)
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('Not found', { status: 404 });
    } catch (err) {
      // Client-safe error surface: log diagnostics server-side WITHOUT tokens
      // or personal data (method + path + status only), return generic 500.
      try {
        console.error('api error:', request.method, new URL(request.url).pathname, err && err.status ? err.status : 500);
      } catch {
        /* logging must never break the response */
      }
      const status = err && typeof err.status === 'number' ? err.status : 500;
      if (status !== 500) return json({ error: (err && err.message) || 'Request failed' }, status);
      return json({ error: 'Server error' }, 500);
    }
  },
};
