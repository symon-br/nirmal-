-- Soft-delete support + query indexes. Applied remotely via:
--   wrangler d1 migrations apply portfolio-db --remote
ALTER TABLE upcoming_projects ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE upcoming_projects ADD COLUMN deleted_at TEXT;
ALTER TABLE blog_posts ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blog_posts ADD COLUMN deleted_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_slug_unique ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_visible ON blog_posts(published, deleted, published_at);
CREATE INDEX IF NOT EXISTS idx_upcoming_visible ON upcoming_projects(published, deleted, sort_order);
