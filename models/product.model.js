const { pool } = require('../config/db');

async function findAllActive(tenantId) {
  const result = await pool.query(
    'SELECT * FROM products WHERE tenant_id = $1 AND is_active = true ORDER BY name',
    [tenantId]
  );
  return result.rows;
}

async function findByIds(tenantId, ids) {
  if (!ids || ids.length === 0) return [];
  const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
  const result = await pool.query(
    `SELECT * FROM products WHERE tenant_id = $1 AND id IN (${placeholders}) AND is_active = true`,
    [tenantId, ...ids]
  );
  return result.rows;
}

async function findByRank(tenantId, rank) {
  const result = await pool.query(
    'SELECT * FROM products WHERE tenant_id = $1 AND is_active = true AND $2 = ANY(rank_tags) ORDER BY name',
    [tenantId, rank]
  );
  return result.rows;
}

async function updateStock(tenantId, productId, qtyChange) {
  const result = await pool.query(
    'UPDATE products SET stock_qty = stock_qty + $1 WHERE id = $2 AND tenant_id = $3 RETURNING *',
    [qtyChange, productId, tenantId]
  );
  return result.rows[0] || null;
}

module.exports = { findAllActive, findByIds, findByRank, updateStock };
