const { pool } = require('../config/db');

async function findAllActive(tenantId) {
  const result = await pool.query('SELECT * FROM products WHERE tenant_id = $1 AND is_active = true ORDER BY name', [tenantId]);
  return result.rows;
}

module.exports = { findAllActive };
