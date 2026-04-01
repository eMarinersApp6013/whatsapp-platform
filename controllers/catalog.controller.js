'use strict'
/**
 * Catalog Controller — 11 Features
 * Feature 1:  Smart Home Feed
 * Feature 2:  AI Fuzzy Search
 * Feature 3:  Voice Search (Whisper)
 * Feature 4:  Wishlist
 * Feature 5:  Persistent Cart
 * Feature 6:  Bundles
 * Feature 7:  Restock Alerts
 * Feature 8:  Photo / Image Search (Vision)
 * Feature 9:  Smart Sort (personalised)
 * Feature 10: Shipping Calculator
 * Feature 11: Product Customizer Options
 */

const pool   = require('../config/db')
const OpenAI = require('openai')
const axios  = require('axios')

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })
const TENANT_ID = 1  // single-tenant for now

// ── helpers ──────────────────────────────────────────────────────────────────
async function getClientByPhone(phone) {
  const clean = phone.replace(/^\+?91/, '').replace(/\D/g, '')
  const { rows } = await pool.query(
    'SELECT * FROM clients WHERE tenant_id=$1 AND (phone=$2 OR phone=$3)',
    [TENANT_ID, clean, '+91' + clean]
  )
  return rows[0] || null
}

async function getOrderHistory(clientId) {
  const { rows } = await pool.query(
    `SELECT items FROM orders WHERE client_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 10`,
    [clientId, TENANT_ID]
  )
  const productIds = new Set()
  rows.forEach(o => {
    (o.items || []).forEach(i => { if (i.product_id) productIds.add(i.product_id) })
  })
  return [...productIds]
}

// ── Feature 1: Smart Home Feed ───────────────────────────────────────────────
exports.getHome = async (req, res) => {
  try {
    const { clientPhone } = req.query
    const client = clientPhone ? await getClientByPhone(clientPhone) : null

    const [topSellers, newArrivals, bundles] = await Promise.all([
      // Real top-sellers: rank by number of times ordered this week
      pool.query(`
        SELECT p.*,
               COALESCE(sales.order_count, 0) AS order_count,
               CASE WHEN COALESCE(sales.order_count, 0) >= 5 THEN true ELSE false END AS is_hot
        FROM products p
        LEFT JOIN (
          SELECT (item->>'product_id')::int AS product_id,
                 COUNT(*) AS order_count
          FROM orders, jsonb_array_elements(items) AS item
          WHERE tenant_id=$1
            AND created_at > NOW() - INTERVAL '7 days'
          GROUP BY 1
        ) sales ON sales.product_id = p.id
        WHERE p.tenant_id=$1 AND p.is_active=true
        ORDER BY order_count DESC, p.created_at DESC
        LIMIT 6
      `, [TENANT_ID]),
      pool.query(
        'SELECT * FROM products WHERE tenant_id=$1 AND is_active=true ORDER BY created_at DESC LIMIT 6',
        [TENANT_ID]
      ),
      pool.query(
        'SELECT * FROM bundles WHERE tenant_id=$1 AND is_active=true LIMIT 4',
        [TENANT_ID]
      ),
    ])

    let recommended = newArrivals.rows
    if (client) {
      const history = await getOrderHistory(client.id)
      if (history.length) {
        const excludeList = history.map(id => parseInt(id)).filter(Boolean)
        const { rows: rec } = await pool.query(
          `SELECT * FROM products WHERE tenant_id=$1 AND is_active=true
           AND id != ALL($2::int[]) LIMIT 4`,
          [TENANT_ID, excludeList]
        )
        recommended = rec
      }
    }

    return res.json({
      top_sellers:  topSellers.rows,
      new_arrivals: newArrivals.rows,
      recommended,
      bundles:      bundles.rows,
    })
  } catch (err) {
    console.error('[catalog/home]', err.message)
    return res.status(500).json({ error: err.message })
  }
}

// ── Feature 2: AI Fuzzy Search ────────────────────────────────────────────────
exports.search = async (req, res) => {
  try {
    const { query = '', clientPhone, sort = 'relevance', page = 1, limit = 20 } = req.body
    if (!query.trim()) return res.json({ products: [], total: 0, corrected_query: '' })

    // GPT-4o corrects spelling + extracts keywords (supports Hindi/Hinglish)
    let correctedQuery = query
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'FILL_LATER') {
      try {
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: `You are a maritime/naval ecommerce search assistant. Do the following:
1. If the query is in Hindi or Hinglish (mix of Hindi and English), translate it to English product keywords.
2. Correct any spelling mistakes.
3. Extract the most relevant product search keywords.
Return ONLY the corrected/translated plain text in English, nothing else.

Examples:
- "safedi wala kapda" → "white clothing"
- "neela jacket" → "blue jacket"
- "pani wala boot" → "waterproof boots"
- "navy wala uniform" → "navy uniform"

Query: "${query}"`
          }],
          max_tokens: 60,
          temperature: 0,
        })
        correctedQuery = resp.choices[0].message.content.trim()
      } catch (_) {}
    }

    const terms = correctedQuery.toLowerCase().split(/\s+/).filter(Boolean)
    const conditions = terms.map((t, i) => `(
      LOWER(p.name) LIKE $${i + 2} OR
      LOWER(p.description) LIKE $${i + 2} OR
      LOWER(p.category) LIKE $${i + 2} OR
      LOWER(p.sku) LIKE $${i + 2} OR
      EXISTS (SELECT 1 FROM unnest(p.rank_tags) rt WHERE LOWER(rt) LIKE $${i + 2})
    )`).join(' AND ')

    const params = [TENANT_ID, ...terms.map(t => `%${t}%`)]
    const offset = (parseInt(page) - 1) * parseInt(limit)

    // ── Feature 9: Smart sort "Best for me" ───────────────────────────────────
    let orderClause = 'ORDER BY p.name'
    if (sort === 'best_for_me' && clientPhone) {
      const client = await getClientByPhone(clientPhone)
      if (client) {
        orderClause = `ORDER BY (
          COALESCE((
            SELECT COUNT(*) * 10 FROM orders o, jsonb_array_elements(o.items) item
            WHERE o.client_id = ${client.id}
              AND (item->>'product_id')::int = p.id
          ), 0) +
          COALESCE((
            SELECT COUNT(*) * 5 FROM wishlists w
            WHERE w.client_id = ${client.id} AND w.product_id = p.id
          ), 0) +
          COALESCE(p.view_count, 0) * 3
        ) DESC, p.name`
      }
    } else if (sort === 'price_asc') {
      orderClause = 'ORDER BY p.price ASC'
    } else if (sort === 'price_desc') {
      orderClause = 'ORDER BY p.price DESC'
    } else if (sort === 'newest') {
      orderClause = 'ORDER BY p.created_at DESC'
    } else if (sort === 'popular') {
      orderClause = 'ORDER BY COALESCE(p.view_count, 0) DESC, p.name'
    }

    const { rows: products } = await pool.query(
      `SELECT p.* FROM products p
       WHERE p.tenant_id=$1 AND p.is_active=true
       ${conditions ? 'AND ' + conditions : ''}
       ${orderClause}
       LIMIT ${parseInt(limit)} OFFSET ${offset}`,
      params
    )

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) as total FROM products p
       WHERE p.tenant_id=$1 AND p.is_active=true
       ${conditions ? 'AND ' + conditions : ''}`,
      params
    )

    return res.json({
      corrected_query: correctedQuery,
      original_query: query,
      products,
      total: parseInt(countRows[0].total),
      page: parseInt(page),
    })
  } catch (err) {
    console.error('[catalog/search]', err.message)
    return res.status(500).json({ error: err.message })
  }
}

// ── Feature 3: Voice Search ───────────────────────────────────────────────────
exports.voiceSearch = async (req, res) => {
  try {
    const { audioUrl } = req.body
    if (!audioUrl) return res.status(400).json({ error: 'audioUrl required' })
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'FILL_LATER') {
      return res.status(503).json({ error: 'OpenAI API key not configured' })
    }

    // Download audio
    const audioResp = await axios.get(audioUrl, { responseType: 'arraybuffer' })
    const audioBuffer = Buffer.from(audioResp.data)
    const { File } = await import('undici')
    const audioFile = new File([audioBuffer], 'audio.ogg', { type: 'audio/ogg' })

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      // language omitted → Whisper auto-detects (supports Hindi, Hinglish, English)
    })

    const transcript = transcription.text
    // Reuse search logic
    req.body = { query: transcript, clientPhone: req.body.clientPhone }
    return exports.search(req, res)
  } catch (err) {
    console.error('[catalog/voice-search]', err.message)
    return res.status(500).json({ error: err.message })
  }
}

// ── Feature 4: Wishlist ───────────────────────────────────────────────────────
exports.addWishlist = async (req, res) => {
  try {
    const { clientPhone, productId } = req.body
    const client = await getClientByPhone(clientPhone)
    if (!client) return res.status(404).json({ error: 'Client not found. Send a message on WhatsApp first.' })

    await pool.query(
      'INSERT INTO wishlists (tenant_id, client_id, product_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [TENANT_ID, client.id, productId]
    )
    return res.json({ success: true, message: 'Added to wishlist' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.removeWishlist = async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM wishlists WHERE id=$1 AND tenant_id=$2',
      [req.params.id, TENANT_ID]
    )
    return res.json({ success: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.getWishlist = async (req, res) => {
  try {
    const client = await getClientByPhone(req.params.clientPhone)
    if (!client) return res.json({ items: [] })

    const { rows } = await pool.query(
      `SELECT w.id, w.created_at, p.*
       FROM wishlists w JOIN products p ON p.id=w.product_id
       WHERE w.tenant_id=$1 AND w.client_id=$2`,
      [TENANT_ID, client.id]
    )
    return res.json({ items: rows })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// ── Feature 5: Persistent Cart ────────────────────────────────────────────────
async function getOrCreateCart(clientId) {
  let { rows } = await pool.query(
    'SELECT * FROM carts WHERE tenant_id=$1 AND client_id=$2 AND status=$3',
    [TENANT_ID, clientId, 'active']
  )
  if (!rows.length) {
    const res2 = await pool.query(
      'INSERT INTO carts (tenant_id, client_id) VALUES ($1,$2) RETURNING *',
      [TENANT_ID, clientId]
    )
    rows = res2.rows
  }
  return rows[0]
}

exports.addToCart = async (req, res) => {
  try {
    const { clientPhone, productId, qty = 1, variant = '', customSpec = null } = req.body
    const client = await getClientByPhone(clientPhone)
    if (!client) return res.status(404).json({ error: 'Client not found' })

    const { rows: prod } = await pool.query('SELECT * FROM products WHERE id=$1', [productId])
    if (!prod.length) return res.status(404).json({ error: 'Product not found' })
    const product = prod[0]

    const cart = await getOrCreateCart(client.id)
    const items = cart.items || []
    const existIdx = items.findIndex(i => i.product_id === productId && i.variant === variant)

    if (existIdx >= 0) {
      items[existIdx].qty += parseInt(qty)
    } else {
      items.push({
        product_id: productId,
        name: product.name,
        price: parseFloat(product.price),
        qty: parseInt(qty),
        variant,
        image: product.image_urls?.[0] || '',
        custom_spec: customSpec,
      })
    }

    const { rows: updated } = await pool.query(
      'UPDATE carts SET items=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [JSON.stringify(items), cart.id]
    )
    return res.json({ success: true, cart: updated[0] })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.updateCart = async (req, res) => {
  try {
    const { clientPhone, productId, qty } = req.body
    const client = await getClientByPhone(clientPhone)
    if (!client) return res.status(404).json({ error: 'Client not found' })

    const cart = await getOrCreateCart(client.id)
    let items = cart.items || []

    if (parseInt(qty) <= 0) {
      items = items.filter(i => i.product_id !== productId)
    } else {
      const idx = items.findIndex(i => i.product_id === productId)
      if (idx >= 0) items[idx].qty = parseInt(qty)
    }

    const { rows } = await pool.query(
      'UPDATE carts SET items=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [JSON.stringify(items), cart.id]
    )
    return res.json({ success: true, cart: rows[0] })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.removeFromCart = async (req, res) => {
  try {
    const { clientPhone, productId } = req.body
    req.body = { clientPhone, productId, qty: 0 }
    return exports.updateCart(req, res)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.getCart = async (req, res) => {
  try {
    const client = await getClientByPhone(req.params.clientPhone)
    if (!client) return res.json({ items: [], total: 0 })

    const cart = await getOrCreateCart(client.id)
    const items = cart.items || []
    const subtotal = items.reduce((sum, i) => sum + (i.price * i.qty), 0)
    const discount = subtotal * (parseFloat(cart.discount_percent) / 100)

    return res.json({ ...cart, subtotal, discount, total: subtotal - discount })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.clearCart = async (req, res) => {
  try {
    const client = await getClientByPhone(req.params.clientPhone)
    if (!client) return res.json({ success: true })

    await pool.query(
      "UPDATE carts SET items='[]', updated_at=NOW() WHERE tenant_id=$1 AND client_id=$2",
      [TENANT_ID, client.id]
    )
    return res.json({ success: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// ── Feature 6: Bundles ────────────────────────────────────────────────────────
exports.getBundles = async (req, res) => {
  try {
    const { rows: bundles } = await pool.query(
      'SELECT * FROM bundles WHERE tenant_id=$1 AND is_active=true ORDER BY created_at DESC',
      [TENANT_ID]
    )
    // Attach product details
    for (const b of bundles) {
      if (b.product_ids?.length) {
        const { rows: prods } = await pool.query(
          'SELECT id, name, price, image_urls FROM products WHERE id = ANY($1)',
          [b.product_ids]
        )
        b.products = prods
      } else {
        b.products = []
      }
    }
    return res.json({ bundles })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.suggestBundles = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.* FROM bundles b
       WHERE b.tenant_id=$1 AND b.is_active=true
         AND $2 = ANY(b.product_ids)`,
      [TENANT_ID, parseInt(req.params.productId)]
    )
    return res.json({ bundles: rows })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.createBundle = async (req, res) => {
  try {
    const { name, description, product_ids, bundle_price, savings } = req.body
    const { rows } = await pool.query(
      'INSERT INTO bundles (tenant_id, name, description, product_ids, bundle_price, savings) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [TENANT_ID, name, description || '', product_ids, bundle_price, savings || 0]
    )
    return res.status(201).json({ bundle: rows[0] })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.updateBundle = async (req, res) => {
  try {
    const { name, description, product_ids, bundle_price, savings, is_active } = req.body
    const { rows } = await pool.query(
      'UPDATE bundles SET name=$1, description=$2, product_ids=$3, bundle_price=$4, savings=$5, is_active=$6, updated_at=NOW() WHERE id=$7 AND tenant_id=$8 RETURNING *',
      [name, description, product_ids, bundle_price, savings, is_active, req.params.id, TENANT_ID]
    )
    return res.json({ bundle: rows[0] })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.deleteBundle = async (req, res) => {
  try {
    await pool.query('DELETE FROM bundles WHERE id=$1 AND tenant_id=$2', [req.params.id, TENANT_ID])
    return res.json({ success: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// ── Feature 7: Restock Alerts ─────────────────────────────────────────────────
exports.addRestockAlert = async (req, res) => {
  try {
    const { clientPhone, productId } = req.body
    const client = await getClientByPhone(clientPhone)
    if (!client) return res.status(404).json({ error: 'Client not found' })

    await pool.query(
      'INSERT INTO restock_alerts (tenant_id, client_id, product_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [TENANT_ID, client.id, productId]
    )
    return res.json({ success: true, message: 'Restock alert set. We will notify you when back in stock!' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.getRestockAlerts = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.name AS product_name, p.stock_qty, p.id AS product_id,
              COUNT(ra.id) AS waiting_count,
              MIN(ra.created_at) AS first_alert
       FROM restock_alerts ra
       JOIN products p ON p.id = ra.product_id
       WHERE ra.tenant_id=$1 AND ra.notified=false
       GROUP BY p.id, p.name, p.stock_qty
       ORDER BY waiting_count DESC`,
      [TENANT_ID]
    )
    return res.json({ alerts: rows })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.notifyRestock = async (req, res) => {
  try {
    const { rows: alerts } = await pool.query(
      `SELECT ra.*, c.phone, p.name AS product_name
       FROM restock_alerts ra
       JOIN clients c ON c.id = ra.client_id
       JOIN products p ON p.id = ra.product_id
       WHERE ra.product_id=$1 AND ra.tenant_id=$2 AND ra.notified=false`,
      [req.params.productId, TENANT_ID]
    )

    let notified = 0
    for (const alert of alerts) {
      try {
        // Send WhatsApp message if Meta configured
        if (process.env.META_WHATSAPP_TOKEN && process.env.META_WHATSAPP_TOKEN !== 'FILL_LATER') {
          const metaService = require('../services/meta.service')
          await metaService.sendText(alert.phone,
            `🎉 Great news! *${alert.product_name}* is back in stock!\n\nReply "BUY" to add it to your cart, or visit our catalog.`
          )
        }
        notified++
      } catch (_) {}
    }

    await pool.query(
      'UPDATE restock_alerts SET notified=true WHERE product_id=$1 AND tenant_id=$2',
      [req.params.productId, TENANT_ID]
    )

    return res.json({ success: true, notified, total: alerts.length })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// ── Feature 8: Image / Photo Search ──────────────────────────────────────────
exports.imageSearch = async (req, res) => {
  try {
    const { imageUrl } = req.body
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl required' })
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'FILL_LATER') {
      return res.status(503).json({ error: 'OpenAI not configured' })
    }

    // GPT-4o Vision describes the image in product terms
    const visionResp = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'This image shows a product from a maritime/naval store. Describe it in 3-5 keywords suitable for a product search. Return only the keywords, comma separated, nothing else.' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      }],
      max_tokens: 50,
    })

    const keywords = visionResp.choices[0].message.content.trim()
    req.body = { query: keywords }
    return exports.search(req, res)
  } catch (err) {
    console.error('[catalog/image-search]', err.message)
    return res.status(500).json({ error: err.message })
  }
}

// ── GST helper: returns rate based on HSN code range ─────────────────────────
function getGstRate(hsnCode) {
  if (!hsnCode) return 0.18  // default 18% if no HSN
  const hsn = parseInt(hsnCode.toString().substring(0, 4))
  // Essential goods (5%): food, agriculture, basic textiles
  if ((hsn >= 101 && hsn <= 210) || (hsn >= 5001 && hsn <= 5113)) return 0.05
  // Standard goods (12%): processed foods, electronics accessories, clothing <₹1000
  if ((hsn >= 1601 && hsn <= 2106) || (hsn >= 6101 && hsn <= 6217) || (hsn >= 8469 && hsn <= 8479)) return 0.12
  // Standard goods (18%): most manufactured goods, electronics, furniture
  return 0.18
}

// ── Feature 10: Shipping Calculator ──────────────────────────────────────────
exports.shippingCalc = async (req, res) => {
  try {
    const { pincode, weight_kg = 0.5, cart_total = 0, cart_items = [] } = req.body
    if (!pincode) return res.status(400).json({ error: 'pincode required' })

    // Determine state from pincode prefix
    const pin = parseInt(pincode.toString().substring(0, 3))
    let stateZone = null

    const stateMap = {
      North:  [[110,120],[121,135],[136,144],[145,160],[171,177],[190,194],[243,246],[247,249],[201,203]],
      South:  [[560,562],[563,586],[587,600],[620,643],[673,695],[500,533]],
      East:   [[700,743],[750,766],[800,855],[826,829],[781,788],[790,799]],
      West:   [[400,445],[446,495],[360,396],[452,495]],
      Remote: [[744,744],[682,682],[194,194],[737,737]]
    }

    for (const [zone, ranges] of Object.entries(stateMap)) {
      for (const [lo, hi] of ranges) {
        if (pin >= lo && pin <= hi) { stateZone = zone; break }
      }
      if (stateZone) break
    }
    if (!stateZone) stateZone = 'North' // default

    const { rows } = await pool.query(
      'SELECT * FROM shipping_rates WHERE tenant_id=$1 AND zone=$2',
      [TENANT_ID, stateZone]
    )
    const rate = rows[0]

    if (!rate) return res.json({ zone: stateZone, couriers: [], cheapest: null })

    const kg = parseFloat(weight_kg)
    let cost = rate.rate_500g
    if (kg > 0.5 && kg <= 1) cost = rate.rate_1kg
    else if (kg > 1 && kg <= 2) cost = rate.rate_2kg
    else if (kg > 2) cost = rate.rate_2kg + Math.ceil(kg - 2) * parseFloat(rate.per_kg_extra)

    const couriers = [
      { name: 'Delhivery',   days: '3-5', price: cost,        prepaid: true  },
      { name: 'DTDC',        days: '4-6', price: cost + 10,   prepaid: true  },
      { name: 'India Post',  days: '5-8', price: cost - 10,   prepaid: false },
    ]

    const cartAmt       = parseFloat(cart_total)
    const prepaidSavings = cartAmt >= 500 ? 30 : 0
    const codFee         = 50  // flat COD handling fee

    // ── GST calculation per item ──────────────────────────────────────────────
    let gstBreakdown = []
    let totalGst     = 0
    if (cart_items && cart_items.length > 0) {
      for (const item of cart_items) {
        const rate    = getGstRate(item.hsn_code)
        const base    = parseFloat(item.price || 0) * parseInt(item.qty || 1)
        const gstAmt  = parseFloat((base * rate).toFixed(2))
        totalGst     += gstAmt
        gstBreakdown.push({
          name:     item.name,
          base,
          gst_rate: `${(rate * 100).toFixed(0)}%`,
          gst_amt:  gstAmt,
          total:    parseFloat((base + gstAmt).toFixed(2)),
        })
      }
      totalGst = parseFloat(totalGst.toFixed(2))
    }

    const sortedByPrice = [...couriers].sort((a, b) => a.price - b.price)
    const sortedByDays  = [...couriers].sort((a, b) => parseInt(a.days) - parseInt(b.days))

    return res.json({
      zone:      stateZone,
      weight_kg: kg,
      couriers:  couriers.map(c => ({
        ...c,
        cod_total:     parseFloat((c.price + codFee).toFixed(2)),
        prepaid_total: parseFloat((c.price - (cartAmt >= 999 ? c.price : 0)).toFixed(2)),
      })),
      cheapest:        sortedByPrice[0],
      fastest:         sortedByDays[0],
      cod_fee:         codFee,
      prepaid_savings: prepaidSavings,
      free_shipping_at: 999,
      qualifies_free:  cartAmt >= 999,
      gst: {
        breakdown: gstBreakdown,
        total_gst: totalGst,
        cart_subtotal:   cartAmt,
        cart_with_gst:   parseFloat((cartAmt + totalGst).toFixed(2)),
      },
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// ── Feature 11: Product Customizer ───────────────────────────────────────────
exports.getCustomOptions = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, custom_options FROM products WHERE id=$1 AND tenant_id=$2',
      [req.params.id, TENANT_ID]
    )
    if (!rows.length) return res.status(404).json({ error: 'Product not found' })
    const p = rows[0]
    if (!p.custom_options) return res.json({ is_customizable: false })
    return res.json({ is_customizable: true, product_id: p.id, name: p.name, ...p.custom_options })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.addCustomToCart = async (req, res) => {
  try {
    const { clientPhone, productId, customSpec } = req.body
    req.body = { clientPhone, productId, qty: 1, variant: 'custom', customSpec }
    return exports.addToCart(req, res)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// ── Feature 9 support: Record product view ────────────────────────────────────
exports.recordView = async (req, res) => {
  try {
    const { productId, clientPhone } = req.body
    if (!productId) return res.status(400).json({ error: 'productId required' })

    const client = clientPhone ? await getClientByPhone(clientPhone) : null

    await pool.query(
      'INSERT INTO product_views (tenant_id, product_id, client_id) VALUES ($1, $2, $3)',
      [TENANT_ID, productId, client?.id || null]
    )
    // Update denormalised counter on product row
    await pool.query(
      'UPDATE products SET view_count = COALESCE(view_count, 0) + 1 WHERE id=$1 AND tenant_id=$2',
      [productId, TENANT_ID]
    )
    return res.json({ success: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
