# CRETURES — Personal Portfolio

A modern, responsive personal portfolio built with **React 18 + Vite**, served by a **single Cloudflare Worker** that also hosts a JSON API backed by **Cloudflare D1** (SQLite). Admin features (upcoming projects, blog) are protected by **Cloudflare Access** verified server-side in the Worker.

## Features

- **Home** (`/`) — full-viewport hero with animated heading mask, philosopher quotes, CTA
- **Portfolio** (`/portfolio`) — profile, skills, experience timeline, featured projects, contact form, **Upcoming Projects** section (live from D1)
- **Gallery** (`/gallery`) — 3D depth carousel (GSAP) with drag/wheel/keyboard navigation over local images
- **Blog** (`/blog`, `/blog/:slug`) — public blog list + reading view rendered from sanitized rich-text HTML
- **Admin** (`/admin`) — protected dashboard: add/edit/delete/restore upcoming projects and blog posts, rich-text editor
- **Dark/light theme toggle**, scroll-to-top button, page loader, responsive navbar (mobile drawer from the right)

## Architecture

```
Browser SPA (React, dist/)  ──single Worker──▶  Cloudflare
                             │                     │
                             ├─ GET/POST/... /api/* ─┼─▶ D1 (projects + blogs)
                             └─ static assets ./dist
```

- One Cloudflare Worker (`worker/index.js`) serves both the built SPA (`./dist`) and the `/api/*` backend — no separate Pages deployment.
- **D1** stores `upcoming_projects` and `blog_posts`; migrations in `migrations/` run remotely before each deploy.
- **Cloudflare Access** is the outer auth layer for `/admin*` and `/api/admin/*`; the Worker performs a second, independent server-side JWT verification (signature via Access JWKS, issuer, audience, expiry, `ADMIN_EMAILS` allowlist).
- Rich-text blog HTML is sanitized server-side (allowlist tags/attributes, safe `href`/`src` schemes, `rel="noopener noreferrer"`).
- State-changing admin routes (POST/PUT/PATCH/DELETE) require a matching same-origin `Origin`/`Referer` header (CSRF protection) and are rate-limited per IP.

## Project structure

```
My_Portfolio/
├── index.html                     # Vite HTML entry
├── package.json                   # scripts + dependencies
├── vite.config.js                 # Vite config (React plugin, port 5501)
├── wrangler.jsonc                 # Worker config: assets, D1 binding, Access vars
├── migrations/                    # D1 SQL migrations (applied with --remote)
│   ├── 0001_init.sql
│   └── 0002_soft_delete.sql
├── worker/
│   └── index.js                   # Cloudflare Worker: API + Access auth + SPA serving
├── test/
│   └── worker.test.js             # node:test security/API test suite
├── public/
│   └── images/                    # Static images served from /images/*
├── src/
│   ├── main.jsx                   # React entry → BrowserRouter → App
│   ├── App.jsx                    # Routes + shared layout components
│   ├── index.css                  # Global styles + theme variables
│   ├── lib/
│   │   ├── api.js                 # API client (D1 via Worker; dev-only localStorage fallback)
│   │   └── auth.js                # useAuth() → /api/auth/me
│   ├── components/
│   │   ├── Navbar.jsx/.css        # Fixed waterfall navbar, mobile drawer from right
│   │   ├── Footer.jsx/.css
│   │   ├── ThemeToggle.jsx/.css   # Light/dark switch (appears after scroll)
│   │   ├── ScrollToTop.jsx/.css
│   │   ├── PageLoader.jsx/.css
│   │   ├── RichTextEditor.jsx/.css# contentEditable editor (bold/italic/H2/H3/lists/links/images)
│   │   ├── UpcomingProjects.jsx/.css  # Public section fed by /api/upcoming
│   │   ├── MaskedHeading/         # reactbits.dev hero mask effect
│   │   └── DepthCarousel/         # reactbits.dev 3D depth gallery (GSAP)
│   └── pages/
│       ├── Home.jsx/.css
│       ├── Portfolio.jsx/.css
│       ├── Gallery.jsx/.css
│       ├── Blog.jsx/.css          # Blog list
│       ├── BlogPost.jsx/.css      # Single post (/blog/:slug)
│       └── Admin.jsx/.css         # Admin dashboard (projects + blogs, trash view)
└── .github/workflows/ci.yml       # lint → build → test → migrations --remote → deploy
```

## Tech stack

| Layer | Tech |
| --- | --- |
| Frontend | React 18, react-router-dom 7, GSAP 3 |
| Build | Vite 8, @vitejs/plugin-react, esbuild |
| Backend | Cloudflare Worker (single deployment) |
| Database | Cloudflare D1 (SQLite) |
| Auth | Cloudflare Access (outer) + Worker JWT verification (inner) |
| Hosting | Cloudflare Workers static assets |

## Getting started

```bash
npm install        # install dependencies
npm run dev        # Vite dev server on http://localhost:5501
```

During local dev the admin dashboard works **from your browser** using a localStorage fallback — the Worker/D1 API is only available when running `wrangler dev`. In production builds (`npm run build`) there is **no** localStorage fallback; API failures show clear error states.

Other scripts:

```bash
npm run dev        # start dev server (port 5501)
npm run build      # production build → dist/
npm run preview    # preview the production build locally
npm run lint       # ESLint over src/
npm test           # node:test security/API tests
```

## Environment & configuration

- `wrangler.jsonc` — Worker name, entry file, static assets (`./dist`, SPA fallback), D1 binding (`DB` → `portfolio-db`), and `vars`:
  - `ACCESS_TEAM_DOMAIN` — your Zero Trust team domain, e.g. `https://yourteam.cloudflareaccess.com`
  - `ACCESS_AUD` — Application Audience tag of the Access app
  - `ADMIN_EMAILS` — comma-separated allowlist (empty = any authenticated Access user)
  - `DEV_ADMIN_BYPASS` — `true` only for local development (never in production)
- CI secrets (never commit values): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- `.env` / `.dev.vars` are gitignored; examples live in `.env.example` and `.dev.vars.example`

To develop against D1 + the Worker locally:

```bash
npx wrangler dev   # serves API + built SPA; run after `npm run build`
```

## Deployment

CI (`.github/workflows/ci.yml`) runs on push to `main`/`master`:

1. **lint** — `npm run lint`
2. **build** — `npm run build`
3. **test** — `npm test`
4. **deploy** — `wrangler d1 migrations apply portfolio-db --remote`, then `wrangler deploy`

First-time setup (one-time, manual):

```bash
npx wrangler d1 create portfolio-db          # paste printed id into wrangler.jsonc
npx wrangler d1 migrations apply portfolio-db --remote
```

Then set the `vars` in `wrangler.jsonc` (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ADMIN_EMAILS`, `DEV_ADMIN_BYPASS=false`) and create a Cloudflare Access application for `/admin*` and `/api/admin/*` in the Zero Trust dashboard.

## API overview

| Method & path | Auth | Description |
| --- | --- | --- |
| `GET /api/health` | public | Health check |
| `GET /api/auth/me` | Access JWT | Current admin email + whether Access is configured |
| `GET /api/upcoming` | public | Published, non-deleted upcoming projects |
| `GET /api/blogs` | public | Published blog posts |
| `GET /api/blogs/:slug` | public | Single published post (sanitized HTML) |
| `GET /api/admin/upcoming` | Access JWT | All projects (active or `?trash=1`) |
| `POST /api/admin/upcoming` | Access JWT + Origin | Create project |
| `PUT/PATCH /api/admin/upcoming/:id` | Access JWT + Origin | Update project |
| `DELETE /api/admin/upcoming/:id` | Access JWT + Origin | Soft-delete (`?permanent=1` hard-deletes) |
| `POST /api/admin/upcoming/:id/restore` | Access JWT + Origin | Restore a trashed project |
| `GET /api/admin/blogs` | Access JWT | All posts (active or `?trash=1`) |
| `POST /api/admin/blogs` | Access JWT + Origin | Create post (unique slug, auto from title) |
| `PUT/PATCH /api/admin/blogs/:id` | Access JWT + Origin | Update post |
| `DELETE /api/admin/blogs/:id` | Access JWT + Origin | Soft-delete (`?permanent=1` hard-deletes) |
| `POST /api/admin/blogs/:id/restore` | Access JWT + Origin | Restore a trashed post |

Validation rules: titles required & trimmed, URLs must be site-relative or `http(s)`/`mailto:` (never `javascript:`, `data:`, or `//`), blog slug unique (auto-suffixed on collision), target dates `YYYY-MM-DD`, progress clamped 0–100, tags ≤ 20, and `content_html` sanitized server-side. DELETE performs a recoverable soft delete by default.

## Security notes

- No credentials, API tokens, or secrets are stored in this repository; CI uses GitHub Secrets.
- Worker errors never expose stack traces, tokens, or DB internals to clients.
- Deletion is soft by default — trashed items are recoverable via the admin "Show trash" view; permanent deletion requires explicit confirmation.
- Existing static assets live in `public/images/` (all compressed under 1 MB); no R2/S3/storage service is configured — image fields accept URLs, including the local `/images/*` path.

## License

MIT — see [LICENSE](LICENSE).
