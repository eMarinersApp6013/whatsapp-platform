const cron = require('node-cron');
const { pool } = require('../config/db');
const { sendTextMessage } = require('../services/meta.service');

/**
 * Daily sales summary — runs every day at 7pm IST.
 */
function startDailySummaryCron() {
  // 7pm IST = 1:30pm UTC
  cron.schedule('30 13 * * *', async () => {
    console.log('[Cron] Generating daily summaries...');
    try {
      const tenants = await pool.query('SELECT * FROM tenants WHERE is_active = true');

      for (const tenant of tenants.rows) {
        const waToken = tenant.wa_token || process.env.META_WHATSAPP_TOKEN;
        const phoneNumberId = tenant.phone_number_id || process.env.META_PHONE_NUMBER_ID;

        // Today's stats
        const stats = await pool.query(
          `SELECT
            COUNT(*) as total_orders,
            COALESCE(SUM(total), 0) as revenue,
            COUNT(*) FILTER (WHERE invoice_approved = false AND payment_status = 'PAID') as pending_invoices,
            COUNT(*) FILTER (WHERE courier_slip_approved = false AND invoice_approved = true) as pending_courier
           FROM orders WHERE tenant_id = $1 AND created_at >= CURRENT_DATE`,
          [tenant.id]
        );

        // Top product
        const topProduct = await pool.query(
          `SELECT name, SUM((item->>'qty')::int) as total_qty
           FROM orders, jsonb_array_elements(items_json) as item
           WHERE tenant_id = $1 AND created_at >= CURRENT_DATE
           GROUP BY name ORDER BY total_qty DESC LIMIT 1`,
          [tenant.id]
        );

        const s = stats.rows[0];
        const top = topProduct.rows[0];
        const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const storeName = tenant.store_name || tenant.name;

        const msg = `📊 *${storeName} Daily Report — ${today}*\n\nOrders: ${s.total_orders} | Revenue: ₹${parseFloat(s.revenue).toFixed(0)}\nPending invoices: ${s.pending_invoices} | Pending courier: ${s.pending_courier}${top ? `\nTop product: ${top.name}` : ''}`;

        const staff = await pool.query(
          'SELECT phone FROM staff_numbers WHERE tenant_id = $1 AND is_active = true',
          [tenant.id]
        );

        for (const st of staff.rows) {
          await sendTextMessage(phoneNumberId, waToken, st.phone, msg);
        }

        if (staff.rows.length > 0) {
          console.log(`[Cron] Daily summary sent for tenant ${tenant.id}`);
        }
      }
    } catch (err) {
      console.error('[Cron] Daily summary error:', err);
    }
  });

  console.log('[Cron] Daily sales summary scheduled: 7pm IST daily');
}

module.exports = { startDailySummaryCron };
