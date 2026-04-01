-- Migration 010: Agents, API Keys, Outgoing Webhooks
-- Run: psql -U postgres -p 5433 -d navystore_agent -f migrations/010_agents_apikeys_webhooks.sql

-- ── Agents ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER NOT NULL DEFAULT 1,
  name       VARCHAR(255) NOT NULL,
  phone      VARCHAR(50),
  email      VARCHAR(255),
  role       VARCHAR(50) NOT NULL DEFAULT 'agent',   -- admin | agent | supervisor
  status     VARCHAR(50) NOT NULL DEFAULT 'offline', -- online | busy | offline
  avatar     VARCHAR(500),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_email ON agents(tenant_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);

-- Seed default admin agent
INSERT INTO agents (tenant_id, name, role, status)
  VALUES (1, 'Admin', 'admin', 'online')
  ON CONFLICT DO NOTHING;

-- ── API Keys ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL DEFAULT 1,
  name         VARCHAR(255) NOT NULL,
  key_prefix   VARCHAR(10) NOT NULL,             -- first 8 chars shown to user
  key_hash     VARCHAR(255) NOT NULL UNIQUE,     -- SHA-256 hash stored
  permissions  TEXT[] NOT NULL DEFAULT ARRAY['read'],  -- read | write | admin
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active    BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash   ON api_keys(key_hash);

-- ── Outgoing Webhook Endpoints ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER NOT NULL DEFAULT 1,
  name       VARCHAR(255) NOT NULL,
  url        VARCHAR(1000) NOT NULL,
  secret     VARCHAR(255),                    -- HMAC-SHA256 signing secret
  events     TEXT[] NOT NULL DEFAULT ARRAY['message.received', 'conversation.resolved'],
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_triggered_at TIMESTAMPTZ,
  last_status INTEGER                         -- last HTTP response code
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant ON webhook_endpoints(tenant_id);

-- ── Conversations: add resolved_at, reopened_at ──────────────────────────────
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS resolved_by VARCHAR(255);
