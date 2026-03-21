const cron = require('node-cron');
const { pool } = require('../config/db');
const { sendTextMessage } = require('../services/meta.service');
const { createOrder: createCashfreeOrder } = require('../services/cashfree.service');

/**
 * Failed payment retry — every 30 minutes.
 * Send reminders for orders stuck in PENDING_PAYMENT for >2 hours.
 */
function startPaymentRetryCron() {
  cron.schedule('*/30 * * * *', async () => {
    try {
      const staleOrders = await pool.query(
        `SELECT o.*, c.phone as client_phone, c.name as client_name,
          t.phone_number_id, t.wa_token
         FROM orders o
         JOIN clients c ON c.id = o.client_id
         JOIN tenants t ON t.id = o.tenant_id
         WHERE o.status = 'PENDING_PAYMENT'
           AND o.payment_status = 'UNPAID'
           AND o.payment_link_sent_at IS NOT NULL
           AND o.payment_link_sent_at < NOW() - INTERVAL '2 hours'
           AND o.payment_link_sent_at > NOW() - INTERVAL '24 hours'
           AND t.is_active = true`
      );

      for (const order of staleOrders.rows) {
        const waToken = order.wa_token || process.env.META_WHATSAPP_TOKEN;
        const phoneNumberId = order.phone_number_id || process.env.META_PHONE_NUMBER_ID;

        // Resend payment reminder with existing link
        const msg = `⏰ *Payment Reminder*\n\nHi ${order.client_name}, your order ${order.order_number} (₹${order.total}) is still waiting for payment.\n\nComplete your order — the payment link is valid for 24 hours.\n\nNeed help? Just reply here!`;
        await sendTextMessage(phoneNumberId, waToken, order.client_phone, msg);

        // Update sent_at so we don't spam
        await pool.query(
          'UPDATE orders SET payment_link_sent_at = NOW() WHERE id = $1',
          [order.id]
        );

        await pool.query(
          `INSERT INTO conversations (client_id, tenant_id, phone, role, message, message_type)
           VALUES ($1, $2, $3, 'system', $4, 'text')`,
          [order.client_id, order.tenant_id, order.client_phone, msg]
        );

        console.log(`[Cron] Payment reminder sent for order #${order.id}`);
      }
    } catch (err) {
      console.error('[Cron] Payment retry error:', err);
    }
  });

  console.log('[Cron] Payment retry scheduled: every 30 minutes');
}

/**
 * COD to prepaid converter — check orders where payment_method = 'COD'
 * and cod_nudge_sent = false, created >5 minutes ago.
 */
function startCodConverterCron() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const codOrders = await pool.query(
        `SELECT o.*, c.phone as client_phone, c.name as client_name,
          t.phone_number_id, t.wa_token, t.cod_extra_charge
         FROM orders o
         JOIN clients c ON c.id = o.client_id
         JOIN tenants t ON t.id = o.tenant_id
         WHERE o.payment_method = 'COD'
           AND o.cod_nudge_sent = false
           AND o.status = 'CONFIRMED'
           AND o.created_at < NOW() - INTERVAL '5 minutes'
           AND o.created_at > NOW() - INTERVAL '1 hour'
           AND t.is_active = true`
      );

      for (const order of codOrders.rows) {
        const codFee = parseFloat(order.cod_extra_charge || 50);
        const waToken = order.wa_token || process.env.META_WHATSAPP_TOKEN;
        const phoneNumberId = order.phone_number_id || process.env.META_PHONE_NUMBER_ID;

        // Try to generate prepaid link
        let paymentLink = '';
        try {
          const prepaidTotal = parseFloat(order.total) - codFee;
          const cfResult = await createCashfreeOrder({
            orderId: `${order.order_number}-PREPAID`,
            orderAmount: prepaidTotal > 0 ? prepaidTotal : parseFloat(order.total),
            customerPhone: order.client_phone,
            customerName: order.client_name,
          });
          paymentLink = cfResult.payment_link;
        } catch (e) {
          console.error('[Cron] COD converter payment link error:', e.message);
          continue;
        }

        const msg = `💡 *Switch to Prepaid & Save ₹${codFee}!*\n\nSame order, instant dispatch priority.\n\nPay here: ${paymentLink}\n\n_Link valid for 30 minutes_`;
        await sendTextMessage(phoneNumberId, waToken, order.client_phone, msg);

        await pool.query(
          'UPDATE orders SET cod_nudge_sent = true WHERE id = $1',
          [order.id]
        );

        await pool.query(
          `INSERT INTO conversations (client_id, tenant_id, phone, role, message, message_type)
           VALUES ($1, $2, $3, 'system', $4, 'text')`,
          [order.client_id, order.tenant_id, order.client_phone, msg]
        );

        console.log(`[Cron] COD nudge sent for order #${order.id}`);
      }
    } catch (err) {
      console.error('[Cron] COD converter error:', err);
    }
  });

  console.log('[Cron] COD converter scheduled: every 5 minutes');
}

module.exports = { startPaymentRetryCron, startCodConverterCron };
