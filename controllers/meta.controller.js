const { pool } = require('../config/db');
const { sendTextMessage, sendImageMessage, downloadMedia, markAsRead } = require('../services/meta.service');
const { chat, transcribeAudio } = require('../services/openai.service');

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

  // Handle actions
  if (aiResponse.action === 'send_products' && aiResponse.products?.length > 0) {
    // Send product images with captions
    for (const product of aiResponse.products.slice(0, 5)) {
      const imageUrl = product.image_url || (product.image_urls && product.image_urls[0]);
      if (imageUrl) {
        const caption = `*${product.name}*\nPrice: ₹${product.price}`;
        await sendImageMessage(phoneNumberId, waToken, phone, imageUrl, caption);
      }
    }
  }

  // Update client rank if AI detected it and it wasn't set
  if (!client.rank && aiResponse.intent === 'buying_intent') {
    // The AI should have asked for rank — will be captured in next message
  }

  // TODO Phase 4: handle build_quote, ask_address, send_payment actions
  // TODO Phase 4: handle create_ticket action
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
