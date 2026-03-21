// AI controller — delegates to openai.service.js
// The main AI processing is handled directly in meta.controller.js handleClientMessage().
// This controller is available for future direct AI endpoint usage.

const { chat } = require('../services/openai.service');
const { pool } = require('../config/db');

/**
 * Process a message through GPT-4o and return the AI response.
 * Can be called from other controllers or used as an API endpoint in later phases.
 */
async function processMessage(tenant, client, messageText) {
  const productsResult = await pool.query(
    'SELECT * FROM products WHERE tenant_id = $1 AND is_active = true ORDER BY name',
    [tenant.id]
  );

  const historyResult = await pool.query(
    'SELECT role, message FROM conversations WHERE tenant_id = $1 AND phone = $2 ORDER BY created_at DESC LIMIT 10',
    [tenant.id, client.phone]
  );

  const aiResponse = await chat(
    tenant,
    client,
    productsResult.rows,
    historyResult.rows.reverse(),
    messageText
  );

  return aiResponse;
}

module.exports = { processMessage };
