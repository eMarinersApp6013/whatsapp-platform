// ── Settings routes ───────────────────────────────────────────────────────────
// Handles platform settings and Meta/WhatsApp credentials for NavyStore bot.
'use strict'

const express = require('express')
const router  = express.Router()
const pool    = require('../config/db')

// ── Helper: mask a secret string, leaving only first 4 + last 4 chars ─────────
function mask(value) {
  if (!value || typeof value !== 'string') return ''
  if (value.length <= 8) return '****'
  return value.slice(0, 4) + '****' + value.slice(-4)
}

// ── Meta credential field names (all stored in the `tenants` table) ───────────
const META_FIELDS = [
  'meta_app_id',
  'meta_app_secret',
  'meta_verify_token',
  'meta_whatsapp_token',
  'meta_phone_number_id',
  'admin_password',
]

// ── Tenant resolution helper ──────────────────────────────────────────────────
// If you use multi-tenancy, pass ?tenant_id= or derive from JWT.
// For single-tenant NavyStore we default to id = 1.
function getTenantId(req) {
  return parseInt(req.query.tenant_id || req.body?.tenant_id || '1') || 1
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/settings/meta
// Returns current Meta credentials with secrets masked.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/meta', async (req, res) => {
  const tenantId = getTenantId(req)

  try {
    const { rows } = await pool.query(
      `SELECT ${META_FIELDS.join(', ')} FROM tenants WHERE id = $1 LIMIT 1`,
      [tenantId],
    )

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'Tenant not found' })
    }

    const raw = rows[0]

    // Return masked version — never expose raw secrets via GET
    const masked = {
      meta_app_id:          raw.meta_app_id          || '',
      meta_app_secret:      mask(raw.meta_app_secret),
      meta_verify_token:    mask(raw.meta_verify_token),
      meta_whatsapp_token:  mask(raw.meta_whatsapp_token),
      meta_phone_number_id: raw.meta_phone_number_id || '',
      admin_password:       raw.admin_password ? '••••••••' : '',
    }

    return res.json({ ok: true, data: masked })
  } catch (err) {
    console.error('[settings/meta GET]', err.message)
    return res.status(500).json({ ok: false, error: 'Database error' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/settings/meta
// Saves Meta credentials. Only updates fields that are provided and non-empty.
// Sends back the masked version of the saved row.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/meta', async (req, res) => {
  const tenantId = getTenantId(req)

  // Pick only recognised fields; ignore extra payload keys
  const updates = {}
  for (const field of META_FIELDS) {
    const val = req.body?.[field]
    // Allow explicit empty string to clear a field, but skip undefined/null
    if (val !== undefined && val !== null) {
      updates[field] = typeof val === 'string' ? val.trim() : String(val)
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ ok: false, error: 'No valid fields provided' })
  }

  try {
    // Ensure tenant row exists before updating
    const { rowCount } = await pool.query(
      'SELECT id FROM tenants WHERE id = $1',
      [tenantId],
    )
    if (!rowCount) {
      return res.status(404).json({ ok: false, error: 'Tenant not found' })
    }

    // Build dynamic SET clause, e.g.: "meta_app_id = $2, meta_app_secret = $3"
    const setClauses = []
    const values     = [tenantId]   // $1 = tenant id
    let   paramIndex = 2

    for (const [col, val] of Object.entries(updates)) {
      setClauses.push(`${col} = $${paramIndex}`)
      values.push(val)
      paramIndex++
    }

    const sql = `
      UPDATE tenants
         SET ${setClauses.join(', ')},
             updated_at = NOW()
       WHERE id = $1
    `

    await pool.query(sql, values)

    // Fetch back the full row and return masked version
    const { rows } = await pool.query(
      `SELECT ${META_FIELDS.join(', ')} FROM tenants WHERE id = $1 LIMIT 1`,
      [tenantId],
    )

    const saved = rows[0] || {}
    const masked = {
      meta_app_id:          saved.meta_app_id          || '',
      meta_app_secret:      mask(saved.meta_app_secret),
      meta_verify_token:    mask(saved.meta_verify_token),
      meta_whatsapp_token:  mask(saved.meta_whatsapp_token),
      meta_phone_number_id: saved.meta_phone_number_id || '',
      admin_password:       saved.admin_password ? '••••••••' : '',
    }

    return res.json({ ok: true, message: 'Meta credentials saved', data: masked })
  } catch (err) {
    console.error('[settings/meta POST]', err.message)
    return res.status(500).json({ ok: false, error: 'Database error' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/settings/test-message
// Sends a test WhatsApp message to verify credentials
// ─────────────────────────────────────────────────────────────────────────────
router.post('/test-message', async (req, res) => {
  const tenantId = getTenantId(req)
  const { phone } = req.body

  if (!phone) return res.status(400).json({ ok: false, error: 'phone is required' })

  try {
    const { rows } = await pool.query(
      'SELECT meta_whatsapp_token, meta_phone_number_id FROM tenants WHERE id = $1',
      [tenantId]
    )
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Tenant not found' })

    const { meta_whatsapp_token: token, meta_phone_number_id: phoneNumberId } = rows[0]
    if (!token || !phoneNumberId) {
      return res.status(400).json({ ok: false, error: 'Meta credentials not configured. Save your settings first.' })
    }

    const axios = require('axios')
    const to = phone.replace(/\D/g, '')
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: '✅ NavyStore WhatsApp bot is connected and working! This is a test message.' }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    )

    return res.json({ ok: true, message: 'Test message sent', wa_id: response.data?.messages?.[0]?.id })
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message || 'Failed to send'
    console.error('[settings/test-message]', errMsg)
    return res.status(500).json({ ok: false, error: errMsg })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/settings/shipping-rates
// ─────────────────────────────────────────────────────────────────────────────
router.get('/shipping-rates', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM shipping_rates WHERE tenant_id = 1 ORDER BY zone')
    return res.json({ ok: true, data: rows })
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message })
  }
})

router.put('/shipping-rates/:id', async (req, res) => {
  try {
    const { zone, states, rate_500g, rate_1kg, rate_2kg, per_kg_extra } = req.body
    const { rows } = await pool.query(
      `UPDATE shipping_rates SET zone=$1, states=$2, rate_500g=$3, rate_1kg=$4, rate_2kg=$5, per_kg_extra=$6
       WHERE id=$7 AND tenant_id=1 RETURNING *`,
      [zone, states, rate_500g, rate_1kg, rate_2kg, per_kg_extra, req.params.id]
    )
    return res.json({ ok: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router
