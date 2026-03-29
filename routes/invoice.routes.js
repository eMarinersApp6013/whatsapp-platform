'use strict';
const express    = require('express');
const router     = express.Router();
const PDFDocument = require('pdfkit');
const pool       = require('../config/db');
const { sendWhatsAppMessage } = require('./webhook.routes');

// ── GET /api/invoice/:orderId ─────────────────────────────────────────────────
// Generate and stream PDF invoice for an order
router.get('/:orderId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, c.name as customer_name, c.phone as customer_phone, t.name as tenant_name
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN tenants t ON o.tenant_id = t.id
       WHERE o.id = $1`, [req.params.orderId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    const order = rows[0];

    const items = (() => {
      try {
        if (Array.isArray(order.items)) return order.items;
        return JSON.parse(order.items || '[]');
      } catch { return []; }
    })();

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${order.id}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(22).font('Helvetica-Bold').text(order.tenant_name || 'NavyStore', 40, 40);
    doc.fontSize(10).font('Helvetica').fillColor('#666')
       .text('WhatsApp Commerce Invoice', 40, 68);

    doc.moveDown();
    doc.strokeColor('#ddd').lineWidth(1).moveTo(40, 90).lineTo(555, 90).stroke();

    // Invoice details
    doc.fillColor('#000').fontSize(18).font('Helvetica-Bold')
       .text(`INVOICE`, 400, 40, { align: 'right' });
    doc.fontSize(10).font('Helvetica').fillColor('#666')
       .text(`#${String(order.id).padStart(6, '0')}`, 400, 65, { align: 'right' });
    doc.text(new Date(order.created_at).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric'
    }), 400, 80, { align: 'right' });

    // Bill to
    let y = 110;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('BILL TO:', 40, y);
    y += 15;
    doc.font('Helvetica').fillColor('#333')
       .text(order.customer_name || 'Customer', 40, y);
    y += 14;
    doc.fillColor('#666').text(order.customer_phone || '', 40, y);
    y += 14;
    if (order.notes) doc.text(order.notes, 40, y, { width: 200 });

    // Items table
    y = 200;
    doc.fillColor('#1a1a2e').rect(40, y, 515, 28).fill();
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10);
    doc.text('Item', 50, y + 9);
    doc.text('Qty', 330, y + 9, { width: 60, align: 'right' });
    doc.text('Price', 395, y + 9, { width: 75, align: 'right' });
    doc.text('Total', 475, y + 9, { width: 75, align: 'right' });

    y += 28;
    let subtotal = 0;
    items.forEach((item, i) => {
      const qty   = parseInt(item.qty   || item.quantity || 1);
      const price = parseFloat(item.price || item.selling_price || 0);
      const lineTotal = qty * price;
      subtotal += lineTotal;

      if (i % 2 === 0) doc.fillColor('#f9f9f9').rect(40, y, 515, 25).fill();
      doc.fillColor('#333').font('Helvetica').fontSize(9);
      doc.text(item.name || 'Product', 50, y + 8, { width: 270 });
      doc.text(String(qty), 330, y + 8, { width: 60, align: 'right' });
      doc.text(`₹${price.toLocaleString('en-IN')}`, 395, y + 8, { width: 75, align: 'right' });
      doc.text(`₹${lineTotal.toLocaleString('en-IN')}`, 475, y + 8, { width: 75, align: 'right' });
      y += 25;
    });

    // Total
    y += 10;
    doc.strokeColor('#ddd').lineWidth(0.5).moveTo(340, y).lineTo(555, y).stroke();
    y += 10;
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(11)
       .text('TOTAL', 395, y, { width: 75 });
    doc.fillColor('#25d366').fontSize(13)
       .text(`₹${subtotal.toLocaleString('en-IN')}`, 475, y - 1, { width: 75, align: 'right' });

    y += 40;
    doc.fillColor('#666').font('Helvetica').fontSize(9)
       .text('Thank you for shopping with us! 💚', 40, y, { align: 'center', width: 515 });

    doc.end();
  } catch (err) {
    console.error('[invoice]', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ── POST /api/invoice/:orderId/send ──────────────────────────────────────────
// Send invoice link via WhatsApp to customer
router.post('/:orderId/send', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, c.name as customer_name, c.phone as customer_phone, t.*
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN tenants t ON o.tenant_id = t.id
       WHERE o.id = $1`, [req.params.orderId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    const order = rows[0];

    if (!order.meta_whatsapp_token || order.meta_whatsapp_token === 'FILL_LATER') {
      return res.status(400).json({ error: 'WhatsApp not configured. Add Meta credentials in Settings.' });
    }

    const baseUrl = process.env.BASE_URL || 'https://whatsapp.nodesurge.tech';
    const invoiceUrl = `${baseUrl}/api/invoice/${order.id}`;

    const message =
      `🧾 *Invoice from ${order.name || 'NavyStore'}*\n\n` +
      `Order ID: *#${String(order.id).padStart(6, '0')}*\n` +
      `Amount: *₹${parseFloat(order.total_amount || 0).toLocaleString('en-IN')}*\n\n` +
      `Download your invoice: ${invoiceUrl}\n\n` +
      `Thank you for your order! 💚`;

    await sendWhatsAppMessage(
      order.customer_phone, message,
      order.meta_phone_number_id, order.meta_whatsapp_token
    );

    res.json({ success: true, message: 'Invoice sent via WhatsApp' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/invoice/:orderId/notify-status ──────────────────────────────────
// Send order status update via WhatsApp
router.post('/:orderId/notify-status', async (req, res) => {
  try {
    const { status, tracking_id } = req.body;
    const { rows } = await pool.query(
      `SELECT o.*, c.name as customer_name, c.phone as customer_phone, t.*
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN tenants t ON o.tenant_id = t.id
       WHERE o.id = $1`, [req.params.orderId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    const order = rows[0];

    if (!order.meta_whatsapp_token || order.meta_whatsapp_token === 'FILL_LATER') {
      return res.status(400).json({ error: 'WhatsApp not configured' });
    }

    const statusMessages = {
      confirmed:  `✅ *Order Confirmed!*\n\nYour order #${String(order.id).padStart(6,'0')} has been confirmed and is being prepared.`,
      shipped:    `🚚 *Order Shipped!*\n\nYour order #${String(order.id).padStart(6,'0')} is on its way!${tracking_id ? `\nTracking ID: *${tracking_id}*` : ''}\n\nExpected delivery: 3-5 business days.`,
      delivered:  `🎉 *Order Delivered!*\n\nYour order #${String(order.id).padStart(6,'0')} has been delivered.\n\nWe hope you love it! Rate your experience by replying.`,
      cancelled:  `❌ *Order Cancelled*\n\nYour order #${String(order.id).padStart(6,'0')} has been cancelled.\n\nAny payment will be refunded in 3-5 business days.`,
    };

    const message = (statusMessages[status] || `Order #${order.id} status: ${status}`) +
      `\n\nFor support, reply to this message. 💚`;

    await sendWhatsAppMessage(
      order.customer_phone, message,
      order.meta_phone_number_id, order.meta_whatsapp_token
    );

    res.json({ success: true, message: `${status} notification sent` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
