const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const tenantMiddleware = require('../middleware/tenant.middleware');
const { pool } = require('../config/db');

router.use(authMiddleware);
router.use(tenantMiddleware);

// GET /api/orders
router.get('/', async (req, res) => {
  try {
    const { status, payment_status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let query = 'SELECT o.*, c.name as client_name, c.phone as client_phone FROM orders o LEFT JOIN clients c ON c.id = o.client_id WHERE o.tenant_id = $1';
    const params = [req.tenantId];
    let paramIdx = 2;

    if (status) {
      query += ` AND o.status = $${paramIdx++}`;
      params.push(status);
    }
    if (payment_status) {
      query += ` AND o.payment_status = $${paramIdx++}`;
      params.push(payment_status);
    }

    query += ` ORDER BY o.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await pool.query(query, params);
    res.json({ orders: result.rows });
  } catch (err) {
    console.error('Orders list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/orders/:id/approve-invoice
router.patch('/:id/approve-invoice', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE orders SET invoice_approved = true WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    // TODO Phase 5: trigger Zoho email to client
    res.json({ order: result.rows[0], message: 'Invoice approved' });
  } catch (err) {
    console.error('Approve invoice error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/orders/:id/approve-courier
router.patch('/:id/approve-courier', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE orders SET courier_slip_approved = true WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    // TODO Phase 5: generate AWB via Shiprocket
    res.json({ order: result.rows[0], message: 'Courier approved' });
  } catch (err) {
    console.error('Approve courier error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
