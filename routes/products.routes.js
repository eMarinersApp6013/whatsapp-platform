const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const tenantMiddleware = require('../middleware/tenant.middleware');
const { pool } = require('../config/db');

router.use(authMiddleware);
router.use(tenantMiddleware);

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE tenant_id = $1 AND is_active = true ORDER BY name',
      [req.tenantId]
    );
    res.json({ products: result.rows });
  } catch (err) {
    console.error('Products list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/products
router.post('/', async (req, res) => {
  try {
    const { sku, name, description, price, gst_rate, hsn_code, stock_qty, rank_tags, image_urls, weight_kg } = req.body;
    const result = await pool.query(
      `INSERT INTO products (tenant_id, sku, name, description, price, gst_rate, hsn_code, stock_qty, rank_tags, image_urls, weight_kg)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.tenantId, sku, name, description, price || 0, gst_rate || 0, hsn_code, stock_qty || 0, rank_tags || [], image_urls || [], weight_kg || 0]
    );
    res.status(201).json({ product: result.rows[0] });
  } catch (err) {
    console.error('Product create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/products/import — placeholder for Phase 3 Excel import
router.post('/import', async (req, res) => {
  res.status(501).json({ message: 'Excel import coming in Phase 3' });
});

module.exports = router;
