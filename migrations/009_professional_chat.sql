-- Professional Chat Features: Labels, Notes, Canned Responses, Priority, Unread
-- Run: psql -U postgres -p 5433 -d navystore_agent -f migrations/009_professional_chat.sql

-- Internal notes (private agent comments on conversation)
CREATE TABLE IF NOT EXISTS conversation_notes (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  agent_name      VARCHAR(100) DEFAULT 'Admin',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Canned responses (quick reply templates)
CREATE TABLE IF NOT EXISTS canned_responses (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER DEFAULT 1,
  shortcut    VARCHAR(50),
  title       VARCHAR(255) NOT NULL,
  content     TEXT NOT NULL,
  category    VARCHAR(100) DEFAULT 'general',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation labels
CREATE TABLE IF NOT EXISTS labels (
  id        SERIAL PRIMARY KEY,
  tenant_id INTEGER DEFAULT 1,
  name      VARCHAR(100) NOT NULL,
  color     VARCHAR(7) DEFAULT '#25d366',
  UNIQUE(tenant_id, name)
);

-- Add fields to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_to  VARCHAR(100);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_starred   BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS priority     VARCHAR(20) DEFAULT 'normal';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS label_ids    INTEGER[] DEFAULT '{}';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0;

-- Add is_note flag to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_note BOOLEAN DEFAULT false;

-- Seed default labels
INSERT INTO labels (tenant_id, name, color) VALUES
  (1, 'Sales',    '#25d366'),
  (1, 'Support',  '#3182ce'),
  (1, 'VIP',      '#d69e2e'),
  (1, 'Returns',  '#e53e3e'),
  (1, 'Follow-up','#805ad5')
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Seed default canned responses
INSERT INTO canned_responses (tenant_id, shortcut, title, content, category) VALUES
  (1, 'greet',    'Welcome Greeting',  'Hello! Welcome to NavyStore 🙏 How can I help you today?', 'greetings'),
  (1, 'thanks',   'Thank You',         'Thank you for contacting us! Is there anything else I can help you with?', 'greetings'),
  (1, 'wait',     'Please Wait',       'Please give me a moment to check this for you. Thank you for your patience 🙏', 'support'),
  (1, 'shipping', 'Shipping Info',     'We offer free shipping on orders above ₹999. Standard delivery takes 3-5 business days.', 'info'),
  (1, 'return',   'Return Policy',     'We have a 7-day return policy. Items must be unused and in original packaging. Please share your order number to initiate a return.', 'support'),
  (1, 'hours',    'Business Hours',    'Our support team is available Mon-Sat, 9 AM to 6 PM IST. We will respond to your query shortly!', 'info'),
  (1, 'sorry',    'Apology',           'We sincerely apologize for the inconvenience caused. We will resolve this at the earliest! 🙏', 'support')
ON CONFLICT DO NOTHING;

SELECT 'Professional chat features ready' AS status;
