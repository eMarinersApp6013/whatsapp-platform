-- Migration 012: Razorpay payment integration
-- Adds payment config fields to tenants table
-- Adds payment tracking fields to orders table

-- ── Tenants: Razorpay credentials ────────────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS razorpay_key_id        VARCHAR(120) DEFAULT NULL;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS razorpay_key_secret     VARCHAR(120) DEFAULT NULL;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS razorpay_webhook_secret VARCHAR(120) DEFAULT NULL;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_enabled         BOOLEAN      DEFAULT false;

-- ── Orders: payment tracking fields ──────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method    VARCHAR(30)   DEFAULT 'COD';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status    VARCHAR(30)   DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_link_id   VARCHAR(120)  DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_link_url  TEXT          DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(120)  DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(120) DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at           TIMESTAMPTZ   DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address  TEXT          DEFAULT NULL;
