const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { pool } = require('../config/db');
const { generateInvoice, INVOICES_DIR } = require('../services/invoice.service');
const { sendTextMessage } = require('../services/meta.service');
const { createInvoice: zohoCreate, emailInvoice: zohoEmail } = require('../services/zoho.service');

// GET /api/invoices
exports.list = async (req, res) => {
  try {
    const { status, from_date, to_date, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let query = `SELECT i.*, o.order_number, o.total as order_total, c.name as client_name, c.phone as client_phone
      FROM invoices i
      JOIN orders o ON o.id = i.order_id
      JOIN clients c ON c.id = o.client_id
      WHERE i.tenant_id = $1`;
    const params = [req.tenantId];
    let idx = 2;

    if (status) { query += ` AND i.status = $${idx++}`; params.push(status); }
    if (from_date) { query += ` AND i.created_at >= $${idx++}`; params.push(from_date); }
    if (to_date) { query += ` AND i.created_at <= $${idx++}`; params.push(to_date + 'T23:59:59Z'); }
    if (search) {
      query += ` AND (i.invoice_number ILIKE $${idx} OR o.order_number ILIKE $${idx} OR c.name ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }

    query += ` ORDER BY i.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await pool.query(query, params);
    res.json({ invoices: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('Invoices list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/invoices/generate/:orderId
exports.generate = async (req, res) => {
  try {
    // Check order belongs to tenant
    const orderCheck = await pool.query(
      'SELECT id FROM orders WHERE id = $1 AND tenant_id = $2',
      [req.params.orderId, req.tenantId]
    );
    if (orderCheck.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    // Check if invoice already exists
    const existing = await pool.query(
      'SELECT * FROM invoices WHERE order_id = $1 AND tenant_id = $2',
      [req.params.orderId, req.tenantId]
    );
    if (existing.rows.length > 0) {
      return res.json({ invoice: existing.rows[0], message: 'Invoice already exists' });
    }

    const result = await generateInvoice(parseInt(req.params.orderId, 10));
    const invoice = await pool.query('SELECT * FROM invoices WHERE id = $1', [result.invoiceId]);
    res.status(201).json({ invoice: invoice.rows[0] });
  } catch (err) {
    console.error('Invoice generate error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

// GET /api/invoices/:id/download
exports.download = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const invoice = result.rows[0];
    if (!invoice.pdf_path || !fs.existsSync(invoice.pdf_path)) {
      return res.status(404).json({ error: 'PDF file not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
    fs.createReadStream(invoice.pdf_path).pipe(res);
  } catch (err) {
    console.error('Invoice download error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// PUT /api/invoices/:id — edit invoice details
exports.update = async (req, res) => {
  try {
    const { status } = req.body;
    const result = await pool.query(
      'SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    if (result.rows[0].status === 'SENT') {
      return res.status(400).json({ error: 'Cannot edit a sent invoice' });
    }

    // Allow editing status only (address/GST edits go through order)
    if (status && ['DRAFT', 'APPROVED'].includes(status)) {
      const updated = await pool.query(
        'UPDATE invoices SET status = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *',
        [status, req.params.id, req.tenantId]
      );
      return res.json({ invoice: updated.rows[0] });
    }

    // Regenerate PDF if order details were updated
    const invoice = result.rows[0];
    const newResult = await generateInvoice(invoice.order_id);
    await pool.query(
      'UPDATE invoices SET pdf_path = $1 WHERE id = $2',
      [newResult.pdfPath, invoice.id]
    );
    const updated = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoice.id]);
    res.json({ invoice: updated.rows[0], message: 'Invoice regenerated' });
  } catch (err) {
    console.error('Invoice update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/invoices/:id/approve — approve and send to customer
exports.approve = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.*, o.order_number, o.total, o.client_id,
        c.name as client_name, c.phone as client_phone,
        t.phone_number_id, t.wa_token, t.zoho_enabled, t.invoice_provider
       FROM invoices i
       JOIN orders o ON o.id = i.order_id
       JOIN clients c ON c.id = o.client_id
       JOIN tenants t ON t.id = i.tenant_id
       WHERE i.id = $1 AND i.tenant_id = $2`,
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const invoice = result.rows[0];

    // Update invoice status
    await pool.query(
      "UPDATE invoices SET status = 'SENT', sent_at = NOW() WHERE id = $1",
      [invoice.id]
    );

    // Update order
    await pool.query(
      'UPDATE orders SET invoice_approved = true WHERE id = $1',
      [invoice.order_id]
    );

    // Send PDF via WhatsApp (as document)
    const waToken = invoice.wa_token || process.env.META_WHATSAPP_TOKEN;
    const phoneNumberId = invoice.phone_number_id || process.env.META_PHONE_NUMBER_ID;

    const msg = `📄 *Invoice ${invoice.invoice_number}*\n\nHi ${invoice.client_name}, your invoice for order ${invoice.order_number} (₹${invoice.total}) has been approved and is attached.\n\nThank you for shopping with us!`;
    await sendTextMessage(phoneNumberId, waToken, invoice.client_phone, msg);

    // Save to conversations
    await pool.query(
      `INSERT INTO conversations (client_id, tenant_id, phone, role, message, message_type)
       VALUES ($1, $2, $3, 'system', $4, 'text')`,
      [invoice.client_id, req.tenantId, invoice.client_phone, msg]
    );

    // If Zoho enabled, also push there
    if (invoice.zoho_enabled && invoice.invoice_provider === 'zoho') {
      try {
        const order = await pool.query('SELECT * FROM orders WHERE id = $1', [invoice.order_id]);
        const tenant = await pool.query('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
        const zohoInv = await zohoCreate(order.rows[0], tenant.rows[0]);
        await pool.query(
          'UPDATE invoices SET zoho_invoice_id = $1 WHERE id = $2',
          [zohoInv.invoice_id, invoice.id]
        );
        await zohoEmail(zohoInv.invoice_id);
      } catch (zohoErr) {
        console.error('Zoho invoice error (non-fatal):', zohoErr.message);
      }
    }

    const updated = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoice.id]);
    res.json({ invoice: updated.rows[0], message: 'Invoice approved and sent to customer' });
  } catch (err) {
    console.error('Invoice approve error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/invoices/bulk-download
exports.bulkDownload = async (req, res) => {
  try {
    const { invoice_ids } = req.body;
    if (!invoice_ids || !Array.isArray(invoice_ids) || invoice_ids.length === 0) {
      return res.status(400).json({ error: 'invoice_ids array is required' });
    }

    const placeholders = invoice_ids.map((_, i) => `$${i + 2}`).join(',');
    const result = await pool.query(
      `SELECT * FROM invoices WHERE tenant_id = $1 AND id IN (${placeholders})`,
      [req.tenantId, ...invoice_ids]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'No invoices found' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="invoices.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const inv of result.rows) {
      if (inv.pdf_path && fs.existsSync(inv.pdf_path)) {
        archive.file(inv.pdf_path, { name: `${inv.invoice_number}.pdf` });
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error('Bulk download error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Server error' });
  }
};
