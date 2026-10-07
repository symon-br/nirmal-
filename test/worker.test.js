/* Security test suite for worker/index.js (runs with `npm test` / node --test).
 * Covers: Access JWT auth (401/403 matrix), admin route protection, Origin
 * checks, prod localStorage behavior, slug uniqueness, HTML sanitization,
 * URL validation, and soft-delete flows. */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker/index.js';

const TEAM = 'https://test-team.cloudflareaccess.com';
const AUD = 'test-audience-tag-123';
const ADMIN = 'admin@example.com';
const ORIGIN = 'https://portal.example';

let KEYPAIR;
let OTHER_KEYPAIR;
let PUBLIC_JWK;

const b64u = (input) => Buffer.from(input).toString('base64url');

async function signJwt(payload, key, kid) {
  const h = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const p = b64u(JSON.stringify(payload));
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${h}.${p}`)
  );
  return `${h}.${p}.${b64u(sig)}`;
}

function basePayload(over = {}) {
  return {
    iss: TEAM,
    aud: [AUD],
    exp: Math.floor(Date.now() / 1000) + 300,
    email: ADMIN,
    ...over,
  };
}

/* ---------- in-memory D1 mock (mirrors the worker's SQL) ---------- */
function makeDb() {
  const tables = { upcoming_projects: [], blog_posts: [] };

  function selUpcoming(sql, params) {
    let rows = tables.upcoming_projects.slice();
    const d1 = sql.includes('deleted = 1');
    const d0 = sql.includes('deleted = 0');
    if (d1 && !d0) rows = rows.filter((r) => r.deleted === 1);
    else if (d0 && !d1) rows = rows.filter((r) => !r.deleted);
    if (sql.includes('published = 1')) rows = rows.filter((r) => r.published === 1);
    if (/WHERE id = \?/.test(sql)) rows = rows.filter((r) => r.id === params[0]);
    if (sql.includes('ORDER BY sort_order ASC')) {
      rows.sort((a, b) => a.sort_order - b.sort_order || (a.created_at < b.created_at ? -1 : 1));
    } else if (sql.includes('ORDER BY updated_at DESC')) {
      rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    } else if (sql.includes('created_at DESC')) {
      rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    }
    if (sql.includes('LIMIT 1')) rows = rows.slice(0, 1);
    return rows.map((r) => ({ ...r }));
  }

  function selBlogs(sql, params) {
    let rows = tables.blog_posts.slice();
    const d1 = sql.includes('deleted = 1');
    const d0 = sql.includes('deleted = 0');
    if (d1 && !d0) rows = rows.filter((r) => r.deleted === 1);
    else if (d0 && !d1) rows = rows.filter((r) => !r.deleted);
    if (sql.includes('published = 1')) rows = rows.filter((r) => r.published === 1);
    if (sql.includes('(id = ? OR slug = ?)')) {
      rows = rows.filter((r) => r.id === params[0] || r.slug === params[1]);
    } else if (sql.includes('slug = ?')) {
      rows = rows.filter((r) => r.slug === params[0]);
      if (sql.includes('id != ?')) rows = rows.filter((r) => r.id !== params[1]);
    } else if (/WHERE id = \?/.test(sql)) {
      rows = rows.filter((r) => r.id === params[0]);
    }
    if (sql.includes('ORDER BY updated_at DESC')) {
      rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    } else if (sql.includes('COALESCE(published_at, created_at) DESC')) {
      const k = (r) => r.published_at || r.created_at;
      rows.sort((a, b) => (k(a) < k(b) ? 1 : -1));
    }
    if (sql.includes('LIMIT 1')) rows = rows.slice(0, 1);
    return rows.map((r) => ({ ...r }));
  }

  function runStmt(sql, params) {
    if (/^\s*(CREATE|ALTER)\b/i.test(sql)) return { meta: { changes: 0 } };
    if (sql.startsWith('INSERT INTO upcoming_projects')) {
      const [id, title, description, status, image_url, link_url, link_label, target_date, tags, progress, published, sort_order, created_at, updated_at] = params;
      tables.upcoming_projects.push({ id, title, description, status, image_url, link_url, link_label, target_date, tags, progress, published, sort_order, deleted: 0, deleted_at: null, created_at, updated_at });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('INSERT INTO blog_posts')) {
      const [id, title, slug, excerpt, cover_url, tags, content_html, published, published_at, created_at, updated_at] = params;
      if (tables.blog_posts.some((r) => r.slug === slug)) {
        throw new Error('UNIQUE constraint failed: blog_posts.slug');
      }
      tables.blog_posts.push({ id, title, slug, excerpt, cover_url, tags, content_html, published, published_at, deleted: 0, deleted_at: null, created_at, updated_at });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('UPDATE upcoming_projects SET title=')) {
      const [title, description, status, image_url, link_url, link_label, target_date, tags, progress, published, sort_order, updated_at, id] = params;
      const r = tables.upcoming_projects.find((x) => x.id === id && !x.deleted);
      if (!r) return { meta: { changes: 0 } };
      Object.assign(r, { title, description, status, image_url, link_url, link_label, target_date, tags, progress, published, sort_order, updated_at });
      return { meta: { changes: 1 } };
    }
    if (sql.includes('upcoming_projects SET deleted = 1')) {
      const r = tables.upcoming_projects.find((x) => x.id === params[2] && !x.deleted);
      if (!r) return { meta: { changes: 0 } };
      Object.assign(r, { deleted: 1, deleted_at: params[0], updated_at: params[1] });
      return { meta: { changes: 1 } };
    }
    if (sql.includes('upcoming_projects SET deleted = 0')) {
      const r = tables.upcoming_projects.find((x) => x.id === params[1]);
      if (!r) return { meta: { changes: 0 } };
      Object.assign(r, { deleted: 0, deleted_at: null, updated_at: params[0] });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('DELETE FROM upcoming_projects')) {
      const n = tables.upcoming_projects.length;
      tables.upcoming_projects = tables.upcoming_projects.filter((x) => x.id !== params[0]);
      return { meta: { changes: n - tables.upcoming_projects.length } };
    }
    if (sql.startsWith('UPDATE blog_posts SET title=')) {
      const [title, slug, excerpt, cover_url, tags, content_html, published, published_at, updated_at, id] = params;
      const r = tables.blog_posts.find((x) => x.id === id && !x.deleted);
      if (!r) return { meta: { changes: 0 } };
      if (tables.blog_posts.some((x) => x.id !== id && x.slug === slug)) {
        throw new Error('UNIQUE constraint failed: blog_posts.slug');
      }
      Object.assign(r, { title, slug, excerpt, cover_url, tags, content_html, published, published_at, updated_at });
      return { meta: { changes: 1 } };
    }
    if (sql.includes('blog_posts SET deleted = 1')) {
      const r = tables.blog_posts.find((x) => (x.id === params[2] || x.slug === params[3]) && !x.deleted);
      if (!r) return { meta: { changes: 0 } };
      Object.assign(r, { deleted: 1, deleted_at: params[0], updated_at: params[1] });
      return { meta: { changes: 1 } };
    }
    if (sql.includes('blog_posts SET deleted = 0')) {
      const r = tables.blog_posts.find((x) => x.id === params[2]);
      if (!r) return { meta: { changes: 0 } };
      Object.assign(r, { deleted: 0, deleted_at: null, slug: params[0], updated_at: params[1] });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('DELETE FROM blog_posts')) {
      const n = tables.blog_posts.length;
      tables.blog_posts = tables.blog_posts.filter((x) => x.id !== params[0] && x.slug !== params[1]);
      return { meta: { changes: n - tables.blog_posts.length } };
    }
    throw new Error(`mock D1: unsupported SQL: ${sql.slice(0, 80)}`);
  }

  function wrap(sql, params) {
    return {
      async run() { return runStmt(sql, params); },
      async all() {
        if (/^\s*(CREATE|ALTER)\b/i.test(sql)) return { results: [] };
        if (sql.includes('FROM upcoming_projects')) return { results: selUpcoming(sql, params) };
        if (sql.includes('FROM blog_posts')) return { results: selBlogs(sql, params) };
        return { results: [] };
      },
      async first() {
        const r = await wrap(sql, params).all();
        return r.results[0] ?? null;
      },
    };
  }

  return {
    tables,
    prepare(sql) {
      const stmt = {
        bind: (...params) => wrap(sql, params),
        run: () => wrap(sql, []).run(),
        all: () => wrap(sql, []).all(),
        first: () => wrap(sql, []).first(),
      };
      return stmt;
    },
  };
}

function makeEnv(over = {}) {
  return {
    DB: makeDb(),
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    ADMIN_EMAILS: ADMIN,
    DEV_ADMIN_BYPASS: 'false',
    ...over,
  };
}

/* Build a Request against the worker. Same-origin Origin is set by default
 * (browsers always send it on mutations); pass origin: null to omit it. */
function api(path, { method = 'GET', body, token, origin = ORIGIN, rawBody, contentType } = {}) {
  const headers = {};
  if (token) headers['Cf-Access-Jwt-Assertion'] = token;
  if (origin !== null) headers['Origin'] = origin;
  const init = { method, headers };
  if (rawBody !== undefined) {
    init.body = rawBody;
    if (contentType) headers['content-type'] = contentType;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return new Request(`${ORIGIN}${path}`, init);
}

const call = (req, env) => worker.fetch(req, env);

describe('worker security', () => {
  before(async () => {
    KEYPAIR = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['sign', 'verify']
    );
    OTHER_KEYPAIR = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['sign', 'verify']
    );
    PUBLIC_JWK = { ...(await crypto.subtle.exportKey('jwk', KEYPAIR.publicKey)), kid: 'test-kid-1' };
    globalThis.fetch = async (url) => {
      if (String(url).includes('/cdn-cgi/access/certs')) {
        return Response.json({ keys: [PUBLIC_JWK] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
  });

  const token = (over, key = KEYPAIR.privateKey, kid = 'test-kid-1') =>
    signJwt(basePayload(over), key, kid);

  it('missing Access JWT → 401', async () => {
    const res = await call(api('/api/admin/blogs'), makeEnv());
    assert.equal(res.status, 401);
  });

  it('invalid JWT signature → 401', async () => {
    const good = await token();
    const tampered = good.slice(0, -2) + (good.endsWith('AA') ? 'BB' : 'AA');
    const res = await call(api('/api/admin/blogs', { token: tampered }), makeEnv());
    assert.equal(res.status, 401);
  });

  it('unknown signing key → 401', async () => {
    const t = await token({}, OTHER_KEYPAIR.privateKey, 'other-kid');
    const res = await call(api('/api/admin/blogs', { token: t }), makeEnv());
    assert.equal(res.status, 401);
  });

  it('wrong issuer → 401', async () => {
    const t = await token({ iss: 'https://evil.cloudflareaccess.com' });
    const res = await call(api('/api/admin/blogs', { token: t }), makeEnv());
    assert.equal(res.status, 401);
  });

  it('wrong audience → 401', async () => {
    const t = await token({ aud: ['wrong-aud'] });
    const res = await call(api('/api/admin/blogs', { token: t }), makeEnv());
    assert.equal(res.status, 401);
  });

  it('expired JWT → 401', async () => {
    const t = await token({ exp: Math.floor(Date.now() / 1000) - 3600 });
    const res = await call(api('/api/admin/blogs', { token: t }), makeEnv());
    assert.equal(res.status, 401);
  });

  it('valid JWT but email not in ADMIN_EMAILS → 403', async () => {
    const t = await token({ email: 'intruder@example.com' });
    const res = await call(api('/api/admin/blogs', { token: t }), makeEnv());
    assert.equal(res.status, 403);
  });

  it('valid admin JWT → allowed (and string aud tolerated)', async () => {
    const t = await token();
    const res = await call(api('/api/admin/blogs', { token: t }), makeEnv());
    assert.equal(res.status, 200);
    const t2 = await token({ aud: AUD });
    const res2 = await call(api('/api/admin/upcoming', { token: t2 }), makeEnv());
    assert.equal(res2.status, 200);
  });

  it('empty ADMIN_EMAILS allows any authenticated Access user', async () => {
    const t = await token({ email: 'anyone@example.com' });
    const res = await call(api('/api/admin/blogs', { token: t }), makeEnv({ ADMIN_EMAILS: '' }));
    assert.equal(res.status, 200);
  });

  it('unauthenticated admin GET → 401', async () => {
    const env = makeEnv();
    for (const p of ['/api/admin/blogs', '/api/admin/upcoming', '/api/admin/blogs?trash=1']) {
      const res = await call(api(p), env);
      assert.equal(res.status, 401, p);
    }
  });

  it('unauthenticated POST/PUT/PATCH/DELETE → 401', async () => {
    const env = makeEnv();
    const cases = [
      api('/api/admin/blogs', { method: 'POST', body: { title: 'x' } }),
      api('/api/admin/blogs/abc', { method: 'PUT', body: { title: 'x' } }),
      api('/api/admin/blogs/abc', { method: 'PATCH', body: { title: 'x' } }),
      api('/api/admin/blogs/abc', { method: 'DELETE' }),
      api('/api/admin/upcoming', { method: 'POST', body: { title: 'x' } }),
      api('/api/admin/upcoming/abc', { method: 'DELETE' }),
      api('/api/admin/blogs/abc/restore', { method: 'POST' }),
    ];
    for (const req of cases) {
      const res = await call(req, env);
      assert.equal(res.status, 401, `${req.method} ${new URL(req.url).pathname}`);
    }
  });

  it('mutation with foreign Origin → 403; missing Origin → 403', async () => {
    const env = makeEnv();
    const t = await token();
    const evil = await call(
      api('/api/admin/blogs', { method: 'POST', body: { title: 'x' }, token: t, origin: 'https://evil.example' }),
      env
    );
    assert.equal(evil.status, 403);
    const none = await call(
      api('/api/admin/blogs', { method: 'POST', body: { title: 'x' }, token: t, origin: null }),
      env
    );
    assert.equal(none.status, 403);
  });

  it('malformed JSON body → 400', async () => {
    const env = makeEnv();
    const t = await token();
    const req = new Request(`${ORIGIN}/api/admin/blogs`, {
      method: 'POST',
      headers: { 'Cf-Access-Jwt-Assertion': t, Origin: ORIGIN, 'content-type': 'application/json' },
      body: '{not json',
    });
    const res = await call(req, env);
    assert.equal(res.status, 400);
  });

  it('duplicate blog slug → handled safely with unique suffix', async () => {
    const env = makeEnv();
    const t = await token();
    const mk = () => api('/api/admin/blogs', { method: 'POST', body: { title: 'Hello World', content_html: '<p>hi</p>' }, token: t });
    const res1 = await call(mk(), env);
    const res2 = await call(mk(), env);
    assert.equal(res1.status, 201);
    assert.equal(res2.status, 201);
    const b1 = await res1.json();
    const b2 = await res2.json();
    assert.equal(b1.slug, 'hello-world');
    assert.notEqual(b2.slug, 'hello-world');
    assert.match(b2.slug, /^hello-world-/);
  });

  it('malicious rich-text HTML → sanitized on write and read', async () => {
    const env = makeEnv();
    const t = await token();
    const evil = `<p>ok</p><script>alert(1)</script><style>body{}</style>`
      + `<iframe src="https://evil.example"></iframe><!-- secret -->`
      + `<p onclick="alert(2)" style="color:red">x</p>`
      + `<a href="javascript:alert(3)">bad</a><a href="https://good.example">good</a>`
      + `<img src="https://good.example/i.png" onerror="alert(4)" alt="i">`
      + `<img src="data:image/png;base64,AAA">`;
    const res = await call(
      api('/api/admin/blogs', { method: 'POST', body: { title: 'XSS', content_html: evil, published: true }, token: t }),
      env
    );
    assert.equal(res.status, 201);
    const saved = await res.json();
    for (const bad of ['<script', '<iframe', '<style', 'onclick', 'onerror', 'javascript:', '<!--', 'data:image']) {
      assert.doesNotMatch(saved.content_html, new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `stored HTML contains ${bad}`);
    }
    assert.match(saved.content_html, /href="https:\/\/good\.example"/);
    assert.match(saved.content_html, /rel="noopener noreferrer"/);
    const pub = await call(api(`/api/blogs/${saved.slug}`), env);
    assert.equal(pub.status, 200);
    const pubBody = await pub.json();
    assert.doesNotMatch(pubBody.content_html, /<script/i);
  });

  it('dangerous URLs → 422', async () => {
    const env = makeEnv();
    const t = await token();
    for (const link of ['javascript:alert(1)', 'data:text/html,hi', '//evil.example/x', 'java\tscript:alert(1)']) {
      const res = await call(
        api('/api/admin/upcoming', { method: 'POST', body: { title: 'P', link_url: link }, token: t }),
        env
      );
      assert.equal(res.status, 422, link);
    }
    const img = await call(
      api('/api/admin/blogs', { method: 'POST', body: { title: 'B', cover_url: 'data:image/png;base64,AAA' }, token: t }),
      env
    );
    assert.equal(img.status, 422);
  });

  it('safe URLs accepted (relative, http/https, mailto for links)', async () => {
    const env = makeEnv();
    const t = await token();
    const res = await call(
      api('/api/admin/upcoming', {
        method: 'POST',
        body: { title: 'P', link_url: 'https://good.example/a', image_url: '/images/IMG1.jpg' },
        token: t,
      }),
      env
    );
    assert.equal(res.status, 201);
  });

  it('soft-delete → hidden publicly, restorable, then permanently deletable', async () => {
    const env = makeEnv();
    const t = await token();
    const create = await call(
      api('/api/admin/blogs', { method: 'POST', body: { title: 'Gone', published: true, content_html: '<p>x</p>' }, token: t }),
      env
    );
    const { id, slug } = await create.json();
    const del = await call(api(`/api/admin/blogs/${id}`, { method: 'DELETE', token: t }), env);
    assert.deepEqual(await del.json(), { ok: true, deleted: true });
    const pub = await call(api(`/api/blogs/${slug}`), env);
    assert.equal(pub.status, 404);
    const trash = await call(api('/api/admin/blogs?trash=1', { token: t }), env);
    assert.equal((await trash.json()).length, 1);
    const main = await call(api('/api/admin/blogs', { token: t }), env);
    assert.equal((await main.json()).length, 0);
    const restore = await call(api(`/api/admin/blogs/${id}/restore`, { method: 'POST', token: t }), env);
    assert.equal(restore.status, 200);
    const pub2 = await call(api(`/api/blogs/${slug}`), env);
    assert.equal(pub2.status, 200);
    await call(api(`/api/admin/blogs/${id}`, { method: 'DELETE', token: t }), env);
    const purge = await call(api(`/api/admin/blogs/${id}?permanent=1`, { method: 'DELETE', token: t }), env);
    assert.deepEqual(await purge.json(), { ok: true, permanent: true });
    const trash2 = await call(api('/api/admin/blogs?trash=1', { token: t }), env);
    assert.equal((await trash2.json()).length, 0);
  });

  it('public routes need no auth and never expose drafts', async () => {
    const env = makeEnv();
    const t = await token();
    await call(api('/api/admin/blogs', { method: 'POST', body: { title: 'Draft', published: false }, token: t }), env);
    const list = await call(api('/api/blogs'), env);
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), []);
    const upcoming = await call(api('/api/upcoming?published=0'), env);
    assert.equal(upcoming.status, 200);
    assert.deepEqual(await upcoming.json(), []);
  });

  it('production API failure does NOT fall back to localStorage', async () => {
    globalThis.__CRETURES_PROD = true;
    try {
      const { fetchBlogs, adminSaveUpcoming } = await import('../src/lib/api.js');
      const calls = [];
      const seed = { upcoming: [{ id: 'u1', title: 'Local', published: true }], blogs: [{ id: 'b1', slug: 'local', title: 'Local', published: true }] };
      globalThis.localStorage = {
        _s: JSON.stringify(seed),
        getItem(k) { return k === 'cretures_admin_v1' ? this._s : null; },
        setItem(k, v) { calls.push([k, v]); this._s = v; },
        removeItem() {},
      };
      const origFetch = globalThis.fetch;
      globalThis.fetch = async () => { throw new Error('network down'); };
      try {
        await assert.rejects(fetchBlogs(), /API unavailable/);
        await assert.rejects(adminSaveUpcoming({ title: 'P' }), /API unavailable/);
      } finally {
        globalThis.fetch = origFetch;
      }
      assert.equal(calls.length, 0, 'production must never write the dev fallback store');
      assert.equal(JSON.parse(globalThis.localStorage._s).upcoming.length, 1, 'seed store untouched');
    } finally {
      delete globalThis.__CRETURES_PROD;
      delete globalThis.localStorage;
    }
  });
});
