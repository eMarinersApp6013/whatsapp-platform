'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');

// GET /api/analytics/overview
router.get('/overview', async (req, res) => {
  try {
    const { tenant_id = 1, days = 30 } = req.query;

    const [orders, customers, messages, revenue] = await Promise.all([
      pool.query(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM orders WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '${parseInt(days)} days'
         GROUP BY DATE(created_at) ORDER BY date`,
        [tenant_id]
      ),
      pool.query(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM customers WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '${parseInt(days)} days'
         GROUP BY DATE(created_at) ORDER BY date`,
        [tenant_id]
      ),
      pool.query(
        `SELECT DATE(m.created_at) as date, COUNT(*) as count
         FROM messages m JOIN conversations c ON m.conversation_id = c.id
         WHERE c.tenant_id = $1 AND m.created_at > NOW() - INTERVAL '${parseInt(days)} days'
         GROUP BY DATE(m.created_at) ORDER BY date`,
        [tenant_id]
      ),
      pool.query(
        `SELECT DATE(created_at) as date, COALESCE(SUM(total_amount),0) as total
         FROM orders WHERE tenant_id = $1 AND status != 'cancelled'
         AND created_at > NOW() - INTERVAL '${parseInt(days)} days'
         GROUP BY DATE(created_at) ORDER BY date`,
        [tenant_id]
      ),
    ]);

    return res.json({
      success: true,
      data: {
        orders:    orders.rows,
        customers: customers.rows,
        messages:  messages.rows,
        revenue:   revenue.rows,
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/analytics/top-products
router.get('/top-products', async (req, res) => {
  try {
    const { tenant_id = 1, limit = 10 } = req.query;
    // Orders items is JSONB array: [{product_id, name, qty, price}]
    const { rows } = await pool.query(
      `SELECT item->>'name' as name,
              SUM((item->>'qty')::int) as total_qty,
              SUM((item->>'qty')::int * (item->>'price')::numeric) as revenue
       FROM orders, jsonb_array_elements(items) as item
       WHERE tenant_id = $1 AND status != 'cancelled'
       GROUP BY item->>'name'
       ORDER BY total_qty DESC
       LIMIT $2`,
      [tenant_id, limit]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
