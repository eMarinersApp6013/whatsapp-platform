-- Migration 011: Automation tables + product enhancements
-- message_jobs: AI keep-in-touch automation queue
-- product_views: tracks page views for smart ranking
-- products: add hsn_code, customization_fee columns

-- ── Clients: meta column for checkout state ─────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}';

-- ── Product enhancements ──────────────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_code       VARCHAR(8)        DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS customization_fee NUMERIC(10,2)  DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS view_count     INTEGER           DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS wishlist_count INTEGER           DEFAULT 0;

-- ── Product views (for smart ranking) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_views (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL DEFAULT 1,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  client_id   INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_views_product   ON product_views(product_id);
CREATE INDEX IF NOT EXISTS idx_product_views_client    ON product_views(client_id);
CREATE INDEX IF NOT EXISTS idx_product_views_viewed_at ON product_views(viewed_at);

-- ── Message jobs (AI keep-in-touch) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_jobs (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER     NOT NULL DEFAULT 1,
  client_id    INTEGER     REFERENCES clients(id) ON DELETE CASCADE,
  client_phone VARCHAR(20),
  type         VARCHAR(50) NOT NULL,   -- cart_abandonment | wishlist_nudge | reorder_reminder | special_day
  payload      JSONB       DEFAULT '{}',
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at      TIMESTAMPTZ,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | sent | failed | skipped
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_message_jobs_status    ON message_jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_message_jobs_client    ON message_jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_message_jobs_type      ON message_jobs(type);
