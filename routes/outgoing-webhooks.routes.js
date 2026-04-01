'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const axios   = require('axios');
const crypto  = require('crypto');

// GET /api/webhooks
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, url, events, is_active, created_at, last_triggered_at, last_status
       FROM webhook_endpoints WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [1]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/webhooks
router.post('/', async (req, res) => {
  try {
    const { name, url, secret, events = ['message.received', 'conversation.resolved'] } = req.body;
    if (!name || !url) return res.status(400).json({ success: false, message: 'name and url required' });

    const { rows } = await pool.query(
      `INSERT INTO webhook_endpoints (tenant_id, name, url, secret, events)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [1, name, url, secret || null, events]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/webhooks/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, url, secret, events, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE webhook_endpoints SET
         name      = COALESCE($2, name),
         url       = COALESCE($3, url),
         secret    = COALESCE($4, secret),
         events    = COALESCE($5, events),
         is_active = COALESCE($6, is_active)
       WHERE id = $1 AND tenant_id = 1 RETURNING *`,
      [req.params.id, name, url, secret, events, is_active]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/webhooks/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM webhook_endpoints WHERE id = $1 AND tenant_id = 1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/webhooks/:id/test  — send test payload
router.post('/:id/test', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM webhook_endpoints WHERE id = $1 AND tenant_id = 1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });

    const endpoint = rows[0];
    const payload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: { message: 'Test webhook from NavyStore WA Platform' }
    };

    const headers = { 'Content-Type': 'application/json' };
    if (endpoint.secret) {
      const sig = crypto.createHmac('sha256', endpoint.secret)
        .update(JSON.stringify(payload)).digest('hex');
      headers['X-NavyStore-Signature'] = `sha256=${sig}`;
    }

    let status = 0;
    try {
      const r = await axios.post(endpoint.url, payload, { headers, timeout: 5000 });
      status = r.status;
    } catch (e) {
      status = e.response?.status || 0;
    }

    await pool.query(
      'UPDATE webhook_endpoints SET last_triggered_at=NOW(), last_status=$2 WHERE id=$1',
      [endpoint.id, status]
    );

    res.json({ success: true, status_code: status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
