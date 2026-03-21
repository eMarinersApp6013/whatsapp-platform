const cron = require('node-cron');
const { pool } = require('../config/db');
const { trackShipment, normalizeStatus } = require('../services/courier.service');
const { sendTextMessage } = require('../services/meta.service');

const STATUS_MESSAGES = {
  PICKED_UP: '📦 Your order has been picked up by the courier!',
  IN_TRANSIT: '🚚 Your order is on the way',
  OUT_FOR_DEL: '🏠 Out for delivery today! Please keep your phone nearby.',
  DELIVERED: '✅ Delivered! Thank you for shopping with us. How was your experience? Reply 1-5',
  FAILED: '❌ Delivery attempted but failed. We will retry tomorrow.',
};

/**
 * Track all dispatched/in-transit orders and send status updates.
 * Runs every 2 hours.
 */
function startTrackingCron() {
  cron.schedule('0 */2 * * *', async () => {
    console.log('[Cron] Tracking shipments...');
    try {
      const orders = await pool.query(
        `SELECT o.*, c.phone as client_phone, c.name as client_name,
          t.phone_number_id, t.wa_token, t.name as tenant_name
         FROM orders o
         JOIN clients c ON c.id = o.client_id
         JOIN tenants t ON t.id = o.tenant_id
         WHERE o.status IN ('DISPATCHED', 'IN_TRANSIT', 'PICKED_UP', 'OUT_FOR_DEL')
           AND o.awb_number IS NOT NULL AND o.courier_partner IS NOT NULL`
      );

      console.log(`[Cron] Tracking ${orders.rows.length} shipments`);

      for (const order of orders.rows) {
        try {
          const result = await trackShipment(order.courier_partner, order.awb_number);
          const newStatus = normalizeStatus(result.status);

          if (newStatus !== order.status && STATUS_MESSAGES[newStatus]) {
            // Update order status
            await pool.query(
              'UPDATE orders SET status = $1 WHERE id = $2',
              [newStatus, order.id]
            );

            // Build message
            let msg = STATUS_MESSAGES[newStatus];
            if (newStatus === 'IN_TRANSIT' && result.city) {
              msg = `🚚 Your order is on the way to ${result.city}!`;
            }
            msg = `${msg}\n\nOrder: ${order.order_number}\nAWB: ${order.awb_number}`;

            // Send WhatsApp update
            const waToken = order.wa_token || process.env.META_WHATSAPP_TOKEN;
            const phoneNumberId = order.phone_number_id || process.env.META_PHONE_NUMBER_ID;
            await sendTextMessage(phoneNumberId, waToken, order.client_phone, msg);

            await pool.query(
              `INSERT INTO conversations (client_id, tenant_id, phone, role, message, message_type)
               VALUES ($1, $2, $3, 'system', $4, 'text')`,
              [order.client_id, order.tenant_id, order.client_phone, msg]
            );

            console.log(`[Cron] Order #${order.id} ${order.status} → ${newStatus}`);

            // Update client stats on delivery
            if (newStatus === 'DELIVERED') {
              await pool.query(
                `UPDATE clients SET
                  order_count = order_count + 1,
                  total_spent = total_spent + $1,
                  is_vip = CASE WHEN order_count + 1 >= 2 THEN true ELSE is_vip END
                 WHERE id = $2`,
                [parseFloat(order.total), order.client_id]
              );
            }
          }
        } catch (trackErr) {
          console.error(`[Cron] Track error for order #${order.id}:`, trackErr.message);
        }
      }
    } catch (err) {
      console.error('[Cron] Tracking cron error:', err);
    }
  });

  console.log('[Cron] Shipment tracking scheduled: every 2 hours');
}

module.exports = { startTrackingCron };
