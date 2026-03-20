const { pool } = require('../config/db');

async function getLastMessages(tenantId, phone, limit = 10) {
  const result = await pool.query(
    'SELECT * FROM conversations WHERE tenant_id = $1 AND phone = $2 ORDER BY created_at DESC LIMIT $3',
    [tenantId, phone, limit]
  );
  return result.rows.reverse();
}

async function save(clientId, tenantId, phone, role, message, messageType = 'text') {
  const result = await pool.query(
    'INSERT INTO conversations (client_id, tenant_id, phone, role, message, message_type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [clientId, tenantId, phone, role, message, messageType]
  );
  return result.rows[0];
}

module.exports = { getLastMessages, save };
