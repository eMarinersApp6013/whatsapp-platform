'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    const tenant_id = req.query.tenant_id || 1;

    const [customers, conversations, orders] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM clients WHERE tenant_id = $1', [tenant_id]),
      pool.query('SELECT COUNT(*) FROM conversations WHERE tenant_id = $1', [tenant_id]),
      pool.query('SELECT COUNT(*) FROM orders WHERE tenant_id = $1', [tenant_id]),
    ]);
    // messages may not exist yet — safe fallback
    let messages = { rows: [{ count: '0' }] };
    try {
      messages = await pool.query(
        `SELECT COUNT(*) FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE c.tenant_id = $1 AND m.created_at > NOW() - INTERVAL '24 hours'`,
        [tenant_id]
      );
    } catch (_) {}

    const openConvs  = await pool.query("SELECT COUNT(*) FROM conversations WHERE tenant_id = $1 AND status = 'open'", [tenant_id]);
    const pendOrders = await pool.query("SELECT COUNT(*) FROM orders WHERE tenant_id = $1 AND status = 'pending'", [tenant_id]);
    const revenue    = await pool.query("SELECT COALESCE(SUM(total_amount),0) as total FROM orders WHERE tenant_id = $1 AND status != 'cancelled'", [tenant_id]);

    return res.json({
      success: true,
      data: {
        total_customers:     parseInt(customers.rows[0].count),
        total_conversations: parseInt(conversations.rows[0].count),
        total_orders:        parseInt(orders.rows[0].count),
        messages_today:      parseInt(messages.rows[0].count),
        open_conversations:  parseInt(openConvs.rows[0].count),
        pending_orders:      parseInt(pendOrders.rows[0].count),
        total_revenue:       parseFloat(revenue.rows[0].total),
        pending_approvals_count: parseInt(pendOrders.rows[0].count),
      }
    });
  } catch (err) {
    console.error('[GET /api/dashboard/stats]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
