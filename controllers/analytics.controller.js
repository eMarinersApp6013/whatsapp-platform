const { pool } = require('../config/db');

// GET /api/analytics/summary
exports.summary = async (req, res) => {
  try {
    const tenantId = req.tenantId;

    // Revenue today and this month
    const revenueResult = await pool.query(
      `SELECT
        COALESCE(SUM(total) FILTER (WHERE created_at >= CURRENT_DATE), 0) as revenue_today,
        COALESCE(SUM(total) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)), 0) as revenue_this_month
       FROM orders WHERE tenant_id = $1 AND payment_status = 'PAID'`,
      [tenantId]
    );

    // Orders by status
    const statusResult = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM orders WHERE tenant_id = $1
       GROUP BY status`,
      [tenantId]
    );
    const ordersByStatus = {};
    for (const r of statusResult.rows) ordersByStatus[r.status] = parseInt(r.count, 10);

    // Top 5 products (all time)
    const topProducts = await pool.query(
      `SELECT item->>'name' as name, SUM((item->>'qty')::int) as total_qty,
        SUM((item->>'price')::numeric * (item->>'qty')::int) as total_revenue
       FROM orders, jsonb_array_elements(items_json) as item
       WHERE tenant_id = $1 AND payment_status = 'PAID'
       GROUP BY item->>'name' ORDER BY total_qty DESC LIMIT 5`,
      [tenantId]
    );

    // Courier breakdown
    const courierResult = await pool.query(
      `SELECT courier_partner, COUNT(*) as count
       FROM orders WHERE tenant_id = $1 AND courier_partner IS NOT NULL
       GROUP BY courier_partner`,
      [tenantId]
    );
    const courierBreakdown = {};
    for (const r of courierResult.rows) courierBreakdown[r.courier_partner] = parseInt(r.count, 10);

    // COD vs prepaid ratio
    const paymentResult = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE payment_method = 'COD') as cod_count,
        COUNT(*) FILTER (WHERE payment_method != 'COD' AND payment_method IS NOT NULL) as prepaid_count
       FROM orders WHERE tenant_id = $1 AND payment_status = 'PAID'`,
      [tenantId]
    );
    const pm = paymentResult.rows[0];
    const totalPaid = parseInt(pm.cod_count, 10) + parseInt(pm.prepaid_count, 10);

    // Average order value
    const aovResult = await pool.query(
      `SELECT COALESCE(AVG(total), 0) as avg_order_value
       FROM orders WHERE tenant_id = $1 AND payment_status = 'PAID'`,
      [tenantId]
    );

    // Repeat customer rate
    const repeatResult = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE order_count >= 2) as repeat_customers,
        COUNT(*) as total_customers
       FROM clients WHERE tenant_id = $1`,
      [tenantId]
    );
    const rc = repeatResult.rows[0];
    const totalCustomers = parseInt(rc.total_customers, 10);

    // Pending approvals
    const pendingResult = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE invoice_approved = false AND payment_status = 'PAID') as pending_invoices,
        COUNT(*) FILTER (WHERE courier_slip_approved = false AND invoice_approved = true) as pending_courier
       FROM orders WHERE tenant_id = $1`,
      [tenantId]
    );

    const rev = revenueResult.rows[0];
    const pending = pendingResult.rows[0];

    res.json({
      revenue_today: parseFloat(rev.revenue_today),
      revenue_this_month: parseFloat(rev.revenue_this_month),
      orders_by_status: ordersByStatus,
      top_5_products: topProducts.rows.map((p) => ({
        name: p.name, qty: parseInt(p.total_qty, 10), revenue: parseFloat(p.total_revenue),
      })),
      courier_breakdown: courierBreakdown,
      cod_vs_prepaid_ratio: {
        cod: parseInt(pm.cod_count, 10),
        prepaid: parseInt(pm.prepaid_count, 10),
        cod_pct: totalPaid > 0 ? ((parseInt(pm.cod_count, 10) / totalPaid) * 100).toFixed(1) : 0,
      },
      avg_order_value: parseFloat(aovResult.rows[0].avg_order_value).toFixed(2),
      repeat_customer_rate: totalCustomers > 0
        ? ((parseInt(rc.repeat_customers, 10) / totalCustomers) * 100).toFixed(1)
        : 0,
      pending_approvals_count: {
        invoices: parseInt(pending.pending_invoices, 10),
        courier: parseInt(pending.pending_courier, 10),
      },
    });
  } catch (err) {
    console.error('Analytics summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /api/onboarding/status
exports.onboardingStatus = async (req, res) => {
  try {
    const tenantId = req.tenantId;

    const tenant = await pool.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
    if (tenant.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    const t = tenant.rows[0];

    const productCount = await pool.query(
      'SELECT COUNT(*) as cnt FROM products WHERE tenant_id = $1 AND is_active = true', [tenantId]
    );
    const shippingCount = await pool.query(
      'SELECT COUNT(*) as cnt FROM shipping_rates WHERE tenant_id = $1', [tenantId]
    );
    const staffCount = await pool.query(
      'SELECT COUNT(*) as cnt FROM staff_numbers WHERE tenant_id = $1 AND is_active = true', [tenantId]
    );
    const conversationCount = await pool.query(
      'SELECT COUNT(*) as cnt FROM conversations WHERE tenant_id = $1', [tenantId]
    );
    const orderCount = await pool.query(
      'SELECT COUNT(*) as cnt FROM orders WHERE tenant_id = $1', [tenantId]
    );

    const checklist = {
      whatsapp_connected: !!(t.phone_number_id && t.wa_token),
      products_added: parseInt(productCount.rows[0].cnt, 10) >= 1,
      shipping_rates_set: parseInt(shippingCount.rows[0].cnt, 10) >= 1,
      staff_number_set: parseInt(staffCount.rows[0].cnt, 10) >= 1,
      test_message_sent: parseInt(conversationCount.rows[0].cnt, 10) >= 1,
      first_order_received: parseInt(orderCount.rows[0].cnt, 10) >= 1,
    };

    const completed = Object.values(checklist).filter(Boolean).length;
    const total = Object.keys(checklist).length;

    res.json({
      checklist,
      completed,
      total,
      progress_pct: ((completed / total) * 100).toFixed(0),
    });
  } catch (err) {
    console.error('Onboarding status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
