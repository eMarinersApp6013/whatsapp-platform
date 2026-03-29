'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');

// ─── GET /api/clients (conversations list) ────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 40 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = ['c.tenant_id = $1'];
    const params = [1];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(cl.name ILIKE $${params.length} OR cl.phone ILIKE $${params.length} OR c.last_message ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`c.status = $${params.length}`);
    }

    const where = conditions.join(' AND ');
    const { rows } = await pool.query(
      `SELECT c.id, c.status, c.last_message, c.last_message_at, c.created_at,
              cl.name, cl.phone, cl.id as client_id
       FROM conversations c
       LEFT JOIN clients cl ON c.client_id = cl.id
       WHERE ${where}
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM conversations c LEFT JOIN clients cl ON c.client_id = cl.id WHERE ${where}`,
      params
    );
    return res.json({
      success: true,
      data: rows,
      pagination: {
        total: parseInt(countRes.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit))
      },
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
              cl.name, cl.phone, cl.id as client_id
       FROM conversations c
       LEFT JOIN clients cl ON c.client_id = cl.id
       WHERE c.id = $1`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: rows[0] });
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
    return res.status(500).json({ success: false, message: err.message });
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
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/clients/:id/reply ─────────────────────────────────────────────
router.post('/:id/reply', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, message: 'content required' });

    // Get conversation + client phone
    const { rows } = await pool.query(
      `SELECT c.id, cl.phone FROM conversations c JOIN clients cl ON c.client_id = cl.id WHERE c.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });

    // Save message to DB
    const { rows: msgRows } = await pool.query(
      `INSERT INTO messages (conversation_id, direction, message_type, content, created_at)
       VALUES ($1, 'outbound', 'text', $2, NOW()) RETURNING *`,
      [req.params.id, content]
    );
    await pool.query(
      'UPDATE conversations SET last_message = $1, last_message_at = NOW() WHERE id = $2',
      [content, req.params.id]
    );

    // Send via Meta API
    try {
      const tenantRes = await pool.query('SELECT * FROM tenants WHERE id = 1');
      const t = tenantRes.rows[0];
      if (t?.meta_whatsapp_token && t.meta_phone_number_id) {
        const metaSvc = require('../services/meta.service');
        metaSvc.configure(t.meta_whatsapp_token, t.meta_phone_number_id);
        await metaSvc.sendText(rows[0].phone, content);
      }
    } catch (_e) { /* Meta not configured */ }

    return res.json({ success: true, data: msgRows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
