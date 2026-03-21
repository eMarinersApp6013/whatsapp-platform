/**
 * Generate a text-based order summary card.
 */
function generateOrderSummary({ orderNumber, items, subtotal, gstAmount, shippingCharge, total }) {
  const itemsList = Array.isArray(items) ? items : [];
  let lines = [];

  lines.push(`📋 *Order Summary*${orderNumber ? ` — ${orderNumber}` : ''}`);
  lines.push('─────────────────');

  for (const item of itemsList) {
    const name = item.name || item.product_name || 'Item';
    const qty = item.qty || item.quantity || 1;
    const price = parseFloat(item.price || 0);
    const lineTotal = (qty * price).toFixed(2);
    lines.push(`${name} × ${qty}  →  ₹${lineTotal}`);
  }

  lines.push('─────────────────');
  lines.push(`Subtotal: ₹${parseFloat(subtotal || 0).toFixed(2)}`);

  if (parseFloat(gstAmount || 0) > 0) {
    lines.push(`GST: ₹${parseFloat(gstAmount).toFixed(2)}`);
  }

  if (parseFloat(shippingCharge || 0) > 0) {
    lines.push(`Shipping: ₹${parseFloat(shippingCharge).toFixed(2)}`);
  }

  lines.push(`*Total: ₹${parseFloat(total || 0).toFixed(2)}*`);

  return lines.join('\n');
}

/**
 * Build a quotation message from cart items with shipping.
 */
function generateQuotation({ items, subtotal, gstAmount, shippingCharge, shippingZone, total }) {
  const itemsList = Array.isArray(items) ? items : [];
  let lines = [];

  lines.push('🧾 *Your Quotation*');
  lines.push('─────────────────');

  for (const item of itemsList) {
    const name = item.name || 'Item';
    const qty = item.qty || 1;
    const price = parseFloat(item.price || 0);
    const gst = parseFloat(item.gst_rate || 0);
    const lineTotal = (qty * price).toFixed(2);
    let line = `• ${name} × ${qty} = ₹${lineTotal}`;
    if (gst > 0) line += ` (+${gst}% GST)`;
    lines.push(line);
  }

  lines.push('─────────────────');
  lines.push(`Subtotal: ₹${parseFloat(subtotal || 0).toFixed(2)}`);

  if (parseFloat(gstAmount || 0) > 0) {
    lines.push(`GST: ₹${parseFloat(gstAmount).toFixed(2)}`);
  }

  if (parseFloat(shippingCharge || 0) > 0) {
    lines.push(`Shipping (${shippingZone || 'Standard'}): ₹${parseFloat(shippingCharge).toFixed(2)}`);
  } else if (shippingCharge === null || shippingCharge === undefined) {
    lines.push('Shipping: _will be calculated after address_');
  }

  lines.push('─────────────────');
  lines.push(`*Grand Total: ₹${parseFloat(total || 0).toFixed(2)}*`);

  return lines.join('\n');
}

module.exports = { generateOrderSummary, generateQuotation };
