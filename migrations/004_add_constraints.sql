-- Add missing UNIQUE constraints and fix any remaining column issues
-- Run: psql -U postgres -p 5433 -d navystore_agent -f migrations/004_add_constraints.sql

-- ── Add UNIQUE constraint to staff_numbers if missing ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'staff_numbers_tenant_id_phone_key'
      AND conrelid = 'staff_numbers'::regclass
  ) THEN
    ALTER TABLE staff_numbers ADD CONSTRAINT staff_numbers_tenant_id_phone_key UNIQUE (tenant_id, phone);
  END IF;
END $$;

-- ── Add UNIQUE constraint to products(tenant_id, sku) if missing ──────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_tenant_id_sku_key'
      AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_tenant_id_sku_key UNIQUE (tenant_id, sku);
  END IF;
END $$;

-- ── Verify tenants has all meta columns ───────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meta_app_id          TEXT DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meta_app_secret      TEXT DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meta_verify_token    TEXT DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meta_whatsapp_token  TEXT DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meta_phone_number_id TEXT DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS settings             JSONB DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS admin_password       TEXT DEFAULT 'admin123';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT NOW();

-- ── Update tenant meta fields ─────────────────────────────────────────────────
UPDATE tenants SET
  meta_verify_token    = 'navystore_webhook_2026',
  meta_phone_number_id = '426900710505586',
  updated_at           = NOW()
WHERE id = 1;

-- ── Seed staff number (now constraint exists) ─────────────────────────────────
INSERT INTO staff_numbers (tenant_id, phone, name)
VALUES (1, '917978839679', 'Admin')
ON CONFLICT (tenant_id, phone) DO NOTHING;

SELECT 'Constraints and columns fixed' AS status;
