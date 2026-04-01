'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');

const TENANT_ID = 1;

// ── LABELS ────────────────────────────────────────────────────────────────────
router.get('/labels', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM labels WHERE tenant_id=$1 ORDER BY name', [TENANT_ID]);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/labels', async (req, res) => {
  try {
    const { name, color = '#25d366' } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name required' });
    const { rows } = await pool.query(
      'INSERT INTO labels (tenant_id, name, color) VALUES ($1,$2,$3) RETURNING *',
      [TENANT_ID, name, color]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/labels/:id', async (req, res) => {
  try {
    const { name, color } = req.body;
    const { rows } = await pool.query(
      'UPDATE labels SET name=COALESCE($1,name), color=COALESCE($2,color) WHERE id=$3 AND tenant_id=$4 RETURNING *',
      [name, color, req.params.id, TENANT_ID]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/labels/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM labels WHERE id=$1 AND tenant_id=$2', [req.params.id, TENANT_ID]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── CANNED RESPONSES ──────────────────────────────────────────────────────────
router.get('/canned', async (req, res) => {
  try {
    const { search = '' } = req.query;
    let query = 'SELECT * FROM canned_responses WHERE tenant_id=$1';
    const params = [TENANT_ID];
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (shortcut ILIKE $${params.length} OR title ILIKE $${params.length} OR content ILIKE $${params.length})`;
    }
    query += ' ORDER BY category, title';
    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/canned', async (req, res) => {
  try {
    const { shortcut, title, content, category = 'general' } = req.body;
    if (!title || !content) return res.status(400).json({ success: false, message: 'title and content required' });
    const { rows } = await pool.query(
      'INSERT INTO canned_responses (tenant_id, shortcut, title, content, category) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [TENANT_ID, shortcut || null, title, content, category]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/canned/:id', async (req, res) => {
  try {
    const { shortcut, title, content, category } = req.body;
    const { rows } = await pool.query(
      `UPDATE canned_responses SET
        shortcut=COALESCE($1,shortcut), title=COALESCE($2,title),
        content=COALESCE($3,content), category=COALESCE($4,category)
       WHERE id=$5 AND tenant_id=$6 RETURNING *`,
      [shortcut, title, content, category, req.params.id, TENANT_ID]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/canned/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM canned_responses WHERE id=$1 AND tenant_id=$2', [req.params.id, TENANT_ID]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── CONVERSATION NOTES ────────────────────────────────────────────────────────
router.get('/conversations/:id/notes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM conversation_notes WHERE conversation_id=$1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/conversations/:id/notes', async (req, res) => {
  try {
    const { content, agent_name = 'Admin' } = req.body;
    if (!content) return res.status(400).json({ success: false, message: 'content required' });
    const { rows } = await pool.query(
      'INSERT INTO conversation_notes (conversation_id, content, agent_name) VALUES ($1,$2,$3) RETURNING *',
      [req.params.id, content, agent_name]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/conversations/:id/notes/:nid', async (req, res) => {
  try {
    await pool.query('DELETE FROM conversation_notes WHERE id=$1 AND conversation_id=$2', [req.params.nid, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── CONVERSATION METADATA ─────────────────────────────────────────────────────
router.patch('/conversations/:id/assign', async (req, res) => {
  try {
    const { assigned_to } = req.body;
    const { rows } = await pool.query(
      'UPDATE conversations SET assigned_to=$1 WHERE id=$2 RETURNING id,assigned_to',
      [assigned_to || null, req.params.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/conversations/:id/star', async (req, res) => {
  try {
    const { starred } = req.body;
    const { rows } = await pool.query(
      'UPDATE conversations SET is_starred=$1 WHERE id=$2 RETURNING id,is_starred',
      [!!starred, req.params.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/conversations/:id/priority', async (req, res) => {
  try {
    const { priority } = req.body;
    if (!['urgent','normal','low'].includes(priority)) return res.status(400).json({ success: false, message: 'invalid priority' });
    const { rows } = await pool.query(
      'UPDATE conversations SET priority=$1 WHERE id=$2 RETURNING id,priority',
      [priority, req.params.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/conversations/:id/labels', async (req, res) => {
  try {
    const { label_ids = [] } = req.body;
    const { rows } = await pool.query(
      'UPDATE conversations SET label_ids=$1 WHERE id=$2 RETURNING id,label_ids',
      [label_ids, req.params.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/conversations/:id/unread', async (req, res) => {
  try {
    await pool.query('UPDATE conversations SET unread_count=0 WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── CLIENT DETAILS (for right panel) ─────────────────────────────────────────
router.get('/conversations/:id/client-info', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.assigned_to, c.is_starred, c.priority, c.label_ids, c.unread_count,
              c.status, c.created_at,
              cl.id as client_id, cl.name, cl.phone, cl.email, cl.address,
              (SELECT COUNT(*) FROM orders o WHERE o.client_id = cl.id) as order_count,
              (SELECT COALESCE(SUM(total_amount),0) FROM orders o WHERE o.client_id = cl.id) as total_spent
       FROM conversations c
       LEFT JOIN clients cl ON c.client_id = cl.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
