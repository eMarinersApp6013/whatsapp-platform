'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');

// GET /api/agents
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, phone, email, role, status, avatar, is_active, created_at
       FROM agents WHERE tenant_id = $1 ORDER BY created_at ASC`,
      [1]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/agents
router.post('/', async (req, res) => {
  try {
    const { name, phone, email, role = 'agent', avatar } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name required' });

    const { rows } = await pool.query(
      `INSERT INTO agents (tenant_id, name, phone, email, role, avatar)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [1, name, phone || null, email || null, role, avatar || null]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/agents/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, phone, email, role, avatar, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE agents SET
         name      = COALESCE($2, name),
         phone     = COALESCE($3, phone),
         email     = COALESCE($4, email),
         role      = COALESCE($5, role),
         avatar    = COALESCE($6, avatar),
         is_active = COALESCE($7, is_active)
       WHERE id = $1 AND tenant_id = 1 RETURNING *`,
      [req.params.id, name, phone, email, role, avatar, is_active]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/agents/:id  (soft-delete)
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      'UPDATE agents SET is_active = false WHERE id = $1 AND tenant_id = 1',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/agents/:id/status  — online | busy | offline
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['online', 'busy', 'offline'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be online|busy|offline' });
    }
    const { rows } = await pool.query(
      'UPDATE agents SET status = $2 WHERE id = $1 AND tenant_id = 1 RETURNING *',
      [req.params.id, status]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });

    // Broadcast status change to all connected sockets
    const io = req.app.get('io');
    if (io) io.emit('agent_status_change', { agent_id: rows[0].id, name: rows[0].name, status });

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
