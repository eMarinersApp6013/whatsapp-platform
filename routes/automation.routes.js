'use strict'
const express = require('express')
const router  = express.Router()
const pool    = require('../config/db')

const TENANT_ID = 1

// GET /api/automation/jobs — list jobs with filters
router.get('/jobs', async (req, res) => {
  try {
    const { status, type, page = 1, limit = 30 } = req.query
    const offset = (parseInt(page) - 1) * parseInt(limit)
    const conditions = ['j.tenant_id = $1']
    const params = [TENANT_ID]

    if (status) { params.push(status); conditions.push(`j.status = $${params.length}`) }
    if (type)   { params.push(type);   conditions.push(`j.type   = $${params.length}`) }

    const where = conditions.join(' AND ')
    const { rows } = await pool.query(
      `SELECT j.*, c.name AS client_name, c.phone AS client_phone_display
       FROM message_jobs j
       LEFT JOIN clients c ON c.id = j.client_id
       WHERE ${where}
       ORDER BY j.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset]
    )
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM message_jobs j WHERE ${where}`, params
    )
    return res.json({ jobs: rows, total: parseInt(countRows[0].count), page: parseInt(page) })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// GET /api/automation/stats — summary counts by type + status
router.get('/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT type, status, COUNT(*) AS count
      FROM message_jobs WHERE tenant_id=$1
      GROUP BY type, status ORDER BY type, status
    `, [TENANT_ID])

    const { rows: recent } = await pool.query(`
      SELECT COUNT(*) AS sent_today
      FROM message_jobs
      WHERE tenant_id=$1 AND status='sent' AND sent_at > NOW() - INTERVAL '24 hours'
    `, [TENANT_ID])

    const { rows: pending } = await pool.query(`
      SELECT COUNT(*) AS pending FROM message_jobs WHERE tenant_id=$1 AND status='pending'
    `, [TENANT_ID])

    return res.json({
      breakdown: rows,
      sent_today: parseInt(recent[0].sent_today),
      pending_count: parseInt(pending[0].pending),
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/automation/trigger — manually trigger a job type now
router.post('/trigger', async (req, res) => {
  try {
    const { type } = req.body
    const validTypes = ['cart_abandonment', 'wishlist_nudge', 'reorder_reminder', 'special_day']
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be one of: ' + validTypes.join(', ') })
    }

    let automation
    try {
      automation = require('../cron/automation')
    } catch (_) {
      return res.status(503).json({ error: 'Automation worker not available (Redis may be down)' })
    }

    // Call the scheduler function by dynamically triggering the queue scan
    // We re-export individual schedulers from the automation module for this purpose
    const fnMap = {
      cart_abandonment:  automation.runCartAbandonment,
      wishlist_nudge:    automation.runWishlistNudge,
      reorder_reminder:  automation.runReorderReminder,
      special_day:       automation.runSpecialDay,
    }

    if (fnMap[type]) {
      await fnMap[type]()
      return res.json({ success: true, message: `${type} scan triggered — check jobs list for new entries` })
    }
    return res.json({ success: true, message: 'Trigger queued' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// DELETE /api/automation/jobs/:id — cancel / delete a pending job
router.delete('/jobs/:id', async (req, res) => {
  try {
    await pool.query(
      "UPDATE message_jobs SET status='skipped' WHERE id=$1 AND tenant_id=$2 AND status='pending'",
      [req.params.id, TENANT_ID]
    )
    return res.json({ success: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

module.exports = router
