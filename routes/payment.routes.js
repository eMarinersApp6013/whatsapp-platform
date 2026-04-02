'use strict'
/**
 * Payment routes — Razorpay integration
 * Uses Razorpay Payment Links API (no npm package — axios + built-in crypto)
 *
 * Endpoints:
 *  POST /api/payment/link/:orderId     — create Razorpay payment link for an order
 *  POST /api/payment/webhook           — Razorpay webhook (HMAC verified)
 *  GET  /api/payment/status/:orderId   — check payment status of an order
 */

const express = require('express')
const router  = express.Router()
const pool    = require('../config/db')
const crypto  = require('crypto')
const axios   = require('axios')

const TENANT_ID = 1

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getRazorpayConfig() {
  const { rows } = await pool.query(
    'SELECT razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret, payment_enabled FROM tenants WHERE id=$1',
    [TENANT_ID]
  )
  return rows[0] || {}
}

function razorpayAuth(keyId, keySecret) {
  return Buffer.from(`${keyId}:${keySecret}`).toString('base64')
}

// ── POST /api/payment/link/:orderId — create payment link ─────────────────────
router.post('/link/:orderId', async (req, res) => {
  try {
    const cfg = await getRazorpayConfig()
    if (!cfg.payment_enabled || !cfg.razorpay_key_id || !cfg.razorpay_key_secret) {
      return res.status(503).json({ error: 'Payment not configured. Add Razorpay credentials in Settings.' })
    }

    const { rows: orderRows } = await pool.query(
      `SELECT o.*, c.phone, c.name AS customer_name
       FROM orders o LEFT JOIN clients c ON c.id=o.client_id
       WHERE o.id=$1 AND o.tenant_id=$2`,
      [req.params.orderId, TENANT_ID]
    )
    if (!orderRows.length) return res.status(404).json({ error: 'Order not found' })
    const order = orderRows[0]

    if (order.payment_link_url) {
      return res.json({ link: order.payment_link_url, already_exists: true })
    }

    const amountPaise = Math.round(parseFloat(order.total_amount) * 100)
    const phone = (order.phone || '').replace(/^\+?91/, '').replace(/\D/g, '')

    const payload = {
      amount:      amountPaise,
      currency:    'INR',
      accept_partial: false,
      description: `NavyStore Order #${order.order_number}`,
      customer: {
        name:    order.customer_name || 'Customer',
        contact: phone ? `+91${phone}` : undefined,
      },
      notify:      { sms: false, email: false },
      reminder_enable: false,
      notes:       { order_id: String(order.id), order_number: order.order_number },
      callback_url:    `${process.env.APP_URL || 'https://whatsapp.nodesurge.tech'}/api/payment/webhook`,
      callback_method: 'get',
    }

    const rpRes = await axios.post('https://api.razorpay.com/v1/payment_links', payload, {
      headers: {
        Authorization: `Basic ${razorpayAuth(cfg.razorpay_key_id, cfg.razorpay_key_secret)}`,
        'Content-Type': 'application/json',
      },
    })

    const link       = rpRes.data.short_url || rpRes.data.id
    const linkId     = rpRes.data.id

    await pool.query(
      'UPDATE orders SET payment_link_id=$1, payment_link_url=$2, payment_method=$3, payment_status=$4 WHERE id=$5',
      [linkId, link, 'prepaid', 'link_created', order.id]
    )

    return res.json({ link, link_id: linkId, order_number: order.order_number, amount: amountPaise / 100 })
  } catch (err) {
    console.error('[payment/link]', err.response?.data || err.message)
    return res.status(500).json({ error: err.response?.data?.error?.description || err.message })
  }
})

// ── POST /api/payment/webhook — Razorpay webhook (HMAC verified) ──────────────
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    res.sendStatus(200)  // Always respond quickly

    const cfg = await getRazorpayConfig()
    if (!cfg.razorpay_webhook_secret) return

    // Verify HMAC signature
    const signature = req.headers['x-razorpay-signature']
    const body      = req.body  // raw buffer
    const expected  = crypto.createHmac('sha256', cfg.razorpay_webhook_secret)
                             .update(body)
                             .digest('hex')

    if (signature !== expected) {
      console.warn('[payment/webhook] invalid signature')
      return
    }

    const event = JSON.parse(body.toString())
    const { event: eventName, payload: rp } = event

    if (eventName === 'payment_link.paid' || eventName === 'payment.captured') {
      const notes      = rp.payment_link?.entity?.notes || rp.payment?.entity?.notes || {}
      const orderId    = parseInt(notes.order_id)
      const rpPayId    = rp.payment?.entity?.id || rp.payment_link?.entity?.id

      if (!orderId) return

      await pool.query(
        `UPDATE orders SET
           payment_status='paid', payment_method='prepaid',
           razorpay_payment_id=$1, paid_at=NOW(), status='confirmed'
         WHERE id=$2 AND tenant_id=$3`,
        [rpPayId, orderId, TENANT_ID]
      )

      // Send WhatsApp confirmation
      try {
        const { rows: orderRows } = await pool.query(
          `SELECT o.order_number, o.total_amount, c.phone
           FROM orders o JOIN clients c ON c.id=o.client_id
           WHERE o.id=$1`, [orderId]
        )
        if (orderRows.length) {
          const metaSvc = require('../services/meta.service')
          await metaSvc.sendText(orderRows[0].phone,
            `✅ *Payment Received!*\n\n` +
            `Order #${orderRows[0].order_number} confirmed.\n` +
            `Amount: ₹${parseFloat(orderRows[0].total_amount).toFixed(0)}\n` +
            `Payment: Prepaid ✓\n\n` +
            `Your order is being processed! We'll notify you when it ships. 🚚\n` +
            `Reply *ORDERS* to track your order.`
          )
        }
      } catch (_) {}
    }
  } catch (err) {
    console.error('[payment/webhook]', err.message)
  }
})

// ── GET /api/payment/status/:orderId ─────────────────────────────────────────
router.get('/status/:orderId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, order_number, payment_status, payment_method, payment_link_url, paid_at, total_amount FROM orders WHERE id=$1 AND tenant_id=$2',
      [req.params.orderId, TENANT_ID]
    )
    if (!rows.length) return res.status(404).json({ error: 'Order not found' })
    return res.json(rows[0])
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

module.exports = router
