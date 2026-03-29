'use strict';
const express = require('express');
const jwt     = require('jsonwebtoken');
const pool    = require('../config/db');
const router  = express.Router();

const JWT_SECRET     = process.env.JWT_SECRET     || 'secret';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ success: false, message: 'Phone and password required' });
    }

    // Clean phone — strip +91 prefix for DB lookup
    const cleanPhone = phone.replace(/^\+91/, '').replace(/\D/g, '');

    // Check staff_numbers table
    const { rows } = await pool.query(
      'SELECT s.*, t.name as tenant_name, t.admin_password FROM staff_numbers s JOIN tenants t ON s.tenant_id = t.id WHERE s.phone = $1 AND s.is_active = true',
      [cleanPhone]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid phone or password' });
    }

    const staff = rows[0];

    // Check password: use tenant's admin_password if set, else env ADMIN_PASSWORD
    const expectedPass = (staff.admin_password && staff.admin_password.trim())
      ? staff.admin_password
      : ADMIN_PASSWORD;

    if (password !== expectedPass) {
      return res.status(401).json({ success: false, message: 'Invalid phone or password' });
    }

    const token = jwt.sign(
      { phone: staff.phone, name: staff.name, tenant_id: staff.tenant_id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      token,
      user: { phone: staff.phone, name: staff.name, tenant_id: staff.tenant_id, tenant_name: staff.tenant_name }
    });
  } catch (err) {
    console.error('[POST /api/auth/login]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ── Auth middleware (used by other routes) ───────────────────────────────────
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.replace(/^Bearer\s+/, '');
  if (!token) return res.status(401).json({ success: false, message: 'No token' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

module.exports = router;
module.exports.authenticate = authenticate;
