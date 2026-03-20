const { pool } = require('../config/db');

async function findById(id) {
  const result = await pool.query('SELECT * FROM tenants WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function findByPhoneNumberId(phoneNumberId) {
  const result = await pool.query('SELECT * FROM tenants WHERE phone_number_id = $1 AND is_active = true', [phoneNumberId]);
  return result.rows[0] || null;
}

module.exports = { findById, findByPhoneNumberId };
