const { pool } = require('../config/db');
const { verifyWebhookSignature, getOrderStatus } = require('../services/cashfree.service');
const { sendTextMessage } = require('../services/meta.service');
const { generateOrderSummary } = require('../utils/image.utils');

// POST /webhook/cashfree — payment status webhook
exports.cashfreeWebhook = async (req, res) => {
  try {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const timestamp = req.headers['x-webhook-timestamp'] || '';
    const signature = req.headers['x-webhook-signature'] || '';

    // RULE #3: ALWAYS verify HMAC-SHA256 signature before processing
    if (!verifyWebhookSignature(rawBody, timestamp, signature)) {
      console.error('Cashfree webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    res.sendStatus(200);

    const event = req.body;
    const eventType = event.type || event.event;
    const data = event.data || event;

    console.log(`[Cashfree] Event: ${eventType}`, JSON.stringify(data).slice(0, 200));

    // Handle payment success
    if (eventType === 'PAYMENT_SUCCESS_WEBHOOK' || eventType === 'ORDER_PAID') {
      const cfOrderId = data.order?.order_id || data.order_id;
      if (!cfOrderId) {
        console.error('Cashfree webhook missing order_id');
        return;
      }

      // Find order by cashfree_order_id
      const orderResult = await pool.query(
        `SELECT o.*, c.phone as client_phone, c.name as client_name, t.phone_number_id, t.wa_token, t.name as tenant_name
         FROM orders o
         JOIN clients c ON c.id = o.client_id
         JOIN tenants t ON t.id = o.tenant_id
         WHERE o.cashfree_order_id = $1`,
        [cfOrderId]
      );

      if (orderResult.rows.length === 0) {
        console.error('Cashfree webhook: order not found for', cfOrderId);
        return;
      }

      const order = orderResult.rows[0];

      // Update order status
      await pool.query(
        `UPDATE orders SET
          payment_status = 'PAID',
          payment_method = $1,
          status = 'CONFIRMED'
         WHERE id = $2`,
        [data.payment?.payment_group || 'online', order.id]
      );

      console.log(`[Cashfree] Order #${order.id} (${cfOrderId}) PAID`);

      // Send confirmation to customer
      const waToken = order.wa_token || process.env.META_WHATSAPP_TOKEN;
      const phoneNumberId = order.phone_number_id || process.env.META_PHONE_NUMBER_ID;

      const summary = generateOrderSummary({
        orderNumber: order.order_number,
        items: order.items_json,
        subtotal: order.subtotal,
        gstAmount: order.gst_amount,
        shippingCharge: order.shipping_charge,
        total: order.total,
      });

      const confirmMsg = `✅ *Payment Confirmed!*\n\nThank you ${order.client_name}! Your payment of ₹${order.total} has been received.\n\n${summary}\n\nYour order is being processed. We'll update you once it ships!`;

      await sendTextMessage(phoneNumberId, waToken, order.client_phone, confirmMsg);

      // Save to conversations
      await pool.query(
        `INSERT INTO conversations (client_id, tenant_id, phone, role, message, message_type)
         VALUES ($1, $2, $3, 'system', $4, 'text')`,
        [order.client_id, order.tenant_id, order.client_phone, confirmMsg]
      );

      // Notify staff
      const staffResult = await pool.query(
        'SELECT phone FROM staff_numbers WHERE tenant_id = $1 AND is_active = true',
        [order.tenant_id]
      );
      for (const staff of staffResult.rows) {
        const staffMsg = `🔔 *New Payment Received*\nOrder #${order.id} | ${order.order_number}\nClient: ${order.client_name} (${order.client_phone})\nAmount: ₹${order.total}\n\nReply "order #${order.id}" for details.`;
        await sendTextMessage(phoneNumberId, waToken, staff.phone, staffMsg);
      }
    }
  } catch (err) {
    console.error('Cashfree webhook error:', err);
    if (!res.headersSent) res.sendStatus(500);
  }
};
