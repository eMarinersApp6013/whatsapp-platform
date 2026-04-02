'use strict'
const express  = require('express')
const router   = express.Router()
const pool     = require('../config/db')
const OpenAI   = require('openai')
const metaSvc  = require('../services/meta.service')
const catalog  = require('../controllers/catalog.controller')

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'navystore_webhook_verify_2024'
const TENANT_ID    = 1

// ── Webhook verification ──────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Webhook] Verified by Meta')
    return res.status(200).send(challenge)
  }
  return res.status(403).json({ error: 'Verification failed' })
})

// ── Incoming messages ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  res.sendStatus(200) // Always respond to Meta within 5s
  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value
    if (!value?.messages?.length) return

    const msg     = value.messages[0]
    const from    = msg.from
    const msgType = msg.type
    let content   = ''
    let mediaUrl  = ''

    if (msgType === 'text')     content = msg.text?.body || ''
    if (msgType === 'audio')    { content = '[Voice message]'; mediaUrl = await resolveMediaUrl(msg.audio?.id) }
    if (msgType === 'image')    { content = '[Image]'; mediaUrl = await resolveMediaUrl(msg.image?.id) }
    if (msgType === 'document') { content = '[Document]' }
    if (msgType === 'button')   content = msg.button?.text || ''
    if (msgType === 'interactive') {
      content = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || ''
    }

    await processMessage(from, content, msgType, mediaUrl, req.app)
  } catch (err) {
    console.error('[Webhook POST]', err.message)
  }
})

// ── Process incoming message ──────────────────────────────────────────────────
async function processMessage(phone, content, msgType, mediaUrl, app) {
  try {
    // 1. Upsert client
    const { rows: existing } = await pool.query(
      'SELECT * FROM clients WHERE tenant_id=$1 AND phone=$2', [TENANT_ID, phone]
    )
    let client
    if (!existing.length) {
      const { rows } = await pool.query(
        'INSERT INTO clients (tenant_id, phone) VALUES ($1,$2) RETURNING *',
        [TENANT_ID, phone]
      )
      client = rows[0]
    } else {
      client = existing[0]
    }

    // 2. Get/create conversation
    const { rows: convRows } = await pool.query(
      "SELECT * FROM conversations WHERE tenant_id=$1 AND client_id=$2 AND status='open' ORDER BY created_at DESC LIMIT 1",
      [TENANT_ID, client.id]
    )
    let convId
    if (!convRows.length) {
      const { rows } = await pool.query(
        'INSERT INTO conversations (tenant_id, client_id, phone, status, last_message, last_message_at) VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING *',
        [TENANT_ID, client.id, phone, 'open', content]
      )
      convId = rows[0].id
    } else {
      convId = convRows[0].id
      await pool.query(
        'UPDATE conversations SET last_message=$1, last_message_at=NOW(), updated_at=NOW() WHERE id=$2',
        [content, convId]
      )
    }

    // 3. Save inbound message
    await pool.query(
      'INSERT INTO messages (conversation_id, tenant_id, direction, message_type, content, media_url) VALUES ($1,$2,$3,$4,$5,$6)',
      [convId, TENANT_ID, 'in', msgType, content, mediaUrl]
    )
    // Increment unread count
    await pool.query('UPDATE conversations SET unread_count = unread_count + 1 WHERE id=$1', [convId])

    // 4. Emit real-time to admin panel
    const io = app.get('io')
    if (io) {
      io.to(`conv_${convId}`).emit('new_message', { conversation_id: convId, direction: 'in', content, message_type: msgType, created_at: new Date() })
      io.emit('conversation_update', { convId, last_message: content, last_message_at: new Date() })
    }

    // 5. Skip AI if this is a staff number
    const staffEnv = process.env.STAFF_NUMBERS || ''
    const staffNumbers = staffEnv ? staffEnv.split(',').map(s => s.replace(/\D/g,'').trim()).filter(Boolean) : []
    if (staffNumbers.length && staffNumbers.some(s => s && phone.includes(s))) return

    // 6. Check if Meta is configured for sending (DB first, fallback to env)
    const { rows: tenantRows } = await pool.query('SELECT * FROM tenants WHERE id=$1', [TENANT_ID])
    const tenant = tenantRows[0]
    const waToken = tenant?.meta_whatsapp_token || process.env.META_WHATSAPP_TOKEN || ''
    const phoneId = tenant?.meta_phone_number_id || process.env.META_PHONE_NUMBER_ID || ''
    if (!waToken || waToken === 'FILL_LATER') return
    // Ensure metaSvc uses current credentials
    metaSvc.configure(waToken, phoneId)

    // 7. Handle special commands
    const cmd = content.trim().toUpperCase()

    if (cmd === 'MY CART' || cmd === 'CART') {
      const cartReq = { params: { clientPhone: phone } }
      const fakeRes = { json: async (cart) => { await metaSvc.sendCartSummary(phone, cart) } }
      const cart = await getCartData(phone)
      await metaSvc.sendCartSummary(phone, cart)
      return
    }

    if (cmd === 'MY WISHLIST' || cmd === 'WISHLIST') {
      const { rows: wishItems } = await pool.query(
        `SELECT p.name, p.price FROM wishlists w JOIN products p ON p.id=w.product_id
         JOIN clients c ON c.id=w.client_id WHERE c.phone=$1 AND w.tenant_id=$2`,
        [phone.replace(/^\+?91/,''), TENANT_ID]
      )
      if (!wishItems.length) {
        await metaSvc.sendText(phone, '💝 Your wishlist is empty!\n\nBrowse products and type "WISH [product name]" to save items.')
      } else {
        const list = wishItems.map((w,i) => `${i+1}. ${w.name} — ₹${w.price}`).join('\n')
        await metaSvc.sendText(phone, `💝 *Your Wishlist:*\n\n${list}`)
      }
      return
    }

    if (cmd === 'MY ORDERS' || cmd === 'ORDERS') {
      const { rows: orders } = await pool.query(
        `SELECT o.order_number, o.status, o.total_amount, o.created_at
         FROM orders o JOIN clients c ON c.id=o.client_id
         WHERE c.phone=$1 AND o.tenant_id=$2 ORDER BY o.created_at DESC LIMIT 5`,
        [phone.replace(/^\+?91/,''), TENANT_ID]
      )
      if (!orders.length) {
        await metaSvc.sendText(phone, '📦 You have no orders yet!\n\nBrowse our catalog and place your first order.')
      } else {
        const list = orders.map(o =>
          `📦 #${o.order_number || o.id} — ₹${o.total_amount} — *${o.status.toUpperCase()}*`
        ).join('\n')
        await metaSvc.sendText(phone, `📦 *Your Recent Orders:*\n\n${list}`)
      }
      return
    }

    if (cmd === 'HELP' || cmd === 'HI' || cmd === 'HELLO' || cmd === 'START') {
      await metaSvc.sendButtons(phone,
        `👋 Welcome to *NavyStore*!\n\nI'm your AI shopping assistant. How can I help you today?`,
        [
          { id: 'browse_catalog', title: '🛍️ Browse Catalog' },
          { id: 'my_cart',        title: '🛒 My Cart' },
          { id: 'my_orders',      title: '📦 My Orders' },
        ]
      )
      return
    }

    if (cmd === 'CHECKOUT') {
      const cart = await getCartData(phone)
      if (!cart.items?.length) {
        await metaSvc.sendText(phone, '🛒 Your cart is empty! Browse our products first.')
        return
      }
      const subtotal = cart.subtotal || cart.total || 0
      const itemList = (cart.items || []).map(i => `• ${i.name} × ${i.qty}  ₹${(i.price * i.qty).toFixed(0)}`).join('\n')
      await metaSvc.sendText(phone,
        `🛒 *Your Cart:*\n\n${itemList}\n\n` +
        `─────────────────\n` +
        `Subtotal: ₹${subtotal.toFixed(0)}\n` +
        `COD Fee:  ₹50\n` +
        `*Total:   ₹${(subtotal + 50).toFixed(0)}*\n\n` +
        `📍 Please share your *delivery address* to confirm:\n\n` +
        `Format: House/Flat, Street, City, State, PIN\n` +
        `Example: 42B Navy Colony, MG Road, Mumbai, Maharashtra, 400001`
      )
      // Mark client as awaiting address
      await pool.query(
        "UPDATE clients SET meta = COALESCE(meta,'{}')::jsonb || '{\"awaiting_address\":true}'::jsonb WHERE tenant_id=$1 AND phone=$2",
        [TENANT_ID, phone]
      ).catch(() => {})
      return
    }

    if (cmd === 'CANCEL ORDER' || cmd === 'CANCEL') {
      await pool.query(
        "UPDATE clients SET meta = COALESCE(meta,'{}')::jsonb - 'awaiting_address' WHERE tenant_id=$1 AND phone=$2",
        [TENANT_ID, phone]
      ).catch(() => {})
      await metaSvc.sendText(phone, '✅ Checkout cancelled. Your cart is saved!\n\nReply *CART* to view or *CHECKOUT* to try again.')
      return
    }

    // Payment method button replies
    if (cmd.startsWith('PAY_PREPAID_') || cmd.startsWith('PAY_COD_')) {
      await handlePaymentChoice(phone, cmd, client, app)
      return
    }

    // Address capture state
    const addressResult = await handleAddressCapture(phone, content, client, app)
    if (addressResult) return

    // 8. Handle audio — transcribe and treat as search
    if (msgType === 'audio' && mediaUrl) {
      const transcript = await transcribeAudio(mediaUrl)
      if (transcript) {
        await handleAI(phone, transcript, client, convId, tenant, app)
        return
      }
    }

    // 9. Handle image — vision search
    if (msgType === 'image' && mediaUrl) {
      await handleImageSearch(phone, mediaUrl)
      return
    }

    // 10. Regular text → AI
    if (content && msgType === 'text') {
      await handleAI(phone, content, client, convId, tenant, app)
    }
  } catch (err) {
    console.error('[processMessage]', err.message)
  }
}

// ── AI Response Handler ────────────────────────────────────────────────────────
async function handleAI(phone, userMessage, client, convId, tenant, app) {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'FILL_LATER') {
      await metaSvc.sendText(phone, "Thank you for your message! Our team will get back to you shortly. 🙏")
      return
    }

    // Get product catalog
    const { rows: products } = await pool.query(
      'SELECT id, name, sku, category, price, stock_qty FROM products WHERE tenant_id=$1 AND is_active=true LIMIT 30',
      [TENANT_ID]
    )
    const productCatalog = products.map(p =>
      `[${p.id}] ${p.name} (${p.category}) ₹${p.price} stock:${p.stock_qty}`
    ).join('\n')

    // Get cart
    const cart = await getCartData(phone)
    const cartSummary = cart.items?.length
      ? `Cart: ${cart.items.map(i => `${i.name}x${i.qty}`).join(', ')} = ₹${(cart.total||0).toFixed(0)}`
      : 'Cart: empty'

    // Get conversation history
    const { rows: history } = await pool.query(
      'SELECT direction, content FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 10',
      [convId]
    )
    const chatHistory = history.reverse().map(m => ({
      role: m.direction === 'in' ? 'user' : 'assistant',
      content: m.content
    }))

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are NavyStore's AI sales assistant for maritime/naval products. Be friendly, helpful, concise.

CATALOG:
${productCatalog}

CUSTOMER STATE:
${cartSummary}
Name: ${client.name || 'Customer'}

Respond with valid JSON:
{
  "reply": "text message to send customer (max 300 chars, use *bold* for emphasis)",
  "action": "none|show_products|add_to_cart|send_payment|show_bundles",
  "product_ids": [array of product IDs to show, max 3],
  "cart_add": {"product_id": X, "qty": Y} or null
}

Rules:
- If customer asks for a product, show it with show_products action
- If customer says "buy X" or "add X to cart", use add_to_cart
- Keep replies SHORT and conversational
- Always end with a helpful next step`
        },
        ...chatHistory,
        { role: 'user', content: userMessage }
      ],
      max_tokens: 400,
      temperature: 0.7,
    })

    let parsed
    try {
      parsed = JSON.parse(completion.choices[0].message.content)
    } catch {
      parsed = { reply: completion.choices[0].message.content, action: 'none' }
    }

    const reply = parsed.reply || "I'll connect you with our team shortly!"

    // Execute action
    if (parsed.action === 'show_products' && parsed.product_ids?.length) {
      const { rows: prods } = await pool.query(
        'SELECT * FROM products WHERE id = ANY($1)', [parsed.product_ids]
      )
      await metaSvc.sendProductCards(phone, prods)
    } else if (parsed.action === 'add_to_cart' && parsed.cart_add) {
      const { rows: prods } = await pool.query(
        'SELECT * FROM products WHERE id=$1', [parsed.cart_add.product_id]
      )
      if (prods.length) {
        await addToCart(phone, client, parsed.cart_add.product_id, parsed.cart_add.qty || 1)
      }
    }

    await metaSvc.sendText(phone, reply)

    // Save AI reply
    await pool.query(
      'INSERT INTO messages (conversation_id, tenant_id, direction, message_type, content) VALUES ($1,$2,$3,$4,$5)',
      [convId, TENANT_ID, 'out', 'text', reply]
    )

    // Emit
    const io = app?.get('io')
    if (io) {
      io.to(`conv_${convId}`).emit('new_message', { conversation_id: convId, direction: 'out', content: reply, created_at: new Date() })
    }
  } catch (err) {
    console.error('[handleAI]', err.message)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getCartData(phone) {
  try {
    const clean = phone.replace(/^\+?91/, '').replace(/\D/g, '')
    const { rows: clients } = await pool.query(
      'SELECT * FROM clients WHERE tenant_id=$1 AND (phone=$2 OR phone=$3)',
      [TENANT_ID, clean, '+91' + clean]
    )
    if (!clients.length) return { items: [], total: 0 }
    const { rows: carts } = await pool.query(
      "SELECT * FROM carts WHERE tenant_id=$1 AND client_id=$2 AND status='active'",
      [TENANT_ID, clients[0].id]
    )
    const cart = carts[0] || { items: [] }
    const items = cart.items || []
    const subtotal = items.reduce((s, i) => s + (i.price * i.qty), 0)
    return { ...cart, subtotal, total: subtotal }
  } catch { return { items: [], total: 0 } }
}

async function addToCart(phone, client, productId, qty) {
  try {
    const { rows: prods } = await pool.query('SELECT * FROM products WHERE id=$1', [productId])
    if (!prods.length) return
    const p = prods[0]
    const { rows: carts } = await pool.query(
      "SELECT * FROM carts WHERE tenant_id=$1 AND client_id=$2 AND status='active'",
      [TENANT_ID, client.id]
    )
    let cartId, items
    if (!carts.length) {
      const { rows } = await pool.query(
        'INSERT INTO carts (tenant_id, client_id) VALUES ($1,$2) RETURNING *',
        [TENANT_ID, client.id]
      )
      cartId = rows[0].id; items = []
    } else {
      cartId = carts[0].id; items = carts[0].items || []
    }
    const idx = items.findIndex(i => i.product_id === productId)
    if (idx >= 0) items[idx].qty += qty
    else items.push({ product_id: productId, name: p.name, price: parseFloat(p.price), qty, image: p.image_urls?.[0] || '' })
    await pool.query('UPDATE carts SET items=$1, updated_at=NOW() WHERE id=$2', [JSON.stringify(items), cartId])
  } catch (err) { console.error('[addToCart]', err.message) }
}

async function resolveMediaUrl(mediaId) {
  try {
    const token = process.env.META_WHATSAPP_TOKEN
    if (!token || token === 'FILL_LATER') return ''
    const { data } = await require('axios').get(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    return data.url || ''
  } catch { return '' }
}

async function transcribeAudio(audioUrl) {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'FILL_LATER') return null
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const resp = await require('axios').get(audioUrl, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}` }
    })
    const file = new (require('node-fetch').File)([resp.data], 'audio.ogg', { type: 'audio/ogg' })
    const result = await openai.audio.transcriptions.create({ file, model: 'whisper-1' })
    return result.text
  } catch { return null }
}

// ── Address capture + order creation ─────────────────────────────────────────
async function handleAddressCapture(phone, content, client, app) {
  try {
    // Check if client is awaiting address
    const { rows: clientRows } = await pool.query(
      'SELECT meta FROM clients WHERE tenant_id=$1 AND id=$2',
      [TENANT_ID, client.id]
    )
    const meta = clientRows[0]?.meta || {}
    if (!meta.awaiting_address) return false

    // Basic address validation: must have a PIN code (6 digits)
    const pinMatch = content.match(/\b(\d{6})\b/)
    if (!pinMatch) {
      await metaSvc.sendText(phone,
        `❗ That doesn't look like a complete address.\n\nPlease include your 6-digit PIN code.\n\nExample: 42B Navy Colony, MG Road, Mumbai, Maharashtra, *400001*\n\nOr reply *CANCEL* to cancel checkout.`
      )
      return true  // consumed — don't pass to AI
    }

    const address  = content.trim()
    const pincode  = pinMatch[1]
    const cart     = await getCartData(phone)

    if (!cart.items?.length) {
      await metaSvc.sendText(phone, '🛒 Your cart is empty! Nothing to order.')
      await clearAwaitingAddress(phone)
      return true
    }

    const subtotal = cart.subtotal || cart.total || 0
    const codFee   = 50
    const total    = subtotal + codFee

    // Generate order number
    const ts = Date.now().toString().slice(-6)
    const orderNumber = `NS${new Date().getFullYear()}${ts}`

    // Create order
    const { rows: [order] } = await pool.query(
      `INSERT INTO orders
         (tenant_id, client_id, order_number, status, items, subtotal, total_amount, shipping_address, payment_method, notes)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, 'COD', $8)
       RETURNING *`,
      [
        TENANT_ID,
        client.id,
        orderNumber,
        JSON.stringify(cart.items),
        subtotal.toFixed(2),
        total.toFixed(2),
        address,
        `COD fee: ₹${codFee}. PIN: ${pincode}`,
      ]
    )

    // Clear cart
    await pool.query(
      "UPDATE carts SET items='[]'::jsonb, updated_at=NOW() WHERE tenant_id=$1 AND client_id=$2 AND status='active'",
      [TENANT_ID, client.id]
    )

    // Clear awaiting_address flag
    await clearAwaitingAddress(phone)

    // Confirmation message
    const itemList = (cart.items || []).map(i =>
      `• ${i.name} × ${i.qty}  ₹${(i.price * i.qty).toFixed(0)}`
    ).join('\n')

    // Check if Razorpay is enabled
    const { rows: tenantCfg } = await pool.query(
      'SELECT payment_enabled, razorpay_key_id FROM tenants WHERE id=$1', [TENANT_ID]
    )
    const paymentEnabled = tenantCfg[0]?.payment_enabled && tenantCfg[0]?.razorpay_key_id

    if (paymentEnabled) {
      // Offer COD vs Prepaid choice
      await metaSvc.sendButtons(phone,
        `✅ Address received!\n\n` +
        `Order #: *${orderNumber}*\n` +
        `${itemList}\n\n` +
        `─────────────────\n` +
        `Subtotal: ₹${subtotal.toFixed(0)}\n\n` +
        `Choose payment method:`,
        [
          { id: `PAY_PREPAID_${order.id}`, title: '💳 Pay Online (Save ₹50)' },
          { id: `PAY_COD_${order.id}`,     title: '💵 Cash on Delivery' },
        ]
      )
    } else {
      // COD only
      await metaSvc.sendText(phone,
        `✅ *Order Confirmed!*\n\n` +
        `Order #: *${orderNumber}*\n\n` +
        `${itemList}\n\n` +
        `─────────────────\n` +
        `Subtotal:  ₹${subtotal.toFixed(0)}\n` +
        `COD Fee:   ₹${codFee}\n` +
        `*Total:    ₹${total.toFixed(0)}*\n\n` +
        `📍 Delivering to:\n${address}\n\n` +
        `💳 Payment: Cash on Delivery\n\n` +
        `We'll notify you when your order ships! 🚚\nReply *ORDERS* to track your order.`
      )
    }

    // Emit to admin panel
    const io = app?.get('io')
    if (io) {
      io.emit('new_order', { order_number: orderNumber, total_amount: total, client_phone: phone })
    }

    console.log(`[checkout] Order ${orderNumber} created for ${phone}, total ₹${total}`)
    return true
  } catch (err) {
    console.error('[handleAddressCapture]', err.message)
    return false
  }
}

// ── Payment choice handler (COD / Prepaid buttons) ────────────────────────────
async function handlePaymentChoice(phone, cmd, client, app) {
  try {
    const isPrepaid = cmd.startsWith('PAY_PREPAID_')
    const orderId   = parseInt(cmd.replace('PAY_PREPAID_', '').replace('PAY_COD_', ''))
    if (!orderId) return

    const { rows: orderRows } = await pool.query(
      'SELECT * FROM orders WHERE id=$1 AND client_id=$2 AND tenant_id=$3',
      [orderId, client.id, TENANT_ID]
    )
    if (!orderRows.length) {
      await metaSvc.sendText(phone, '❗ Order not found. Reply *ORDERS* to check your orders.')
      return
    }
    const order = orderRows[0]

    if (isPrepaid) {
      // Generate Razorpay payment link
      try {
        const axios2 = require('axios')
        const { rows: cfg } = await pool.query(
          'SELECT razorpay_key_id, razorpay_key_secret FROM tenants WHERE id=$1', [TENANT_ID]
        )
        const { razorpay_key_id: keyId, razorpay_key_secret: keySecret } = cfg[0] || {}
        if (!keyId || !keySecret) throw new Error('Razorpay not configured')

        const amountPaise = Math.round(parseFloat(order.total_amount) * 100)
        const cleanPhone  = phone.replace(/^\+?91/, '').replace(/\D/g, '')
        const rpRes = await axios2.post('https://api.razorpay.com/v1/payment_links', {
          amount:      amountPaise,
          currency:    'INR',
          description: `NavyStore Order #${order.order_number}`,
          customer:    { contact: `+91${cleanPhone}` },
          notify:      { sms: false, email: false },
          reminder_enable: false,
          notes:       { order_id: String(order.id), order_number: order.order_number },
        }, {
          headers: {
            Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
        })

        const link   = rpRes.data.short_url
        const linkId = rpRes.data.id
        await pool.query(
          "UPDATE orders SET payment_link_id=$1, payment_link_url=$2, payment_method='prepaid', payment_status='link_created' WHERE id=$3",
          [linkId, link, order.id]
        )

        await metaSvc.sendText(phone,
          `💳 *Pay Online & Save ₹50*\n\n` +
          `Order #${order.order_number}\n` +
          `Amount: ₹${(amountPaise / 100).toFixed(0)}\n\n` +
          `Click to pay securely:\n${link}\n\n` +
          `✓ UPI / Cards / Net Banking / Wallets accepted\n` +
          `✓ Secure Razorpay payment\n\n` +
          `Once paid, your order will be confirmed automatically.`
        )
      } catch (err) {
        console.error('[payment/prepaid]', err.message)
        // Fallback to COD
        await pool.query(
          "UPDATE orders SET payment_method='COD', payment_status='pending' WHERE id=$1", [order.id]
        )
        await metaSvc.sendText(phone,
          `⚠️ Online payment is temporarily unavailable. Your order has been confirmed as *Cash on Delivery*.\n\n` +
          `Order #${order.order_number} — ₹${parseFloat(order.total_amount).toFixed(0)}\n\nWe'll notify you when it ships! 🚚`
        )
      }
    } else {
      // COD confirmed
      const codFee = 50
      const codTotal = parseFloat(order.total_amount)
      await pool.query(
        "UPDATE orders SET payment_method='COD', payment_status='pending', total_amount=$1, status='confirmed' WHERE id=$2",
        [(codTotal).toFixed(2), order.id]
      )
      await metaSvc.sendText(phone,
        `✅ *Order Confirmed — Cash on Delivery!*\n\n` +
        `Order #: *${order.order_number}*\n` +
        `Total:   ₹${codTotal.toFixed(0)} (incl. ₹${codFee} COD fee)\n` +
        `Payment: Collect on delivery\n\n` +
        `We'll notify you when your order ships! 🚚\n` +
        `Reply *ORDERS* to track.`
      )
    }
  } catch (err) {
    console.error('[handlePaymentChoice]', err.message)
  }
}

async function clearAwaitingAddress(phone) {
  await pool.query(
    "UPDATE clients SET meta = COALESCE(meta,'{}')::jsonb - 'awaiting_address' WHERE tenant_id=$1 AND phone=$2",
    [TENANT_ID, phone]
  ).catch(() => {})
}

async function handleImageSearch(phone, imageUrl) {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'FILL_LATER') {
      await metaSvc.sendText(phone, "Thanks for the image! Let me have our team help you find this product.")
      return
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const visionResp = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Maritime/naval product store. What product is shown? Give 3 search keywords only, comma separated.' },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]}],
      max_tokens: 30,
    })
    const keywords = visionResp.choices[0].message.content.trim()
    const terms = keywords.split(',').map(t => t.trim())
    const conditions = terms.map((_, i) => `(LOWER(name) LIKE $${i+2} OR LOWER(category) LIKE $${i+2})`).join(' OR ')
    const { rows } = await pool.query(
      `SELECT * FROM products WHERE tenant_id=$1 AND is_active=true AND (${conditions}) LIMIT 3`,
      [TENANT_ID, ...terms.map(t => `%${t.toLowerCase()}%`)]
    )
    if (rows.length) {
      await metaSvc.sendText(phone, `🔍 Found products matching your image:`)
      await metaSvc.sendProductCards(phone, rows)
    } else {
      await metaSvc.sendText(phone, `🔍 I couldn't find an exact match, but here are our popular items:`)
      const { rows: popular } = await pool.query('SELECT * FROM products WHERE tenant_id=$1 AND is_active=true LIMIT 3', [TENANT_ID])
      await metaSvc.sendProductCards(phone, popular)
    }
  } catch (err) { console.error('[handleImageSearch]', err.message) }
}

module.exports = router
