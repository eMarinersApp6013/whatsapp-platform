const cron = require('node-cron');
const { pool } = require('../config/db');
const { sendTextMessage } = require('../services/meta.service');

/**
 * Low stock alerts — runs daily at 9am.
 * For each tenant, find products where stock_qty <= stock_alert_threshold.
 */
function startStockAlertCron() {
  cron.schedule('0 9 * * *', async () => {
    console.log('[Cron] Checking low stock...');
    try {
      const lowStock = await pool.query(
        `SELECT p.id, p.name, p.stock_qty, p.stock_alert_threshold, p.tenant_id,
          t.name as tenant_name, t.phone_number_id, t.wa_token
         FROM products p
         JOIN tenants t ON t.id = p.tenant_id
         WHERE p.is_active = true AND p.stock_qty <= p.stock_alert_threshold AND t.is_active = true`
      );

      // Group by tenant
      const byTenant = {};
      for (const p of lowStock.rows) {
        if (!byTenant[p.tenant_id]) byTenant[p.tenant_id] = { products: [], tenant: p };
        byTenant[p.tenant_id].products.push(p);
      }

      for (const tenantId of Object.keys(byTenant)) {
        const { products, tenant } = byTenant[tenantId];
        const staff = await pool.query(
          'SELECT phone FROM staff_numbers WHERE tenant_id = $1 AND is_active = true',
          [tenantId]
        );

        if (staff.rows.length === 0) continue;

        let msg = '⚠️ *Low Stock Alert*\n\n';
        for (const p of products.slice(0, 15)) {
          msg += `• ${p.name}: only *${p.stock_qty}* units left\n`;
        }
        if (products.length > 15) msg += `\n...and ${products.length - 15} more items`;

        const waToken = tenant.wa_token || process.env.META_WHATSAPP_TOKEN;
        const phoneNumberId = tenant.phone_number_id || process.env.META_PHONE_NUMBER_ID;

        for (const s of staff.rows) {
          await sendTextMessage(phoneNumberId, waToken, s.phone, msg);
        }

        console.log(`[Cron] Low stock alert sent for tenant ${tenantId}: ${products.length} products`);
      }
    } catch (err) {
      console.error('[Cron] Stock alert error:', err);
    }
  });

  console.log('[Cron] Low stock alerts scheduled: daily at 9am');
}

module.exports = { startStockAlertCron };
