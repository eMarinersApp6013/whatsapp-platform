const { pool } = require('../config/db');

async function findById(tenantId, id) {
  const result = await pool.query('SELECT * FROM orders WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return result.rows[0] || null;
}

module.exports = { findById };
