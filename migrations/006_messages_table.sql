-- Create messages table and fix conversations columns
-- Run: psql -U postgres -p 5433 -d navystore_agent -f migrations/006_messages_table.sql

-- ── Messages table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  direction       VARCHAR(10) DEFAULT 'inbound',  -- inbound / outbound
  message_type    VARCHAR(50) DEFAULT 'text',      -- text / image / audio / button
  content         TEXT DEFAULT '',
  media_url       TEXT DEFAULT '',
  wa_message_id   TEXT DEFAULT '',
  is_read         BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created      ON messages(created_at DESC);

-- ── Conversations: add missing columns ────────────────────────────────────────
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS client_id      INTEGER REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message   TEXT DEFAULT '';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS status         VARCHAR(20) DEFAULT 'open';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tenant_id      INTEGER DEFAULT 1;

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversations_tenant  ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_client  ON conversations(client_id);

SELECT 'Messages table and conversations columns ready' AS status;
