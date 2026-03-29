-- Fix messages table (add tenant_id) and conversations (add updated_at, deduplicate)
-- Run: psql -U postgres -p 5433 -d navystore_agent -f migrations/007_fix_messages.sql

-- ── Add tenant_id to messages ──────────────────────────────────────────────────
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tenant_id  INTEGER DEFAULT 1;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url  TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS wa_message_id TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read    BOOLEAN DEFAULT false;

-- ── Add updated_at to conversations ───────────────────────────────────────────
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ── Delete duplicate conversations (keep only the first per client) ────────────
DELETE FROM conversations
WHERE id NOT IN (
  SELECT MIN(id) FROM conversations GROUP BY client_id, tenant_id
);

-- ── Update remaining conversations with correct last_message ──────────────────
UPDATE conversations c SET
  last_message = (
    SELECT content FROM messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC LIMIT 1
  ),
  last_message_at = (
    SELECT MAX(created_at) FROM messages m WHERE m.conversation_id = c.id
  )
WHERE EXISTS (SELECT 1 FROM messages WHERE conversation_id = c.id);

SELECT 'Messages and conversations fixed' AS status;
