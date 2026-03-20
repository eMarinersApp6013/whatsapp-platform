const { pool } = require('../config/db');

async function findByPhone(tenantId, phone) {
  const result = await pool.query('SELECT * FROM clients WHERE tenant_id = $1 AND phone = $2', [tenantId, phone]);
  return result.rows[0] || null;
}

async function create(tenantId, phone, name) {
  const result = await pool.query(
    'INSERT INTO clients (tenant_id, phone, name) VALUES ($1, $2, $3) RETURNING *',
    [tenantId, phone, name]
  );
  return result.rows[0];
}

module.exports = { findByPhone, create };
