-- Fix schema: add missing columns to existing tables and seed tenant
-- Run: psql -U postgres -p 5433 -d navystore_agent -f migrations/002_fix_schema.sql

BEGIN;

-- ── Add missing columns to tenants ────────────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS admin_password       TEXT DEFAULT 'admin123';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meta_app_id          TEXT DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meta_app_secret      TEXT DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meta_verify_token    TEXT DEFAULT 'navystore_webhook_2026';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meta_whatsapp_token  TEXT DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meta_phone_number_id TEXT DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS settings             JSONB DEFAULT '{}';

-- ── Add missing columns to products ───────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS compare_price  DECIMAL(10,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls     TEXT[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_kg      DECIMAL(8,3) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rank_tags      TEXT[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS custom_options JSONB DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category       VARCHAR(100) DEFAULT '';

-- ── Create new tables if not exist ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlists (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  client_id  INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, product_id)
);

CREATE TABLE IF NOT EXISTS carts (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  client_id  INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  quantity   INTEGER DEFAULT 1,
  custom_options JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, product_id)
);

CREATE TABLE IF NOT EXISTS bundles (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  description  TEXT DEFAULT '',
  product_ids  INTEGER[] DEFAULT '{}',
  bundle_price DECIMAL(10,2) DEFAULT 0,
  savings      DECIMAL(10,2) DEFAULT 0,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restock_alerts (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  client_id  INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  notified   BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, product_id)
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wishlists_client   ON wishlists(client_id);
CREATE INDEX IF NOT EXISTS idx_carts_client       ON carts(client_id);
CREATE INDEX IF NOT EXISTS idx_bundles_tenant     ON bundles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_restock_client     ON restock_alerts(client_id);
CREATE INDEX IF NOT EXISTS idx_restock_product    ON restock_alerts(product_id);

-- ── Upsert default tenant ──────────────────────────────────────────────────────
INSERT INTO tenants (id, name, admin_password, meta_verify_token, meta_phone_number_id, settings)
VALUES (1, 'NavyStore', 'admin123', 'navystore_webhook_2026', '426900710505586', '{}')
ON CONFLICT (id) DO UPDATE SET
  meta_verify_token    = EXCLUDED.meta_verify_token,
  meta_phone_number_id = EXCLUDED.meta_phone_number_id,
  updated_at           = NOW();

-- ── Upsert staff number ────────────────────────────────────────────────────────
INSERT INTO staff_numbers (tenant_id, phone, name)
VALUES (1, '917978839679', 'Admin')
ON CONFLICT (tenant_id, phone) DO NOTHING;

SELECT 'Schema fix applied successfully' AS status;

COMMIT;
