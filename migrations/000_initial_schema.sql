-- NavyStore WhatsApp Platform — Initial Schema
-- Run: psql -U postgres -p 5433 -d navystore_agent -f migrations/000_initial_schema.sql

BEGIN;

-- ── Tenants ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(255) NOT NULL DEFAULT 'NavyStore',
  admin_password        TEXT DEFAULT 'admin123',
  meta_app_id           TEXT DEFAULT '',
  meta_app_secret       TEXT DEFAULT '',
  meta_verify_token     TEXT DEFAULT 'navystore_webhook_verify_2024',
  meta_whatsapp_token   TEXT DEFAULT '',
  meta_phone_number_id  TEXT DEFAULT '',
  settings              JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── Staff Numbers ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_numbers (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  phone      VARCHAR(20) NOT NULL,
  name       VARCHAR(255) DEFAULT 'Staff',
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, phone)
);

-- ── Clients (WhatsApp customers) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  phone      VARCHAR(20) NOT NULL,
  name       VARCHAR(255) DEFAULT '',
  email      VARCHAR(255) DEFAULT '',
  address    TEXT DEFAULT '',
  city       VARCHAR(100) DEFAULT '',
  state      VARCHAR(100) DEFAULT '',
  pincode    VARCHAR(10) DEFAULT '',
  tags       TEXT[] DEFAULT '{}',
  notes      TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, phone)
);

-- ── Conversations ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id               SERIAL PRIMARY KEY,
  tenant_id        INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  client_id        INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  status           VARCHAR(50) DEFAULT 'open',  -- open, resolved, pending
  last_message     TEXT DEFAULT '',
  last_message_at  TIMESTAMPTZ DEFAULT NOW(),
  assigned_to      VARCHAR(20) DEFAULT '',
  labels           TEXT[] DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Messages ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id               SERIAL PRIMARY KEY,
  conversation_id  INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  tenant_id        INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  direction        VARCHAR(10) NOT NULL,  -- in / out
  message_type     VARCHAR(50) DEFAULT 'text',
  content          TEXT DEFAULT '',
  media_url        TEXT DEFAULT '',
  wa_message_id    VARCHAR(255) DEFAULT '',
  status           VARCHAR(50) DEFAULT 'sent',  -- sent, delivered, read, failed
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Products ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  sku            VARCHAR(100) DEFAULT '',
  name           VARCHAR(255) NOT NULL,
  description    TEXT DEFAULT '',
  price          DECIMAL(10,2) NOT NULL DEFAULT 0,
  compare_price  DECIMAL(10,2) DEFAULT 0,
  cost_price     DECIMAL(10,2) DEFAULT 0,
  stock_qty      INTEGER DEFAULT 0,
  category       VARCHAR(255) DEFAULT '',
  image_urls     TEXT[] DEFAULT '{}',
  weight_kg      DECIMAL(8,3) DEFAULT 0,
  rank_tags      TEXT[] DEFAULT '{}',
  custom_options JSONB DEFAULT NULL,
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Orders ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  client_id      INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  order_number   VARCHAR(50) DEFAULT '',
  status         VARCHAR(50) DEFAULT 'pending',  -- pending, confirmed, shipped, delivered, cancelled
  items          JSONB DEFAULT '[]',
  subtotal       DECIMAL(10,2) DEFAULT 0,
  shipping_cost  DECIMAL(10,2) DEFAULT 0,
  discount       DECIMAL(10,2) DEFAULT 0,
  total_amount   DECIMAL(10,2) DEFAULT 0,
  payment_status VARCHAR(50) DEFAULT 'pending',  -- pending, paid, failed, refunded
  payment_link   TEXT DEFAULT '',
  courier        VARCHAR(100) DEFAULT '',
  tracking_id    VARCHAR(100) DEFAULT '',
  shipping_addr  JSONB DEFAULT '{}',
  notes          TEXT DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Courier Slips ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courier_slips (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  order_id    INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  courier     VARCHAR(100) DEFAULT '',
  tracking_id VARCHAR(100) DEFAULT '',
  label_url   TEXT DEFAULT '',
  slip_data   JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Shipping Rates ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipping_rates (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  zone         VARCHAR(100) NOT NULL,
  states       TEXT[] DEFAULT '{}',
  rate_500g    DECIMAL(8,2) DEFAULT 0,
  rate_1kg     DECIMAL(8,2) DEFAULT 0,
  rate_2kg     DECIMAL(8,2) DEFAULT 0,
  per_kg_extra DECIMAL(8,2) DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Broadcasts ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcasts (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(255) DEFAULT '',
  message      TEXT DEFAULT '',
  template     VARCHAR(255) DEFAULT '',
  recipients   TEXT[] DEFAULT '{}',
  sent_count   INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status       VARCHAR(50) DEFAULT 'draft',  -- draft, sending, done, failed
  scheduled_at TIMESTAMPTZ DEFAULT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Support Tickets ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  client_id   INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  subject     VARCHAR(255) DEFAULT '',
  status      VARCHAR(50) DEFAULT 'open',
  priority    VARCHAR(20) DEFAULT 'medium',
  messages    JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Wishlists ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlists (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  client_id  INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, client_id, product_id)
);

-- ── Persistent Carts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carts (
  id               SERIAL PRIMARY KEY,
  tenant_id        INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  client_id        INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  items            JSONB DEFAULT '[]',
  discount_percent DECIMAL(5,2) DEFAULT 0,
  status           VARCHAR(50) DEFAULT 'active',
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, client_id)
);

-- ── Bundles ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bundles (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  description  TEXT DEFAULT '',
  product_ids  INTEGER[] NOT NULL DEFAULT '{}',
  bundle_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  savings      DECIMAL(10,2) DEFAULT 0,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Restock Alerts ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restock_alerts (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  client_id  INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  notified   BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, client_id, product_id)
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversations_tenant    ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_client    ON conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation   ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant           ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_client           ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant         ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone           ON clients(phone);

-- ── Seed: Default tenant ───────────────────────────────────────────────────────
INSERT INTO tenants (name, admin_password, meta_verify_token)
VALUES ('NavyStore', 'admin123', 'navystore_webhook_verify_2024')
ON CONFLICT DO NOTHING;

-- ── Seed: Default staff ────────────────────────────────────────────────────────
INSERT INTO staff_numbers (tenant_id, phone, name, is_active)
VALUES (1, '7978839679', 'Admin', true)
ON CONFLICT DO NOTHING;

COMMIT;

SELECT 'Schema created successfully' AS status;
