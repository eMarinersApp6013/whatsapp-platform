const { pool } = require('../config/db');
const { createQueue } = require('../config/redis');
const { sendTextMessage } = require('../services/meta.service');

// Bull queue for rate-limited broadcast — max 10 msgs/min per Meta rules
const broadcastQueue = createQueue('broadcast');

broadcastQueue.process(async (job) => {
  const { phoneNumberId, waToken, phone, message } = job.data;
  try {
    await sendTextMessage(phoneNumberId, waToken, phone, message);
    return { success: true, phone };
  } catch (err) {
    console.error(`[Broadcast] Failed to send to ${phone}:`, err.message);
    throw err;
  }
});

// POST /api/broadcast
exports.send = async (req, res) => {
  try {
    const { template_name, template_params, message, audience } = req.body;

    if (!message && !template_name) {
      return res.status(400).json({ error: 'message or template_name is required' });
    }
    if (!audience) {
      return res.status(400).json({ error: 'audience is required (all/vip/inactive_30days/specific_phones)' });
    }

    const tenant = await pool.query('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
    if (tenant.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    const t = tenant.rows[0];
    const waToken = t.wa_token || process.env.META_WHATSAPP_TOKEN;
    const phoneNumberId = t.phone_number_id || process.env.META_PHONE_NUMBER_ID;

    // Build audience list
    let phones = [];
    if (audience === 'all') {
      const result = await pool.query(
        'SELECT DISTINCT phone FROM clients WHERE tenant_id = $1',
        [req.tenantId]
      );
      phones = result.rows.map((r) => r.phone);
    } else if (audience === 'vip') {
      const result = await pool.query(
        'SELECT DISTINCT phone FROM clients WHERE tenant_id = $1 AND is_vip = true',
        [req.tenantId]
      );
      phones = result.rows.map((r) => r.phone);
    } else if (audience === 'inactive_30days') {
      const result = await pool.query(
        `SELECT DISTINCT c.phone FROM clients c
         WHERE c.tenant_id = $1
         AND c.id NOT IN (
           SELECT DISTINCT client_id FROM conversations
           WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days' AND client_id IS NOT NULL
         )`,
        [req.tenantId]
      );
      phones = result.rows.map((r) => r.phone);
    } else if (Array.isArray(audience)) {
      phones = audience;
    } else {
      return res.status(400).json({ error: 'Invalid audience type' });
    }

    if (phones.length === 0) {
      return res.json({ message: 'No recipients found', sent: 0 });
    }

    // Create broadcast record
    const broadcast = await pool.query(
      `INSERT INTO broadcasts (tenant_id, template, template_params, audience, audience_count, status)
       VALUES ($1, $2, $3, $4, $5, 'IN_PROGRESS') RETURNING *`,
      [req.tenantId, template_name || 'custom', JSON.stringify(template_params || {}),
       Array.isArray(audience) ? 'specific' : audience, phones.length]
    );

    const broadcastId = broadcast.rows[0].id;
    const msgText = message || `Template: ${template_name}`;

    // Add jobs to Bull queue with rate limiting (10/min = 1 every 6 seconds)
    for (let i = 0; i < phones.length; i++) {
      await broadcastQueue.add(
        { phoneNumberId, waToken, phone: phones[i], message: msgText, broadcastId },
        { delay: i * 6000 } // 6 second delay between each
      );
    }

    // Track completion
    let sentCount = 0;
    let failedCount = 0;

    broadcastQueue.on('completed', async (job) => {
      if (job.data.broadcastId === broadcastId) {
        sentCount++;
        if (sentCount + failedCount >= phones.length) {
          await pool.query(
            `UPDATE broadcasts SET sent_count = $1, failed_count = $2, status = 'COMPLETED' WHERE id = $3`,
            [sentCount, failedCount, broadcastId]
          );
        }
      }
    });

    broadcastQueue.on('failed', async (job) => {
      if (job.data.broadcastId === broadcastId) {
        failedCount++;
        if (sentCount + failedCount >= phones.length) {
          await pool.query(
            `UPDATE broadcasts SET sent_count = $1, failed_count = $2, status = 'COMPLETED' WHERE id = $3`,
            [sentCount, failedCount, broadcastId]
          );
        }
      }
    });

    res.json({
      broadcast_id: broadcastId,
      audience_count: phones.length,
      message: `Broadcast queued — sending to ${phones.length} recipients at 10/min rate`,
    });
  } catch (err) {
    console.error('Broadcast error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /api/broadcast/history
exports.history = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM broadcasts WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.tenantId]
    );
    res.json({ broadcasts: result.rows });
  } catch (err) {
    console.error('Broadcast history error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
