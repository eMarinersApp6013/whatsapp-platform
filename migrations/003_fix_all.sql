-- Fix all schema issues (safe to run multiple times)
-- Run: psql -U postgres -p 5433 -d navystore_agent -f migrations/003_fix_all.sql

-- ── Tenants: add ALL missing columns ──────────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS admin_password       TEXT DEFAULT 'admin123';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meta_app_id          TEXT DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meta_app_secret      TEXT DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meta_verify_token    TEXT DEFAULT 'navystore_webhook_2026';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meta_whatsapp_token  TEXT DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meta_phone_number_id TEXT DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS settings             JSONB DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT NOW();

-- ── Products: add missing columns ─────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS compare_price  DECIMAL(10,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls     TEXT[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_kg      DECIMAL(8,3) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rank_tags      TEXT[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS custom_options JSONB DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category       VARCHAR(100) DEFAULT '';

-- ── New tables ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlists (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  client_id  INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, product_id)
);

CREATE TABLE IF NOT EXISTS carts (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  client_id      INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  product_id     INTEGER REFERENCES products(id) ON DELETE CASCADE,
  quantity       INTEGER DEFAULT 1,
  custom_options JSONB DEFAULT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
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
CREATE INDEX IF NOT EXISTS idx_wishlists_client  ON wishlists(client_id);
CREATE INDEX IF NOT EXISTS idx_carts_client      ON carts(client_id);
CREATE INDEX IF NOT EXISTS idx_bundles_tenant    ON bundles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_restock_client    ON restock_alerts(client_id);
CREATE INDEX IF NOT EXISTS idx_restock_product   ON restock_alerts(product_id);

-- ── Seed / update tenant ───────────────────────────────────────────────────────
INSERT INTO tenants (id, name, admin_password, meta_verify_token, meta_phone_number_id, settings, updated_at)
VALUES (1, 'NavyStore', 'admin123', 'navystore_webhook_2026', '426900710505586', '{}', NOW())
ON CONFLICT (id) DO UPDATE SET
  admin_password       = 'admin123',
  meta_verify_token    = 'navystore_webhook_2026',
  meta_phone_number_id = '426900710505586',
  updated_at           = NOW();

-- ── Staff number ───────────────────────────────────────────────────────────────
INSERT INTO staff_numbers (tenant_id, phone, name)
VALUES (1, '917978839679', 'Admin')
ON CONFLICT (tenant_id, phone) DO NOTHING;

SELECT 'All fixes applied successfully' AS status;
