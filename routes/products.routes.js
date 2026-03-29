'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');

// ─── GET /api/products/catalog ────────────────────────────────────────────────
router.get('/catalog', async (req, res) => {
  try {
    const { search = '', category = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [1]; // tenant_id
    const conditions = ['p.tenant_id = $1', 'p.is_active = true'];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      conditions.push(`p.category = $${params.length}`);
    }

    const where = conditions.join(' AND ');
    const countResult = await pool.query(`SELECT COUNT(*) FROM products p WHERE ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit));
    params.push(offset);
    const dataResult = await pool.query(
      `SELECT p.id, p.name, p.sku, p.category, p.description,
              p.price, p.compare_price, p.stock_qty, p.image_urls,
              p.weight_kg, p.rank_tags, p.custom_options, p.is_active, p.created_at
       FROM products p WHERE ${where}
       ORDER BY p.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      success: true,
      data: dataResult.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch products', error: err.message });
  }
});

// ─── GET /api/products/catalog/categories ────────────────────────────────────
router.get('/catalog/categories', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT category FROM products WHERE tenant_id = 1 AND category IS NOT NULL ORDER BY category`
    );
    return res.json({ success: true, data: result.rows.map(r => r.category) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/products/catalog/:id ───────────────────────────────────────────
router.get('/catalog/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND tenant_id = 1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/products ───────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, sku, category, description, price, compare_price, stock_qty, image_urls, weight_kg, rank_tags, custom_options } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO products (tenant_id, name, sku, category, description, price, compare_price, stock_qty, image_urls, weight_kg, rank_tags, custom_options)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [name, sku, category, description, price, compare_price || 0, stock_qty || 0,
       JSON.stringify(image_urls || []), weight_kg || 0, rank_tags || [], JSON.stringify(custom_options || null)]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUT /api/products/:id ────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { name, sku, category, description, price, compare_price, stock_qty, image_urls, weight_kg, rank_tags, custom_options, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE products SET name=$1, sku=$2, category=$3, description=$4, price=$5,
       compare_price=$6, stock_qty=$7, image_urls=$8, weight_kg=$9, rank_tags=$10,
       custom_options=$11, is_active=$12, updated_at=NOW()
       WHERE id=$13 AND tenant_id=1 RETURNING *`,
      [name, sku, category, description, price, compare_price || 0, stock_qty || 0,
       JSON.stringify(image_urls || []), weight_kg || 0, rank_tags || [],
       JSON.stringify(custom_options || null), is_active !== false, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── DELETE /api/products/:id ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE products SET is_active=false WHERE id=$1 AND tenant_id=1', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
