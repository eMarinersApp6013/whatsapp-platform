'use strict'
/**
 * AI Keep-in-Touch Automation — Feature 10
 * Bull queue with 4 job workers:
 *   1. cart_abandonment  — 2h after last cart activity, no checkout
 *   2. wishlist_nudge    — 30 days after wishlisting with no purchase
 *   3. reorder_reminder  — 60 days after last order
 *   4. special_day       — Navy Day (Dec 4), New Year, custom campaign dates
 */

const Queue = require('bull')
const pool  = require('../config/db')

const TENANT_ID = 1
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'

// ── Queue setup ───────────────────────────────────────────────────────────────
const automationQueue = new Queue('automation', REDIS_URL)

// ── Helpers ───────────────────────────────────────────────────────────────────
async function sendWhatsApp(phone, text) {
  try {
    const metaService = require('../services/meta.service')
    await metaService.sendText(phone, text)
    return true
  } catch (_) {
    return false
  }
}

async function markJobSent(jobId) {
  await pool.query(
    "UPDATE message_jobs SET status='sent', sent_at=NOW() WHERE id=$1",
    [jobId]
  ).catch(() => {})
}

async function markJobFailed(jobId, reason) {
  await pool.query(
    "UPDATE message_jobs SET status='failed' WHERE id=$1",
    [jobId]
  ).catch(() => {})
  console.error(`[automation] job ${jobId} failed:`, reason)
}

// ── Worker ────────────────────────────────────────────────────────────────────
automationQueue.process(async (job) => {
  const { type, jobId, clientPhone, clientName, payload } = job.data

  switch (type) {
    case 'cart_abandonment': {
      const name  = clientName || 'there'
      const items = payload.items || []
      const total = payload.total || 0
      const itemList = items.slice(0, 3).map(i => `• ${i.name} × ${i.qty}`).join('\n')
      const text = `👋 Hey ${name}!\n\nYou left something in your cart:\n${itemList}${items.length > 3 ? '\n  ...and more' : ''}\n\n💰 Total: ₹${total}\n\nReply *CHECKOUT* to complete your order, or *CART* to view your cart.\n\nOffer expires in 24 hours!`
      const sent = await sendWhatsApp(clientPhone, text)
      if (sent) await markJobSent(jobId)
      else await markJobFailed(jobId, 'WhatsApp send failed')
      break
    }

    case 'wishlist_nudge': {
      const name    = clientName || 'there'
      const product = payload.product_name || 'an item you wishlisted'
      const price   = payload.price ? `₹${payload.price}` : ''
      const text = `💝 Hi ${name}!\n\nYou wishlisted *${product}* ${price ? `(${price}) ` : ''}a while ago.\n\nStill interested? Reply *CATALOG* to browse or *WISHLIST* to see your full list.\n\nThese items sell out fast — grab yours before it's gone! 🚀`
      const sent = await sendWhatsApp(clientPhone, text)
      if (sent) await markJobSent(jobId)
      else await markJobFailed(jobId, 'WhatsApp send failed')
      break
    }

    case 'reorder_reminder': {
      const name    = clientName || 'there'
      const product = payload.last_product || 'your last purchase'
      const text = `🔄 Hi ${name}!\n\nIt's been a while since your last order. Time to restock?\n\nYour previous order included: *${product}*\n\nReply *CATALOG* to browse new arrivals or *ORDERS* to reorder from your history.\n\nExclusive 5% repeat-buyer discount on your next order! Use code: REPEAT5 🎁`
      const sent = await sendWhatsApp(clientPhone, text)
      if (sent) await markJobSent(jobId)
      else await markJobFailed(jobId, 'WhatsApp send failed')
      break
    }

    case 'special_day': {
      const name    = clientName || 'there'
      const occasion = payload.occasion || 'Special Day'
      const message  = payload.message  || `Wishing you a wonderful ${occasion}!`
      const text = `🎉 Hi ${name}!\n\n${message}\n\nAs a valued customer, enjoy *10% off* your next order today.\nUse code: *${payload.code || 'SPECIAL10'}*\n\nValid until midnight. Shop now: Reply *CATALOG* 🛍️`
      const sent = await sendWhatsApp(clientPhone, text)
      if (sent) await markJobSent(jobId)
      else await markJobFailed(jobId, 'WhatsApp send failed')
      break
    }

    default:
      console.warn('[automation] unknown job type:', type)
  }
})

automationQueue.on('failed', (job, err) => {
  console.error('[automation] queue error for job', job.id, err.message)
})

// ── Schedulers (run every hour via setInterval) ───────────────────────────────

/**
 * Cart abandonment: find carts updated > 2h ago with items, no order since
 */
async function scheduleCartAbandonment() {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.items, c.updated_at, c.client_id,
             cl.phone, cl.name,
             (SELECT COUNT(*) FROM orders o WHERE o.client_id=c.client_id AND o.created_at > c.updated_at) AS recent_orders
      FROM carts c
      JOIN clients cl ON cl.id = c.client_id
      WHERE c.tenant_id=$1
        AND c.status='active'
        AND c.items != '[]'::jsonb
        AND c.updated_at < NOW() - INTERVAL '2 hours'
        AND c.updated_at > NOW() - INTERVAL '26 hours'
    `, [TENANT_ID])

    for (const cart of rows) {
      if (parseInt(cart.recent_orders) > 0) continue  // already ordered

      // Check we haven't already sent this job recently
      const { rows: existing } = await pool.query(`
        SELECT id FROM message_jobs
        WHERE client_id=$1 AND type='cart_abandonment'
          AND created_at > NOW() - INTERVAL '24 hours'
          AND status != 'failed'
        LIMIT 1
      `, [cart.client_id])
      if (existing.length) continue

      const items = cart.items || []
      const total = items.reduce((s, i) => s + (i.price * i.qty), 0)

      const { rows: [job] } = await pool.query(`
        INSERT INTO message_jobs (tenant_id, client_id, client_phone, type, payload, scheduled_at)
        VALUES ($1, $2, $3, 'cart_abandonment', $4, NOW()) RETURNING id
      `, [TENANT_ID, cart.client_id, cart.phone, JSON.stringify({ items, total: total.toFixed(2) })])

      await automationQueue.add({
        type: 'cart_abandonment',
        jobId: job.id,
        clientPhone: cart.phone,
        clientName: cart.name,
        payload: { items, total: total.toFixed(2) },
      })
    }
  } catch (err) {
    console.error('[automation/cart_abandonment]', err.message)
  }
}

/**
 * Wishlist nudge: items wishlisted > 30 days ago with no purchase
 */
async function scheduleWishlistNudge() {
  try {
    const { rows } = await pool.query(`
      SELECT w.id, w.client_id, w.created_at,
             cl.phone, cl.name,
             p.name AS product_name, p.price
      FROM wishlists w
      JOIN clients cl ON cl.id = w.client_id
      JOIN products p ON p.id = w.product_id
      WHERE w.tenant_id=$1
        AND w.created_at < NOW() - INTERVAL '30 days'
        AND NOT EXISTS (
          SELECT 1 FROM orders o, jsonb_array_elements(o.items) item
          WHERE o.client_id = w.client_id
            AND (item->>'product_id')::int = w.product_id
        )
    `, [TENANT_ID])

    for (const wl of rows) {
      const { rows: existing } = await pool.query(`
        SELECT id FROM message_jobs
        WHERE client_id=$1 AND type='wishlist_nudge'
          AND created_at > NOW() - INTERVAL '30 days'
          AND status != 'failed'
        LIMIT 1
      `, [wl.client_id])
      if (existing.length) continue

      const { rows: [job] } = await pool.query(`
        INSERT INTO message_jobs (tenant_id, client_id, client_phone, type, payload, scheduled_at)
        VALUES ($1, $2, $3, 'wishlist_nudge', $4, NOW()) RETURNING id
      `, [TENANT_ID, wl.client_id, wl.phone, JSON.stringify({ product_name: wl.product_name, price: wl.price })])

      await automationQueue.add({
        type: 'wishlist_nudge',
        jobId: job.id,
        clientPhone: wl.phone,
        clientName: wl.name,
        payload: { product_name: wl.product_name, price: wl.price },
      })
    }
  } catch (err) {
    console.error('[automation/wishlist_nudge]', err.message)
  }
}

/**
 * Reorder reminder: last order > 60 days ago
 */
async function scheduleReorderReminder() {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (o.client_id)
             o.client_id, o.created_at, o.items,
             cl.phone, cl.name
      FROM orders o
      JOIN clients cl ON cl.id = o.client_id
      WHERE o.tenant_id=$1
        AND o.created_at < NOW() - INTERVAL '60 days'
        AND o.created_at > NOW() - INTERVAL '90 days'
      ORDER BY o.client_id, o.created_at DESC
    `, [TENANT_ID])

    for (const ord of rows) {
      const { rows: newer } = await pool.query(`
        SELECT id FROM orders WHERE client_id=$1 AND created_at > NOW() - INTERVAL '60 days' LIMIT 1
      `, [ord.client_id])
      if (newer.length) continue

      const { rows: existing } = await pool.query(`
        SELECT id FROM message_jobs
        WHERE client_id=$1 AND type='reorder_reminder'
          AND created_at > NOW() - INTERVAL '60 days'
          AND status != 'failed'
        LIMIT 1
      `, [ord.client_id])
      if (existing.length) continue

      const items = ord.items || []
      const lastProduct = items[0]?.name || 'your last purchase'

      const { rows: [job] } = await pool.query(`
        INSERT INTO message_jobs (tenant_id, client_id, client_phone, type, payload, scheduled_at)
        VALUES ($1, $2, $3, 'reorder_reminder', $4, NOW()) RETURNING id
      `, [TENANT_ID, ord.client_id, ord.phone, JSON.stringify({ last_product: lastProduct })])

      await automationQueue.add({
        type: 'reorder_reminder',
        jobId: job.id,
        clientPhone: ord.phone,
        clientName: ord.name,
        payload: { last_product: lastProduct },
      })
    }
  } catch (err) {
    console.error('[automation/reorder_reminder]', err.message)
  }
}

/**
 * Special day messages — Navy Day (Dec 4), New Year (Jan 1), configurable campaigns
 */
const SPECIAL_DAYS = [
  { month: 12, day: 4,  occasion: 'Navy Day',   code: 'NAVYDAY10',  message: 'Happy Navy Day! 🇮🇳 We salute the brave sailors of the Indian Navy.' },
  { month: 1,  day: 1,  occasion: 'New Year',    code: 'NY2025',     message: 'Happy New Year! 🎊 Wishing you fair winds and following seas in the year ahead.' },
  { month: 12, day: 25, occasion: 'Christmas',   code: 'XMAS10',     message: 'Merry Christmas! 🎄 May your seas be calm and your shores be bright.' },
  { month: 8,  day: 15, occasion: 'Independence Day', code: 'INDIA78', message: 'Happy Independence Day! 🇮🇳 Jai Hind!' },
]

async function scheduleSpecialDayMessages() {
  try {
    const now   = new Date()
    const month = now.getMonth() + 1
    const day   = now.getDate()

    const todayEvent = SPECIAL_DAYS.find(e => e.month === month && e.day === day)
    if (!todayEvent) return

    // Check if we already sent today
    const { rows: alreadySent } = await pool.query(`
      SELECT id FROM message_jobs
      WHERE type='special_day' AND created_at > NOW() - INTERVAL '20 hours'
      LIMIT 1
    `)
    if (alreadySent.length) return

    // Get all active clients
    const { rows: clients } = await pool.query(`
      SELECT id, phone, name FROM clients WHERE tenant_id=$1
    `, [TENANT_ID])

    for (const client of clients) {
      const { rows: [job] } = await pool.query(`
        INSERT INTO message_jobs (tenant_id, client_id, client_phone, type, payload, scheduled_at)
        VALUES ($1, $2, $3, 'special_day', $4, NOW()) RETURNING id
      `, [TENANT_ID, client.id, client.phone, JSON.stringify({
        occasion: todayEvent.occasion,
        message:  todayEvent.message,
        code:     todayEvent.code,
      })])

      await automationQueue.add({
        type: 'special_day',
        jobId: job.id,
        clientPhone: client.phone,
        clientName: client.name,
        payload: { occasion: todayEvent.occasion, message: todayEvent.message, code: todayEvent.code },
      }, { delay: clients.indexOf(client) * 500 })  // stagger 500ms to avoid rate limits
    }

    console.log(`[automation/special_day] queued ${clients.length} messages for ${todayEvent.occasion}`)
  } catch (err) {
    console.error('[automation/special_day]', err.message)
  }
}

// ── Start scheduled checks ────────────────────────────────────────────────────
function startAutomation() {
  // Run immediately, then every hour
  const runAll = () => Promise.allSettled([
    scheduleCartAbandonment(),
    scheduleWishlistNudge(),
    scheduleReorderReminder(),
    scheduleSpecialDayMessages(),
  ])

  runAll()
  setInterval(runAll, 60 * 60 * 1000)  // every 1 hour
  console.log('[automation] keep-in-touch scheduler started')
}

module.exports = {
  startAutomation,
  automationQueue,
  // Exported so admin API can trigger individual scans on demand
  runCartAbandonment:  scheduleCartAbandonment,
  runWishlistNudge:    scheduleWishlistNudge,
  runReorderReminder:  scheduleReorderReminder,
  runSpecialDay:       scheduleSpecialDayMessages,
}
