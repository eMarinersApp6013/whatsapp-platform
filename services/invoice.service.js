const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

const INVOICES_DIR = path.join(__dirname, '..', 'uploads', 'invoices');

// Ensure invoices directory exists
if (!fs.existsSync(INVOICES_DIR)) {
  fs.mkdirSync(INVOICES_DIR, { recursive: true });
}

/**
 * Generate a professional GST invoice PDF for an order.
 * @param {number} orderId
 * @returns {object} { invoiceNumber, pdfPath, invoiceId }
 */
async function generateInvoice(orderId) {
  // Fetch order with client and tenant data
  const orderResult = await pool.query(
    `SELECT o.*, c.name as client_name, c.phone as client_phone, c.address_json as client_address,
      t.name as tenant_name, t.store_name, t.store_address, t.store_gstin, t.store_phone,
      t.bank_name, t.bank_account, t.bank_ifsc, t.upi_id
     FROM orders o
     JOIN clients c ON c.id = o.client_id
     JOIN tenants t ON t.id = o.tenant_id
     WHERE o.id = $1`,
    [orderId]
  );

  if (orderResult.rows.length === 0) {
    throw new Error(`Order #${orderId} not found`);
  }

  const order = orderResult.rows[0];
  const items = order.items_json || [];
  const clientAddress = typeof order.client_address === 'string' ? JSON.parse(order.client_address) : (order.client_address || {});
  const orderAddress = typeof order.address_json === 'string' ? JSON.parse(order.address_json) : (order.address_json || clientAddress);

  // Generate invoice number: INV-YYYY-TENANTID-XXXXXX
  const year = new Date().getFullYear();
  const countResult = await pool.query(
    'SELECT COUNT(*) as cnt FROM invoices WHERE tenant_id = $1',
    [order.tenant_id]
  );
  const seq = (parseInt(countResult.rows[0].cnt, 10) + 1).toString().padStart(6, '0');
  const invoiceNumber = `INV-${year}-${order.tenant_id}-${seq}`;

  const pdfFilename = `${invoiceNumber}.pdf`;
  const pdfPath = path.join(INVOICES_DIR, pdfFilename);

  // Create PDF
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const sellerName = order.store_name || order.tenant_name || 'Store';
    const pageWidth = doc.page.width - 80; // margins

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text(sellerName, { align: 'center' });
    doc.fontSize(9).font('Helvetica').text('TAX INVOICE', { align: 'center' });
    doc.moveDown(0.5);

    // Divider
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
    doc.moveDown(0.5);

    // Invoice meta — left and right columns
    const metaY = doc.y;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(`Invoice No: ${invoiceNumber}`, 40, metaY);
    doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 40, metaY + 13);
    doc.text(`Order: ${order.order_number || `#${order.id}`}`, 40, metaY + 26);

    doc.text(`Payment: ${order.payment_status || 'UNPAID'}`, 350, metaY, { align: 'right', width: pageWidth - 310 });
    doc.text(`Method: ${order.payment_method || 'Online'}`, 350, metaY + 13, { align: 'right', width: pageWidth - 310 });
    doc.moveDown(3);

    // Seller and Buyer boxes
    const boxY = doc.y;
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('SELLER:', 40, boxY);
    doc.font('Helvetica').fontSize(8);
    doc.text(sellerName, 40, boxY + 13);
    if (order.store_address) doc.text(order.store_address, 40, doc.y);
    if (order.store_gstin) doc.text(`GSTIN: ${order.store_gstin}`, 40, doc.y);
    if (order.store_phone) doc.text(`Phone: ${order.store_phone}`, 40, doc.y);

    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('BUYER:', 320, boxY);
    doc.font('Helvetica').fontSize(8);
    doc.text(order.client_name || 'Customer', 320, boxY + 13);
    if (orderAddress.flat) doc.text(orderAddress.flat, 320, doc.y);
    if (orderAddress.area) doc.text(orderAddress.area, 320, doc.y);
    const cityLine = [orderAddress.city, orderAddress.state, orderAddress.pincode].filter(Boolean).join(', ');
    if (cityLine) doc.text(cityLine, 320, doc.y);
    doc.text(`Phone: ${order.client_phone}`, 320, doc.y);

    doc.y = Math.max(doc.y, boxY + 75);
    doc.moveDown(1);

    // Divider
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y;
    const cols = { sr: 40, name: 65, hsn: 220, qty: 280, price: 315, gstPct: 370, gstAmt: 410, amount: 470 };

    doc.font('Helvetica-Bold').fontSize(8);
    doc.text('Sr', cols.sr, tableTop, { width: 25 });
    doc.text('Product', cols.name, tableTop, { width: 150 });
    doc.text('HSN', cols.hsn, tableTop, { width: 55 });
    doc.text('Qty', cols.qty, tableTop, { width: 30 });
    doc.text('Unit Price', cols.price, tableTop, { width: 50 });
    doc.text('GST%', cols.gstPct, tableTop, { width: 35 });
    doc.text('GST Amt', cols.gstAmt, tableTop, { width: 55 });
    doc.text('Amount', cols.amount, tableTop, { width: 70, align: 'right' });

    doc.moveTo(40, tableTop + 13).lineTo(doc.page.width - 40, tableTop + 13).stroke();

    // Table rows
    doc.font('Helvetica').fontSize(8);
    let rowY = tableTop + 18;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const qty = item.qty || 1;
      const price = parseFloat(item.price || 0);
      const gstRate = parseFloat(item.gst_rate || 0);
      const lineTotal = price * qty;
      const gstAmt = lineTotal * (gstRate / 100);

      doc.text(String(i + 1), cols.sr, rowY, { width: 25 });
      doc.text(item.name || 'Item', cols.name, rowY, { width: 150 });
      doc.text(item.hsn_code || '-', cols.hsn, rowY, { width: 55 });
      doc.text(String(qty), cols.qty, rowY, { width: 30 });
      doc.text(`₹${price.toFixed(2)}`, cols.price, rowY, { width: 50 });
      doc.text(`${gstRate}%`, cols.gstPct, rowY, { width: 35 });
      doc.text(`₹${gstAmt.toFixed(2)}`, cols.gstAmt, rowY, { width: 55 });
      doc.text(`₹${(lineTotal + gstAmt).toFixed(2)}`, cols.amount, rowY, { width: 70, align: 'right' });

      rowY += 15;
      if (rowY > 700) {
        doc.addPage();
        rowY = 40;
      }
    }

    // Divider
    doc.moveTo(40, rowY + 3).lineTo(doc.page.width - 40, rowY + 3).stroke();
    rowY += 10;

    // Totals
    doc.font('Helvetica-Bold').fontSize(9);
    const totalsX = 380;
    doc.text('Subtotal:', totalsX, rowY);
    doc.text(`₹${parseFloat(order.subtotal || 0).toFixed(2)}`, cols.amount, rowY, { width: 70, align: 'right' });
    rowY += 15;

    if (parseFloat(order.gst_amount || 0) > 0) {
      doc.text('GST Total:', totalsX, rowY);
      doc.text(`₹${parseFloat(order.gst_amount).toFixed(2)}`, cols.amount, rowY, { width: 70, align: 'right' });
      rowY += 15;
    }

    if (parseFloat(order.shipping_charge || 0) > 0) {
      doc.text('Shipping:', totalsX, rowY);
      doc.text(`₹${parseFloat(order.shipping_charge).toFixed(2)}`, cols.amount, rowY, { width: 70, align: 'right' });
      rowY += 15;
    }

    doc.fontSize(11);
    doc.text('GRAND TOTAL:', totalsX, rowY);
    doc.text(`₹${parseFloat(order.total || 0).toFixed(2)}`, cols.amount, rowY, { width: 70, align: 'right' });
    rowY += 25;

    // Bank details (for COD orders)
    if (order.payment_method === 'COD' || order.bank_name) {
      doc.font('Helvetica-Bold').fontSize(9).text('Bank Details:', 40, rowY);
      doc.font('Helvetica').fontSize(8);
      rowY += 13;
      if (order.bank_name) doc.text(`Bank: ${order.bank_name}`, 40, rowY); rowY += 11;
      if (order.bank_account) doc.text(`A/C: ${order.bank_account}`, 40, rowY); rowY += 11;
      if (order.bank_ifsc) doc.text(`IFSC: ${order.bank_ifsc}`, 40, rowY); rowY += 11;
      if (order.upi_id) doc.text(`UPI: ${order.upi_id}`, 40, rowY); rowY += 15;
    }

    // Footer
    doc.font('Helvetica').fontSize(8);
    doc.text('Thank you for your business!', 40, rowY + 10, { align: 'center', width: pageWidth });
    doc.text('This is a computer-generated invoice and does not require a signature.', 40, rowY + 22, { align: 'center', width: pageWidth });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  // Save invoice record in DB
  const invoiceResult = await pool.query(
    `INSERT INTO invoices (order_id, tenant_id, invoice_number, pdf_path, status)
     VALUES ($1, $2, $3, $4, 'DRAFT') RETURNING *`,
    [orderId, order.tenant_id, invoiceNumber, pdfPath]
  );

  console.log(`[Invoice] Generated ${invoiceNumber} for order #${orderId}`);

  return {
    invoiceId: invoiceResult.rows[0].id,
    invoiceNumber,
    pdfPath,
  };
}

module.exports = { generateInvoice, INVOICES_DIR };
