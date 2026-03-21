const { pool } = require('../config/db');
const { sendTextMessage, sendImageMessage, downloadMedia, markAsRead } = require('../services/meta.service');
const { chat, transcribeAudio } = require('../services/openai.service');
const { createOrder: createCashfreeOrder } = require('../services/cashfree.service');
const { getZone, calculateShipping } = require('../utils/pincode.utils');
const { generateQuotation, generateOrderSummary } = require('../utils/image.utils');

// GET /webhook/meta — Meta verification
exports.verify = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.META_VERIFY_TOKEN || 'navystore_verify';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('Meta webhook verified');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

// POST /webhook/meta — receive WhatsApp messages
exports.receive = async (req, res) => {
  // Always respond 200 quickly to Meta
  res.sendStatus(200);

  try {
    const body = req.body;
    if (!body.object || body.object !== 'whatsapp_business_account') return;

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const phoneNumberId = value.metadata?.phone_number_id;
        const messages = value.messages || [];

        // Look up tenant by phone_number_id
        const tenantResult = await pool.query(
          'SELECT * FROM tenants WHERE phone_number_id = $1 AND is_active = true',
          [phoneNumberId]
        );
        if (tenantResult.rows.length === 0) {
          console.warn('No tenant found for phone_number_id:', phoneNumberId);
          continue;
        }
        const tenant = tenantResult.rows[0];
        const waToken = tenant.wa_token || process.env.META_WHATSAPP_TOKEN;

        for (const msg of messages) {
          try {
            await processMessage(msg, value, tenant, phoneNumberId, waToken);
          } catch (msgErr) {
            console.error('Error processing message:', msgErr);
          }
        }
      }
    }
  } catch (err) {
    console.error('Webhook receive error:', err);
  }
};

/**
 * Process a single incoming WhatsApp message.
 */
async function processMessage(msg, value, tenant, phoneNumberId, waToken) {
  const senderPhone = msg.from;
  const msgType = msg.type || 'text';
  const messageId = msg.id;

  // Mark as read
  markAsRead(phoneNumberId, waToken, messageId);

  // RULE #4: ALWAYS check staff_numbers table FIRST
  const staffResult = await pool.query(
    'SELECT * FROM staff_numbers WHERE tenant_id = $1 AND phone = $2 AND is_active = true',
    [tenant.id, senderPhone]
  );
  const isStaff = staffResult.rows.length > 0;

  // Extract message text based on type
  let messageText = '';
  let mediaFile = null;

  if (msgType === 'text') {
    messageText = msg.text?.body || '';
  } else if (msgType === 'interactive') {
    messageText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
  } else if (msgType === 'audio') {
    // Download audio + transcribe via Whisper
    const mediaId = msg.audio?.id;
    if (mediaId) {
      mediaFile = await downloadMedia(mediaId, waToken);
      if (mediaFile) {
        try {
          messageText = await transcribeAudio(mediaFile.filePath);
          console.log(`[Whisper] Transcribed: ${messageText}`);
        } catch (err) {
          console.error('Whisper transcription error:', err);
          messageText = '[audio message - transcription failed]';
        }
      }
    }
  } else if (msgType === 'image' || msgType === 'video' || msgType === 'document') {
    // RULE #5: Save media immediately — Meta URLs expire in 24hrs
    const mediaId = msg[msgType]?.id;
    if (mediaId) {
      mediaFile = await downloadMedia(mediaId, waToken);
    }
    messageText = msg[msgType]?.caption || `[${msgType}]`;
  } else {
    messageText = `[${msgType} message]`;
  }

  if (!messageText.trim()) return;

  // Find or create client
  let client = null;
  let clientId = null;
  if (!isStaff) {
    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE tenant_id = $1 AND phone = $2',
      [tenant.id, senderPhone]
    );
    if (clientResult.rows.length > 0) {
      client = clientResult.rows[0];
      clientId = client.id;
    } else {
      const contactName = value.contacts?.[0]?.profile?.name || senderPhone;
      const newClient = await pool.query(
        'INSERT INTO clients (tenant_id, phone, name) VALUES ($1, $2, $3) RETURNING *',
        [tenant.id, senderPhone, contactName]
      );
      client = newClient.rows[0];
      clientId = client.id;
    }
  }

  // Save incoming message to conversations
  await pool.query(
    `INSERT INTO conversations (client_id, tenant_id, phone, role, message, message_type)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [clientId, tenant.id, senderPhone, isStaff ? 'staff' : 'client', messageText, msgType === 'audio' ? 'audio_transcribed' : msgType]
  );

  console.log(`[${tenant.name}] ${isStaff ? 'STAFF' : 'CLIENT'} ${senderPhone}: ${messageText}`);

  if (isStaff) {
    await handleStaffMessage(tenant, senderPhone, messageText, phoneNumberId, waToken);
  } else {
    await handleClientMessage(tenant, client, senderPhone, messageText, phoneNumberId, waToken);
  }
}

/**
 * Handle staff WhatsApp commands.
 */
async function handleStaffMessage(tenant, phone, message, phoneNumberId, waToken) {
  const cmd = message.trim().toLowerCase();
  let reply = '';

  if (cmd === 'orders') {
    // List today's pending orders
    const result = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.total, c.name as client_name
       FROM orders o LEFT JOIN clients c ON c.id = o.client_id
       WHERE o.tenant_id = $1 AND o.status IN ('PENDING','CONFIRMED') AND o.created_at >= CURRENT_DATE
       ORDER BY o.created_at DESC LIMIT 20`,
      [tenant.id]
    );
    if (result.rows.length === 0) {
      reply = 'No pending orders today.';
    } else {
      reply = '*Today\'s Pending Orders:*\n\n' +
        result.rows.map((o) => `#${o.id} | ${o.order_number || 'N/A'} | ${o.client_name || 'Unknown'} | ₹${o.total} | ${o.status}`).join('\n');
    }
  } else if (cmd.startsWith('order #') || cmd.startsWith('order ')) {
    const orderId = cmd.replace('order #', '').replace('order ', '').trim();
    const result = await pool.query(
      `SELECT o.*, c.name as client_name, c.phone as client_phone
       FROM orders o LEFT JOIN clients c ON c.id = o.client_id
       WHERE o.id = $1 AND o.tenant_id = $2`,
      [parseInt(orderId, 10), tenant.id]
    );
    if (result.rows.length === 0) {
      reply = `Order #${orderId} not found.`;
    } else {
      const o = result.rows[0];
      reply = `*Order #${o.id}*\nNumber: ${o.order_number || 'N/A'}\nClient: ${o.client_name} (${o.client_phone})\nStatus: ${o.status}\nPayment: ${o.payment_status}\nSubtotal: ₹${o.subtotal}\nGST: ₹${o.gst_amount}\nShipping: ₹${o.shipping_charge}\n*Total: ₹${o.total}*\nInvoice Approved: ${o.invoice_approved ? 'Yes' : 'No'}\nAWB: ${o.awb_number || 'N/A'}`;
    }
  } else if (cmd.startsWith('approve invoice ')) {
    const orderId = cmd.replace('approve invoice ', '').trim();
    const result = await pool.query(
      'UPDATE orders SET invoice_approved = true WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [parseInt(orderId, 10), tenant.id]
    );
    if (result.rows.length === 0) {
      reply = `Order #${orderId} not found.`;
    } else {
      reply = `✅ Invoice approved for Order #${orderId}. PDF will be sent to client.`;
      // TODO Phase 5: trigger Zoho email to client
    }
  } else if (cmd.startsWith('approve courier ')) {
    const orderId = cmd.replace('approve courier ', '').trim();
    const result = await pool.query(
      'UPDATE orders SET courier_slip_approved = true WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [parseInt(orderId, 10), tenant.id]
    );
    if (result.rows.length === 0) {
      reply = `Order #${orderId} not found.`;
    } else {
      reply = `✅ Courier approved for Order #${orderId}. AWB will be generated.`;
      // TODO Phase 5: generate AWB via Shiprocket
    }
  } else if (cmd.startsWith('shipped ')) {
    const orderId = cmd.replace('shipped ', '').trim();
    const result = await pool.query(
      `UPDATE orders SET status = 'DISPATCHED' WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [parseInt(orderId, 10), tenant.id]
    );
    if (result.rows.length === 0) {
      reply = `Order #${orderId} not found.`;
    } else {
      reply = `📦 Order #${orderId} marked as DISPATCHED.`;
    }
  } else if (cmd === 'report') {
    const result = await pool.query(
      `SELECT COUNT(*) as total_orders, COALESCE(SUM(total),0) as total_revenue,
       COUNT(*) FILTER (WHERE payment_status = 'PAID') as paid_orders,
       COUNT(*) FILTER (WHERE status = 'DISPATCHED') as dispatched
       FROM orders WHERE tenant_id = $1 AND created_at >= CURRENT_DATE`,
      [tenant.id]
    );
    const r = result.rows[0];
    reply = `*Today's Report:*\nOrders: ${r.total_orders}\nRevenue: ₹${r.total_revenue}\nPaid: ${r.paid_orders}\nDispatched: ${r.dispatched}`;
  } else {
    reply = `*Staff Commands:*\n• orders — today's pending\n• order #ID — order details\n• approve invoice ID\n• approve courier ID\n• shipped ID\n• report — today's summary`;
  }

  await sendTextMessage(phoneNumberId, waToken, phone, reply);

  // Save staff reply to conversations
  await pool.query(
    `INSERT INTO conversations (client_id, tenant_id, phone, role, message, message_type)
     VALUES (NULL, $1, $2, 'system', $3, 'text')`,
    [tenant.id, phone, reply]
  );
}

/**
 * Handle client WhatsApp messages — route through GPT-4o.
 */
async function handleClientMessage(tenant, client, phone, messageText, phoneNumberId, waToken) {
  // Check if client has a pending order awaiting address
  const pendingOrder = await pool.query(
    `SELECT * FROM orders WHERE tenant_id = $1 AND client_id = $2 AND status = 'PENDING_ADDRESS' ORDER BY created_at DESC LIMIT 1`,
    [tenant.id, client.id]
  );

  // Load full product catalog for this tenant
  const productsResult = await pool.query(
    'SELECT * FROM products WHERE tenant_id = $1 AND is_active = true ORDER BY name',
    [tenant.id]
  );
  const products = productsResult.rows;

  // Load last 10 conversation messages
  const historyResult = await pool.query(
    'SELECT role, message FROM conversations WHERE tenant_id = $1 AND phone = $2 ORDER BY created_at DESC LIMIT 10',
    [tenant.id, phone]
  );
  const history = historyResult.rows.reverse();

  // Call GPT-4o
  let aiResponse;
  try {
    aiResponse = await chat(tenant, client, products, history, messageText);
  } catch (err) {
    console.error('OpenAI API error:', err);
    const fallback = 'Sorry, I\'m having trouble right now. Please try again in a moment.';
    await sendTextMessage(phoneNumberId, waToken, phone, fallback);
    await saveAssistantMessage(tenant.id, client.id, phone, fallback);
    return;
  }

  console.log(`[AI] intent=${aiResponse.intent} action=${aiResponse.action}`);

  // Send the text reply
  if (aiResponse.reply) {
    await sendTextMessage(phoneNumberId, waToken, phone, aiResponse.reply);
    await saveAssistantMessage(tenant.id, client.id, phone, aiResponse.reply);
  }

  // Update client rank if AI detected it from conversation
  if (aiResponse.client_rank && aiResponse.client_rank !== client.rank) {
    await pool.query(
      'UPDATE clients SET rank = $1 WHERE id = $2 AND tenant_id = $3',
      [aiResponse.client_rank, client.id, tenant.id]
    );
  }

  // Handle actions
  const action = aiResponse.action;

  if (action === 'send_products' && aiResponse.products?.length > 0) {
    await handleSendProducts(tenant, phone, phoneNumberId, waToken, aiResponse.products);
  } else if (action === 'build_quote' && aiResponse.cart?.length > 0) {
    await handleBuildQuote(tenant, client, phone, phoneNumberId, waToken, aiResponse.cart);
  } else if (action === 'ask_address') {
    await handleAskAddress(tenant, client, phone, phoneNumberId, waToken, aiResponse.cart, pendingOrder.rows[0]);
  } else if (action === 'send_payment' || aiResponse.intent === 'address_given') {
    await handleAddressAndPayment(tenant, client, phone, phoneNumberId, waToken, aiResponse, pendingOrder.rows[0]);
  } else if (action === 'create_ticket') {
    await handleCreateTicket(tenant, client, phone, phoneNumberId, waToken, aiResponse, messageText);
  }
}

/**
 * Send product images/cards to customer.
 */
async function handleSendProducts(tenant, phone, phoneNumberId, waToken, aiProducts) {
  const productIds = aiProducts.map((p) => p.id).filter(Boolean);
  let dbProducts = [];
  if (productIds.length > 0) {
    const placeholders = productIds.map((_, i) => `$${i + 2}`).join(',');
    const dbResult = await pool.query(
      `SELECT * FROM products WHERE tenant_id = $1 AND id IN (${placeholders}) AND is_active = true`,
      [tenant.id, ...productIds]
    );
    dbProducts = dbResult.rows;
  }

  for (const dbProd of dbProducts.slice(0, 5)) {
    const imageUrl = dbProd.image_urls && dbProd.image_urls.length > 0 ? dbProd.image_urls[0] : null;
    if (imageUrl) {
      const caption = `*${dbProd.name}*\nSKU: ${dbProd.sku || 'N/A'}\nPrice: ₹${dbProd.price}${dbProd.gst_rate > 0 ? ` + ${dbProd.gst_rate}% GST` : ''}${dbProd.stock_qty <= 0 ? '\n⚠️ Out of stock' : ''}`;
      await sendImageMessage(phoneNumberId, waToken, phone, imageUrl, caption);
    } else {
      const text = `📦 *${dbProd.name}*\nSKU: ${dbProd.sku || 'N/A'}\nPrice: ₹${dbProd.price}${dbProd.gst_rate > 0 ? ` + ${dbProd.gst_rate}% GST` : ''}${dbProd.stock_qty <= 0 ? '\n⚠️ Out of stock' : ''}`;
      await sendTextMessage(phoneNumberId, waToken, phone, text);
    }
  }

  // Fallback if no products found in DB
  if (dbProducts.length === 0) {
    for (const product of aiProducts.slice(0, 5)) {
      const imageUrl = product.image_url || (product.image_urls && product.image_urls[0]);
      if (imageUrl) {
        const caption = `*${product.name}*\nPrice: ₹${product.price}`;
        await sendImageMessage(phoneNumberId, waToken, phone, imageUrl, caption);
      }
    }
  }
}

/**
 * Build quotation from cart items with prices from DB.
 */
async function handleBuildQuote(tenant, client, phone, phoneNumberId, waToken, cart) {
  // Fetch real product data for cart items
  const productIds = cart.map((c) => c.product_id).filter(Boolean);
  let dbProducts = [];
  if (productIds.length > 0) {
    const placeholders = productIds.map((_, i) => `$${i + 2}`).join(',');
    const dbResult = await pool.query(
      `SELECT * FROM products WHERE tenant_id = $1 AND id IN (${placeholders}) AND is_active = true`,
      [tenant.id, ...productIds]
    );
    dbProducts = dbResult.rows;
  }
  const productMap = {};
  for (const p of dbProducts) productMap[p.id] = p;

  // Calculate totals from DB prices
  let subtotal = 0;
  let gstAmount = 0;
  let totalWeight = 0;
  const resolvedItems = [];

  for (const item of cart) {
    const dbProd = productMap[item.product_id];
    const price = dbProd ? parseFloat(dbProd.price) : parseFloat(item.price || 0);
    const qty = item.qty || 1;
    const gstRate = dbProd ? parseFloat(dbProd.gst_rate || 0) : 0;
    const weight = dbProd ? parseFloat(dbProd.weight_kg || 0) : 0;
    const lineTotal = price * qty;
    const lineGst = lineTotal * (gstRate / 100);

    subtotal += lineTotal;
    gstAmount += lineGst;
    totalWeight += weight * qty;

    resolvedItems.push({
      product_id: item.product_id,
      name: dbProd ? dbProd.name : item.name,
      qty,
      price,
      gst_rate: gstRate,
      weight_kg: weight,
      line_total: lineTotal,
    });
  }

  const total = subtotal + gstAmount;

  // Send quotation (shipping TBD until address)
  const quoteMsg = generateQuotation({
    items: resolvedItems,
    subtotal,
    gstAmount,
    shippingCharge: null,
    total,
  });

  const fullMsg = quoteMsg + '\n\n_Shipping will be calculated once you share your delivery address._\n\nPlease share your *full delivery address* including:\n• Name\n• Flat/House, Area\n• City\n• Pincode\n• State';
  await sendTextMessage(phoneNumberId, waToken, phone, fullMsg);
  await saveAssistantMessage(tenant.id, client.id, phone, fullMsg);

  // Create a pending order in DB
  const orderNumber = `NV-${Date.now().toString(36).toUpperCase()}`;
  await pool.query(
    `INSERT INTO orders (tenant_id, client_id, order_number, status, items_json, subtotal, gst_amount, total, payment_status)
     VALUES ($1, $2, $3, 'PENDING_ADDRESS', $4, $5, $6, $7, 'UNPAID')`,
    [tenant.id, client.id, orderNumber, JSON.stringify(resolvedItems), subtotal.toFixed(2), gstAmount.toFixed(2), total.toFixed(2)]
  );

  console.log(`[Order] Created ${orderNumber} for ${client.phone} — PENDING_ADDRESS`);
}

/**
 * Ask customer for delivery address (cart may optionally be saved).
 */
async function handleAskAddress(tenant, client, phone, phoneNumberId, waToken, cart, existingOrder) {
  // If cart provided and no existing pending order, create one
  if (cart?.length > 0 && !existingOrder) {
    await handleBuildQuote(tenant, client, phone, phoneNumberId, waToken, cart);
    return;
  }

  // Otherwise just ask for address
  const addressMsg = 'Please share your *full delivery address*:\n\n• Full Name\n• Flat/House No., Building, Area\n• City\n• *Pincode* (6-digit)\n• State';
  await sendTextMessage(phoneNumberId, waToken, phone, addressMsg);
  await saveAssistantMessage(tenant.id, client.id, phone, addressMsg);
}

/**
 * Process address, calculate shipping, generate Cashfree payment link.
 */
async function handleAddressAndPayment(tenant, client, phone, phoneNumberId, waToken, aiResponse, pendingOrder) {
  if (!pendingOrder) {
    // No pending order — ask AI to build_quote first
    const msg = 'I don\'t have a pending order for you yet. Could you tell me what you\'d like to order?';
    await sendTextMessage(phoneNumberId, waToken, phone, msg);
    await saveAssistantMessage(tenant.id, client.id, phone, msg);
    return;
  }

  // Parse address from AI response
  const address = aiResponse.address || {};
  const pincode = address.pincode || extractPincode(aiResponse.reply || '') || extractPincode(aiResponse.raw_address || '');

  if (!pincode || !/^\d{6}$/.test(String(pincode))) {
    const msg = 'I need your *6-digit pincode* to calculate shipping. Could you share it?';
    await sendTextMessage(phoneNumberId, waToken, phone, msg);
    await saveAssistantMessage(tenant.id, client.id, phone, msg);
    return;
  }

  // Validate pincode and get shipping zone
  const zone = getZone(pincode);

  // Look up shipping rate for this zone
  const rateResult = await pool.query(
    `SELECT * FROM shipping_rates WHERE tenant_id = $1 AND zone = $2 LIMIT 1`,
    [tenant.id, zone]
  );
  const shippingRate = rateResult.rows[0] || null;

  // Calculate total weight from order items
  const items = pendingOrder.items_json || [];
  let totalWeight = 0;
  for (const item of items) {
    totalWeight += (parseFloat(item.weight_kg) || 0.5) * (item.qty || 1);
  }

  const shippingCharge = calculateShipping(shippingRate, totalWeight);
  const subtotal = parseFloat(pendingOrder.subtotal);
  const gstAmount = parseFloat(pendingOrder.gst_amount);
  const grandTotal = subtotal + gstAmount + shippingCharge;

  // Build address JSON
  const addressJson = {
    name: address.name || client.name,
    flat: address.flat || address.line1 || '',
    area: address.area || address.line2 || '',
    city: address.city || '',
    pincode: String(pincode),
    state: address.state || '',
    zone,
    raw: aiResponse.raw_address || '',
  };

  // Update order with address and shipping
  await pool.query(
    `UPDATE orders SET
      address_json = $1,
      shipping_charge = $2,
      total = $3,
      status = 'PENDING_PAYMENT'
     WHERE id = $4`,
    [JSON.stringify(addressJson), shippingCharge.toFixed(2), grandTotal.toFixed(2), pendingOrder.id]
  );

  // Also update client address
  await pool.query(
    'UPDATE clients SET address_json = $1 WHERE id = $2 AND tenant_id = $3',
    [JSON.stringify(addressJson), client.id, tenant.id]
  );

  // Send final quotation with shipping
  const finalQuote = generateQuotation({
    items,
    subtotal,
    gstAmount,
    shippingCharge,
    shippingZone: zone,
    total: grandTotal,
  });

  await sendTextMessage(phoneNumberId, waToken, phone, finalQuote);
  await saveAssistantMessage(tenant.id, client.id, phone, finalQuote);

  // Generate Cashfree payment link
  try {
    const cfResult = await createCashfreeOrder({
      orderId: pendingOrder.order_number,
      orderAmount: grandTotal,
      customerPhone: phone,
      customerName: client.name,
    });

    // Save Cashfree order ID
    await pool.query(
      'UPDATE orders SET cashfree_order_id = $1 WHERE id = $2',
      [cfResult.order_id || cfResult.cf_order_id, pendingOrder.id]
    );

    const paymentMsg = `💳 *Pay Online — ₹${grandTotal.toFixed(2)}*\n\n${cfResult.payment_link}\n\nPay securely via UPI, cards, or net banking.\n\n_Prepaid orders get priority shipping!_ 🚀`;
    await sendTextMessage(phoneNumberId, waToken, phone, paymentMsg);
    await saveAssistantMessage(tenant.id, client.id, phone, paymentMsg);

    console.log(`[Payment] Cashfree link sent for order ${pendingOrder.order_number}: ${cfResult.payment_link}`);
  } catch (err) {
    console.error('Cashfree payment link error:', err);
    const errMsg = 'Sorry, I couldn\'t generate the payment link right now. Our team will send it to you shortly.';
    await sendTextMessage(phoneNumberId, waToken, phone, errMsg);
    await saveAssistantMessage(tenant.id, client.id, phone, errMsg);

    // Notify staff about the failure
    const staffResult = await pool.query(
      'SELECT phone FROM staff_numbers WHERE tenant_id = $1 AND is_active = true',
      [tenant.id]
    );
    for (const staff of staffResult.rows) {
      await sendTextMessage(phoneNumberId, waToken, staff.phone,
        `⚠️ Payment link failed for Order #${pendingOrder.id} (${pendingOrder.order_number})\nClient: ${client.name} (${phone})\nTotal: ₹${grandTotal.toFixed(2)}\nError: ${err.message}`
      );
    }
  }
}

/**
 * Create a support ticket.
 */
async function handleCreateTicket(tenant, client, phone, phoneNumberId, waToken, aiResponse, messageText) {
  const issueType = aiResponse.intent === 'complaint' ? 'complaint' : aiResponse.intent === 'order_status' ? 'order_status' : 'general';

  // Try to link to most recent order
  const recentOrder = await pool.query(
    'SELECT id FROM orders WHERE tenant_id = $1 AND client_id = $2 ORDER BY created_at DESC LIMIT 1',
    [tenant.id, client.id]
  );
  const orderId = recentOrder.rows[0]?.id || null;

  await pool.query(
    `INSERT INTO support_tickets (order_id, client_id, tenant_id, issue_type, description, status)
     VALUES ($1, $2, $3, $4, $5, 'OPEN')`,
    [orderId, client.id, tenant.id, issueType, messageText]
  );

  // Notify staff
  const staffResult = await pool.query(
    'SELECT phone FROM staff_numbers WHERE tenant_id = $1 AND is_active = true',
    [tenant.id]
  );
  for (const staff of staffResult.rows) {
    await sendTextMessage(phoneNumberId, waToken, staff.phone,
      `🎫 *New Support Ticket*\nClient: ${client.name} (${phone})\nType: ${issueType}\nMessage: ${messageText.slice(0, 200)}`
    );
  }
}

/**
 * Extract a 6-digit pincode from text.
 */
function extractPincode(text) {
  const match = String(text).match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

/**
 * Save assistant/system reply to conversations table.
 */
async function saveAssistantMessage(tenantId, clientId, phone, message) {
  await pool.query(
    `INSERT INTO conversations (client_id, tenant_id, phone, role, message, message_type)
     VALUES ($1, $2, $3, 'assistant', $4, 'text')`,
    [clientId, tenantId, phone, message]
  );
}
