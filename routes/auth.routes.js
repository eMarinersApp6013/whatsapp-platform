const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }

    // Check staff_numbers for the phone
    const staffResult = await pool.query(
      'SELECT s.*, t.name as tenant_name FROM staff_numbers s JOIN tenants t ON t.id = s.tenant_id WHERE s.phone = $1 AND s.is_active = true',
      [phone]
    );

    if (staffResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const staff = staffResult.rows[0];

    // For Phase 1, verify against ADMIN_PASSWORD env var
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const isMatch = password === adminPassword;

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { staff_id: staff.id, tenant_id: staff.tenant_id, phone: staff.phone, name: staff.name },
      process.env.JWT_SECRET || 'changeme',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: staff.id,
        name: staff.name,
        phone: staff.phone,
        tenant_id: staff.tenant_id,
        tenant_name: staff.tenant_name,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
