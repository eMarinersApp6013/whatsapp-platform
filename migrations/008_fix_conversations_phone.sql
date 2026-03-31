-- Fix conversations table: make phone nullable, fix verify token default
-- Run: psql -U postgres -p 5433 -d navystore_agent -f migrations/008_fix_conversations_phone.sql

-- Make phone column nullable (was NOT NULL, blocking new conversation inserts)
ALTER TABLE conversations ALTER COLUMN phone DROP NOT NULL;

-- Backfill phone from clients table where missing
UPDATE conversations c
SET phone = cl.phone
FROM clients cl
WHERE c.client_id = cl.id AND c.phone IS NULL;

SELECT 'Conversations phone column fixed' AS status;
