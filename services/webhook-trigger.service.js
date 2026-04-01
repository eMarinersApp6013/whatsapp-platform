'use strict';
/**
 * Outgoing webhook trigger service.
 * Call triggerEvent(eventName, payload) anywhere to fire all
 * matching active webhook endpoints for this tenant.
 */

const pool   = require('../config/db');
const axios  = require('axios');
const crypto = require('crypto');

/**
 * @param {string} eventName  e.g. 'message.received', 'conversation.resolved'
 * @param {object} data       arbitrary payload
 */
async function triggerEvent(eventName, data) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM webhook_endpoints
       WHERE tenant_id = 1 AND is_active = true AND $1 = ANY(events)`,
      [eventName]
    );

    if (!rows.length) return;

    const payload = {
      event: eventName,
      timestamp: new Date().toISOString(),
      data,
    };

    await Promise.allSettled(
      rows.map(endpoint => fireEndpoint(endpoint, payload))
    );
  } catch (_err) {
    // Never let webhook errors crash the main flow
  }
}

async function fireEndpoint(endpoint, payload) {
  const headers = { 'Content-Type': 'application/json', 'X-NavyStore-Event': payload.event };
  if (endpoint.secret) {
    const sig = crypto.createHmac('sha256', endpoint.secret)
      .update(JSON.stringify(payload)).digest('hex');
    headers['X-NavyStore-Signature'] = `sha256=${sig}`;
  }

  let status = 0;
  try {
    const r = await axios.post(endpoint.url, payload, { headers, timeout: 8000 });
    status = r.status;
  } catch (e) {
    status = e.response?.status || 0;
  }

  pool.query(
    'UPDATE webhook_endpoints SET last_triggered_at=NOW(), last_status=$2 WHERE id=$1',
    [endpoint.id, status]
  ).catch(() => {});
}

module.exports = { triggerEvent };
