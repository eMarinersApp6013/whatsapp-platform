const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const tenantMiddleware = require('../middleware/tenant.middleware');
const { pool } = require('../config/db');
const { generateInvoice } = require('../services/invoice.service');
const { sendTextMessage } = require('../services/meta.service');
const courierService = require('../services/courier.service');

router.use(authMiddleware);
router.use(tenantMiddleware);

// GET /api/orders
router.get('/', async (req, res) => {
  try {
    const { status, payment_status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let query = 'SELECT o.*, c.name as client_name, c.phone as client_phone FROM orders o LEFT JOIN clients c ON c.id = o.client_id WHERE o.tenant_id = $1';
    const params = [req.tenantId];
    let paramIdx = 2;

    if (status) {
      query += ` AND o.status = $${paramIdx++}`;
      params.push(status);
    }
    if (payment_status) {
      query += ` AND o.payment_status = $${paramIdx++}`;
      params.push(payment_status);
    }

    query += ` ORDER BY o.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await pool.query(query, params);
    res.json({ orders: result.rows });
  } catch (err) {
    console.error('Orders list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/orders/:id/approve-invoice
router.patch('/:id/approve-invoice', async (req, res) => {
  try {
    const orderResult = await pool.query(
      `SELECT o.*, c.phone as client_phone, c.name as client_name, t.phone_number_id, t.wa_token
       FROM orders o JOIN clients c ON c.id = o.client_id JOIN tenants t ON t.id = o.tenant_id
       WHERE o.id = $1 AND o.tenant_id = $2`,
      [req.params.id, req.tenantId]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = orderResult.rows[0];
    await pool.query(
      'UPDATE orders SET invoice_approved = true WHERE id = $1',
      [order.id]
    );

    // Generate invoice if not exists
    let invoice;
    try {
      invoice = await generateInvoice(order.id);
    } catch (invErr) {
      console.error('Invoice gen error:', invErr.message);
    }

    // Send notification to customer
    const waToken = order.wa_token || process.env.META_WHATSAPP_TOKEN;
    const phoneNumberId = order.phone_number_id || process.env.META_PHONE_NUMBER_ID;
    const msg = `📄 Your invoice${invoice ? ` ${invoice.invoiceNumber}` : ''} for order ${order.order_number} has been approved. Total: ₹${order.total}`;
    await sendTextMessage(phoneNumberId, waToken, order.client_phone, msg);

    res.json({ order: { ...order, invoice_approved: true }, invoice, message: 'Invoice approved and sent' });
  } catch (err) {
    console.error('Approve invoice error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/orders/:id/approve-courier
router.patch('/:id/approve-courier', async (req, res) => {
  try {
    const { courier_name, courier_company_id, selected_by } = req.body;

    const orderResult = await pool.query(
      `SELECT o.*, c.phone as client_phone, c.name as client_name, t.phone_number_id, t.wa_token
       FROM orders o JOIN clients c ON c.id = o.client_id JOIN tenants t ON t.id = o.tenant_id
       WHERE o.id = $1 AND o.tenant_id = $2`,
      [req.params.id, req.tenantId]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = orderResult.rows[0];
    order.client_name = order.client_name;
    order.client_phone = order.client_phone;

    // If courier_name provided, create shipment via courier service
    if (courier_name) {
      const shipResult = await courierService.createShipment(courier_name, order, courier_company_id);

      await pool.query(
        `UPDATE orders SET courier_slip_approved = true, awb_number = $1, courier_partner = $2, status = 'DISPATCHED'
         WHERE id = $3`,
        [shipResult.awb, courier_name, order.id]
      );

      // Create courier slip record
      const items = order.items_json || [];
      const weight = items.reduce((w, i) => w + (parseFloat(i.weight_kg) || 0.5) * (i.qty || 1), 0);
      await pool.query(
        `INSERT INTO courier_slips (order_id, tenant_id, status, weight_kg, courier_partner, awb_number, label_url, selected_by, approved_at)
         VALUES ($1, $2, 'APPROVED', $3, $4, $5, $6, $7, NOW())`,
        [order.id, req.tenantId, weight, courier_name, shipResult.awb, shipResult.label_url || null, selected_by || 'admin']
      );

      // Send WhatsApp to customer
      const waToken = order.wa_token || process.env.META_WHATSAPP_TOKEN;
      const phoneNumberId = order.phone_number_id || process.env.META_PHONE_NUMBER_ID;
      const trackingUrls = {
        shiprocket: `https://www.shiprocket.in/shipment-tracking/${shipResult.awb}`,
        delhivery: `https://www.delhivery.com/track/package/${shipResult.awb}`,
      };
      const trackUrl = trackingUrls[courier_name] || '';

      const msg = `✅ Your order ${order.order_number} has been dispatched!\n\nCourier: ${courier_name}\nAWB: ${shipResult.awb}${trackUrl ? `\nTrack: ${trackUrl}` : ''}\nEstimated delivery: 3-7 business days`;
      await sendTextMessage(phoneNumberId, waToken, order.client_phone, msg);

      res.json({ order: { ...order, courier_slip_approved: true, awb_number: shipResult.awb }, awb: shipResult.awb, message: 'Courier approved and dispatched' });
    } else {
      // Just approve without creating shipment (manual AWB)
      await pool.query(
        'UPDATE orders SET courier_slip_approved = true WHERE id = $1',
        [order.id]
      );
      res.json({ order: { ...order, courier_slip_approved: true }, message: 'Courier approved' });
    }
  } catch (err) {
    console.error('Approve courier error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

module.exports = router;
