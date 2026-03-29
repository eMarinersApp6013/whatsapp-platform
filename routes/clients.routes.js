const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');

// In-memory fallback store (used when DB is unavailable)
let conversationStore = [];

// Helper: merge DB conversations with in-memory store
async function getConversations({ search, status, page = 1, limit = 40 }) {
  try {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = ['1=1'];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(cu.name ILIKE $${params.length} OR cu.phone ILIKE $${params.length} OR c.last_message ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`c.status = $${params.length}`);
    }

    const where = conditions.join(' AND ');
    const { rows } = await pool.query(
      `SELECT c.id, c.status, c.last_message, c.last_message_at, c.created_at,
              cu.name, cu.phone, cu.id as customer_id
       FROM conversations c
       JOIN customers cu ON c.customer_id = cu.id
       WHERE ${where}
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const countRes = await pool.query(`SELECT COUNT(*) FROM conversations c JOIN customers cu ON c.customer_id = cu.id WHERE ${where}`, params);
    return { rows, total: parseInt(countRes.rows[0].count) };
  } catch (_err) {
    // Fallback to in-memory
    return { rows: conversationStore, total: conversationStore.length };
  }
}

// ─── GET /api/clients ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 40 } = req.query;
    const { rows, total } = await getConversations({ search, status, page, limit });
    return res.json({
      success: true,
      data: rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/clients/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.status, c.last_message, c.last_message_at, c.created_at,
              cu.name, cu.phone, cu.id as customer_id
       FROM conversations c JOIN customers cu ON c.customer_id = cu.id
       WHERE c.id = $1`, [req.params.id]
    );
    const client = rows[0] || conversationStore.find(c => c.id === req.params.id);
    if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
    return res.json({ success: true, data: client });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/clients/:id/messages ───────────────────────────────────────────
router.get('/:id/messages', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    // Fallback to in-memory
    const client = conversationStore.find(c => c.id === req.params.id);
    return res.json({ success: true, data: client?.messages || [] });
  }
});

// ─── PATCH /api/clients/:id/status ───────────────────────────────────────────
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(
      'UPDATE conversations SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (rows.length) return res.json({ success: true, data: rows[0] });
    // Fallback to in-memory
    const idx = conversationStore.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Conversation not found' });
    conversationStore[idx].status = status;
    return res.json({ success: true, data: conversationStore[idx] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/clients/:id/messages ──────────────────────────────────────────
router.post('/:id/messages', async (req, res) => {
  try {
    const idx = conversationStore.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Client not found' });

    const msg = {
      id:        Date.now().toString(),
      type:      req.body.type || 'reply',   // 'reply' | 'note'
      body:      req.body.body,
      from:      'agent',
      timestamp: new Date().toISOString(),
    };
    conversationStore[idx].messages = conversationStore[idx].messages || [];
    conversationStore[idx].messages.push(msg);
    conversationStore[idx].last_message    = msg.body;
    conversationStore[idx].last_message_at = msg.timestamp;

    return res.json({ success: true, data: msg });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /api/clients/:id/labels ───────────────────────────────────────────
router.patch('/:id/labels', async (req, res) => {
  try {
    const idx = conversationStore.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Client not found' });
    conversationStore[idx].labels = req.body.labels || [];
    return res.json({ success: true, data: conversationStore[idx].labels });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/clients/:id/reply ─────────────────────────────────────────────
// Sends a WhatsApp reply to the customer
router.post('/:id/reply', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, message: 'content required' });

    const idx = conversationStore.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Client not found' });

    const msg = {
      id:         Date.now().toString(),
      direction:  'outbound',
      content,
      created_at: new Date().toISOString(),
    };
    conversationStore[idx].messages = conversationStore[idx].messages || [];
    conversationStore[idx].messages.push(msg);
    conversationStore[idx].last_message    = content;
    conversationStore[idx].last_message_at = msg.created_at;

    // Try to send via Meta API if credentials are available
    try {
      const pool = require('../config/db');
      const { sendWhatsAppMessage } = require('./webhook.routes');
      const tenant = await pool.query('SELECT * FROM tenants WHERE id = 1');
      const t = tenant.rows[0];
      if (t?.meta_whatsapp_token && t.meta_whatsapp_token !== 'FILL_LATER' && t.meta_phone_number_id) {
        const customerPhone = conversationStore[idx].phone;
        await sendWhatsAppMessage(customerPhone, content, t.meta_phone_number_id, t.meta_whatsapp_token);
      }
    } catch (_e) { /* Meta not configured */ }

    return res.json({ success: true, data: msg });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
// Export store so socket.io handlers can push real WA messages into it
module.exports.conversationStore = conversationStore;
