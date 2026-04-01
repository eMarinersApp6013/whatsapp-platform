const crypto = require('crypto');

const CASHFREE_BASE_URL = process.env.CASHFREE_ENV === 'production'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg';

/**
 * Create a Cashfree payment order and return the payment link.
 * @param {object} opts - { orderId, orderAmount, customerPhone, customerName, customerEmail, returnUrl }
 * @returns {object} { cf_order_id, payment_session_id, payment_link }
 */
async function createOrder({ orderId, orderAmount, customerPhone, customerName, customerEmail, returnUrl }) {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;

  if (!appId || !secretKey) {
    throw new Error('Cashfree credentials not configured');
  }

  const payload = {
    order_id: orderId,
    order_amount: parseFloat(orderAmount).toFixed(2),
    order_currency: 'INR',
    customer_details: {
      customer_id: customerPhone,
      customer_phone: customerPhone,
      customer_name: customerName || customerPhone,
      customer_email: customerEmail || `${customerPhone}@noemail.com`,
    },
    order_meta: {
      return_url: returnUrl || `${process.env.APP_URL || 'https://wa.nodesurge.tech'}/payment/return?order_id={order_id}`,
      notify_url: `${process.env.APP_URL || 'https://wa.nodesurge.tech'}/webhook/cashfree`,
    },
  };

  const response = await fetch(`${CASHFREE_BASE_URL}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': appId,
      'x-client-secret': secretKey,
      'x-api-version': '2023-08-01',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Cashfree create order error:', data);
    throw new Error(data.message || 'Failed to create Cashfree order');
  }

  // Build the payment link from the payment_session_id
  const paymentLink = data.payment_link || `${CASHFREE_BASE_URL}/links/${data.payment_session_id}`;

  return {
    cf_order_id: data.cf_order_id,
    order_id: data.order_id,
    payment_session_id: data.payment_session_id,
    payment_link: paymentLink,
    order_status: data.order_status,
  };
}

/**
 * Fetch order status from Cashfree.
 */
async function getOrderStatus(orderId) {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;

  const response = await fetch(`${CASHFREE_BASE_URL}/orders/${orderId}`, {
    headers: {
      'x-client-id': appId,
      'x-client-secret': secretKey,
      'x-api-version': '2023-08-01',
    },
  });

  return response.json();
}

/**
 * Verify Cashfree webhook HMAC-SHA256 signature.
 * RULE #3: ALWAYS verify signature before processing.
 * @param {string} rawBody - raw request body string
 * @param {string} timestamp - x-webhook-timestamp header
 * @param {string} signature - x-webhook-signature header
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, timestamp, signature) {
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  if (!secretKey || !signature || !timestamp) return false;

  const payload = timestamp + rawBody;
  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(payload)
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

module.exports = { createOrder, getOrderStatus, verifyWebhookSignature };
