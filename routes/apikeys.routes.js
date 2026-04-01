'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const crypto  = require('crypto');

// GET /api/apikeys
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, key_prefix, permissions, last_used_at, created_at, is_active
       FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [1]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/apikeys  — generate new key
router.post('/', async (req, res) => {
  try {
    const { name, permissions = ['read'] } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name required' });

    // Generate: wsk_<32 random bytes hex>
    const rawKey   = 'wsk_' + crypto.randomBytes(24).toString('hex');
    const keyHash  = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 12); // "wsk_" + first 8 chars

    const { rows } = await pool.query(
      `INSERT INTO api_keys (tenant_id, name, key_prefix, key_hash, permissions)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name, key_prefix, permissions, created_at, is_active`,
      [1, name, keyPrefix, keyHash, permissions]
    );

    // Return full key ONCE — never stored again
    res.json({ success: true, data: { ...rows[0], full_key: rawKey } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/apikeys/:id  — revoke
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      'UPDATE api_keys SET is_active = false WHERE id = $1 AND tenant_id = 1',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
