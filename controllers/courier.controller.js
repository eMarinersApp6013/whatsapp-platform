const { pool } = require('../config/db');
const courierService = require('../services/courier.service');
const { sendTextMessage } = require('../services/meta.service');

// GET /api/courier/rates/:orderId
exports.getRates = async (req, res) => {
  try {
    const order = await pool.query(
      `SELECT o.*, t.store_address FROM orders o JOIN tenants t ON t.id = o.tenant_id
       WHERE o.id = $1 AND o.tenant_id = $2`,
      [req.params.orderId, req.tenantId]
    );
    if (order.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const o = order.rows[0];
    const address = typeof o.address_json === 'string' ? JSON.parse(o.address_json) : (o.address_json || {});
    const items = o.items_json || [];
    const weight = items.reduce((w, i) => w + (parseFloat(i.weight_kg) || 0.5) * (i.qty || 1), 0);
    const isCod = o.payment_method === 'COD';

    // Use tenant store pincode or fallback
    const pickupPincode = process.env.PICKUP_PINCODE || '751001';
    const deliveryPincode = address.pincode;

    if (!deliveryPincode) return res.status(400).json({ error: 'Order has no delivery pincode' });

    const rates = await courierService.getAllRates(pickupPincode, deliveryPincode, weight, isCod);

    // Mark recommended
    const recommended = courierService.recommendCourier(rates, weight, !isCod);
    for (const rate of rates) {
      rate.recommended = recommended && rate.courier === recommended.courier && rate.rate === recommended.rate;
    }

    res.json({ rates, order_id: o.id, weight, pickup: pickupPincode, delivery: deliveryPincode });
  } catch (err) {
    console.error('Courier rates error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/courier/ship/:orderId
exports.createShipment = async (req, res) => {
  try {
    const { courier_name, courier_company_id, selected_by } = req.body;
    if (!courier_name) return res.status(400).json({ error: 'courier_name is required' });

    const orderResult = await pool.query(
      `SELECT o.*, c.name as client_name, c.phone as client_phone, t.phone_number_id, t.wa_token
       FROM orders o JOIN clients c ON c.id = o.client_id JOIN tenants t ON t.id = o.tenant_id
       WHERE o.id = $1 AND o.tenant_id = $2`,
      [req.params.orderId, req.tenantId]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = orderResult.rows[0];
    order.client_name = order.client_name;
    order.client_phone = order.client_phone;

    const shipResult = await courierService.createShipment(courier_name, order, courier_company_id);

    // Update order
    await pool.query(
      `UPDATE orders SET awb_number = $1, courier_partner = $2, courier_slip_approved = true, status = 'DISPATCHED'
       WHERE id = $3`,
      [shipResult.awb, courier_name, order.id]
    );

    // Create courier slip
    const items = order.items_json || [];
    const weight = items.reduce((w, i) => w + (parseFloat(i.weight_kg) || 0.5) * (i.qty || 1), 0);
    await pool.query(
      `INSERT INTO courier_slips (order_id, tenant_id, status, weight_kg, courier_partner, awb_number, label_url, selected_by, approved_at)
       VALUES ($1, $2, 'APPROVED', $3, $4, $5, $6, $7, NOW())`,
      [order.id, req.tenantId, weight, courier_name, shipResult.awb, shipResult.label_url || null, selected_by || 'admin']
    );

    // Send WhatsApp notification to customer
    const waToken = order.wa_token || process.env.META_WHATSAPP_TOKEN;
    const phoneNumberId = order.phone_number_id || process.env.META_PHONE_NUMBER_ID;
    const trackUrl = getTrackingUrl(courier_name, shipResult.awb);

    const msg = `✅ Your order ${order.order_number} has been dispatched!\n\nCourier: ${courier_name}\nAWB: ${shipResult.awb}${trackUrl ? `\nTrack: ${trackUrl}` : ''}\nEstimated delivery: 3-7 business days`;
    await sendTextMessage(phoneNumberId, waToken, order.client_phone, msg);

    await pool.query(
      `INSERT INTO conversations (client_id, tenant_id, phone, role, message, message_type)
       VALUES ($1, $2, $3, 'system', $4, 'text')`,
      [order.client_id, req.tenantId, order.client_phone, msg]
    );

    res.json({ success: true, awb: shipResult.awb, courier: courier_name, label_url: shipResult.label_url });
  } catch (err) {
    console.error('Courier create shipment error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

// GET /api/courier/track/:orderId
exports.trackOrder = async (req, res) => {
  try {
    const order = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND tenant_id = $2',
      [req.params.orderId, req.tenantId]
    );
    if (order.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const o = order.rows[0];
    if (!o.awb_number || !o.courier_partner) {
      return res.status(400).json({ error: 'Order has no shipment' });
    }

    const tracking = await courierService.trackShipment(o.courier_partner, o.awb_number);
    tracking.normalized_status = courierService.normalizeStatus(tracking.status);

    res.json({ tracking, order_id: o.id, awb: o.awb_number, courier: o.courier_partner });
  } catch (err) {
    console.error('Courier track error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

function getTrackingUrl(courier, awb) {
  const urls = {
    shiprocket: `https://www.shiprocket.in/shipment-tracking/${awb}`,
    delhivery: `https://www.delhivery.com/track/package/${awb}`,
    xpressbees: `https://www.xpressbees.com/track?awb=${awb}`,
  };
  return urls[courier] || '';
}
