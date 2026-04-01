'use strict';
/**
 * NavyStore Public REST API — v1
 * Authentication: X-Api-Key: wsk_xxxxxxxxxxxxxxxxxxxxxxxx
 *
 * Endpoints:
 *   GET  /v1/contacts
 *   GET  /v1/contacts/:id
 *   GET  /v1/conversations
 *   GET  /v1/conversations/:id
 *   GET  /v1/conversations/:id/messages
 *   POST /v1/conversations/:id/messages
 *   GET  /v1/labels
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const crypto  = require('crypto');

// ── API Key Auth Middleware ────────────────────────────────────────────────────
async function apiKeyAuth(req, res, next) {
  const rawKey = req.headers['x-api-key'];
  if (!rawKey) {
    return res.status(401).json({ error: 'Missing X-Api-Key header' });
  }
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const { rows } = await pool.query(
    `SELECT * FROM api_keys WHERE key_hash = $1 AND is_active = true AND tenant_id = 1`,
    [keyHash]
  );
  if (!rows.length) {
    return res.status(401).json({ error: 'Invalid or revoked API key' });
  }
  // Update last_used_at (fire and forget)
  pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [rows[0].id]).catch(() => {});
  req.apiKey = rows[0];
  next();
}

router.use(apiKeyAuth);

// ── GET /v1/contacts ──────────────────────────────────────────────────────────
router.get('/contacts', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [1];
    let where = 'tenant_id = $1';
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (name ILIKE $${params.length} OR phone ILIKE $${params.length})`;
    }
    const { rows } = await pool.query(
      `SELECT id, name, phone, email, created_at FROM clients WHERE ${where}
       ORDER BY created_at DESC LIMIT $${params.push(parseInt(limit))} OFFSET $${params.push(offset)}`,
      params
    );
    const countRes = await pool.query(`SELECT COUNT(*) FROM clients WHERE ${where}`, params.slice(0, -2));
    res.json({
      data: rows,
      meta: { total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: parseInt(limit) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /v1/contacts/:id ──────────────────────────────────────────────────────
router.get('/contacts/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.phone, c.email, c.created_at,
              COUNT(DISTINCT conv.id)::int AS total_conversations,
              COUNT(DISTINCT o.id)::int    AS total_orders
       FROM clients c
       LEFT JOIN conversations conv ON conv.client_id = c.id
       LEFT JOIN orders o ON o.client_id = c.id
       WHERE c.id = $1 AND c.tenant_id = 1
       GROUP BY c.id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Contact not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /v1/conversations ─────────────────────────────────────────────────────
router.get('/conversations', async (req, res) => {
  try {
    const { status = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [1];
    let where = 'c.tenant_id = $1';
    if (status) {
      params.push(status);
      where += ` AND c.status = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT c.id, c.status, c.last_message, c.last_message_at, c.created_at,
              c.assigned_to, c.priority, c.unread_count, c.resolved_at,
              cl.name AS contact_name, cl.phone AS contact_phone
       FROM conversations c
       LEFT JOIN clients cl ON c.client_id = cl.id
       WHERE ${where}
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT $${params.push(parseInt(limit))} OFFSET $${params.push(offset)}`,
      params
    );
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM conversations c WHERE ${where}`, params.slice(0, -2)
    );
    res.json({
      data: rows,
      meta: { total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: parseInt(limit) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /v1/conversations/:id ─────────────────────────────────────────────────
router.get('/conversations/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.status, c.last_message, c.last_message_at, c.created_at,
              c.assigned_to, c.priority, c.label_ids, c.unread_count,
              c.is_starred, c.resolved_at, c.resolved_by,
              cl.name AS contact_name, cl.phone AS contact_phone, cl.id AS contact_id
       FROM conversations c
       LEFT JOIN clients cl ON c.client_id = cl.id
       WHERE c.id = $1 AND c.tenant_id = 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /v1/conversations/:id/messages ───────────────────────────────────────
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows } = await pool.query(
      `SELECT id, direction, message_type, content, media_url, is_note, created_at
       FROM messages WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [req.params.id, parseInt(limit), offset]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /v1/conversations/:id/messages  (send message via API) ───────────────
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    if (!req.apiKey.permissions.includes('write') && !req.apiKey.permissions.includes('admin')) {
      return res.status(403).json({ error: 'Write permission required' });
    }
    const { content, type = 'text' } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });

    const { rows: convRows } = await pool.query(
      `SELECT c.id, cl.phone FROM conversations c
       JOIN clients cl ON c.client_id = cl.id
       WHERE c.id = $1 AND c.tenant_id = 1`,
      [req.params.id]
    );
    if (!convRows.length) return res.status(404).json({ error: 'Conversation not found' });

    const { rows: msgRows } = await pool.query(
      `INSERT INTO messages (conversation_id, direction, message_type, content, created_at)
       VALUES ($1, 'outbound', $2, $3, NOW()) RETURNING *`,
      [req.params.id, type, content]
    );
    await pool.query(
      'UPDATE conversations SET last_message=$1, last_message_at=NOW(), unread_count=0 WHERE id=$2',
      [content, req.params.id]
    );

    // Send via Meta
    try {
      const tenantRes = await pool.query('SELECT * FROM tenants WHERE id = 1');
      const t = tenantRes.rows[0];
      if (t?.meta_whatsapp_token && t.meta_phone_number_id) {
        const metaSvc = require('../services/meta.service');
        metaSvc.configure(t.meta_whatsapp_token, t.meta_phone_number_id);
        await metaSvc.sendText(convRows[0].phone, content);
      }
    } catch (_e) {}

    res.json({ data: msgRows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /v1/labels ────────────────────────────────────────────────────────────
router.get('/labels', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, color FROM labels WHERE tenant_id = $1 ORDER BY name',
      [1]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
