const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const tenantMiddleware = require('../middleware/tenant.middleware');
const { pool } = require('../config/db');

router.use(authMiddleware);
router.use(tenantMiddleware);

// PUT /api/settings — update tenant settings
router.put('/', async (req, res) => {
  try {
    const { name, waba_id, phone_number_id, wa_token, plan } = req.body;
    const result = await pool.query(
      `UPDATE tenants SET name = COALESCE($1, name), waba_id = COALESCE($2, waba_id),
       phone_number_id = COALESCE($3, phone_number_id), wa_token = COALESCE($4, wa_token),
       plan = COALESCE($5, plan) WHERE id = $6 RETURNING *`,
      [name, waba_id, phone_number_id, wa_token, plan, req.tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    res.json({ tenant: result.rows[0] });
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/staff-numbers
router.post('/staff-numbers', async (req, res) => {
  try {
    const { phone, name } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone is required' });
    }
    const result = await pool.query(
      'INSERT INTO staff_numbers (tenant_id, phone, name) VALUES ($1, $2, $3) RETURNING *',
      [req.tenantId, phone, name]
    );
    res.status(201).json({ staff: result.rows[0] });
  } catch (err) {
    console.error('Staff number create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
