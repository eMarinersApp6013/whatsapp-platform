const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// ─── ProductVault DB Connection ───────────────────────────────────────────────
const pvPool = new Pool({
  host: '127.0.0.1',
  port: 5432,
  database: 'db_productvault',
  user: 'productvault_user',
  password: '0eZKe3w429lEgqqiKlv3xfEZdCR8JlKq'
});

pvPool.on('error', (err) => {
  console.error('[ProductVault] Unexpected pool error:', err);
});

// ─── Helper: build available platforms list ───────────────────────────────────
function getPlatforms(row) {
  const platforms = [];
  if (row.amazon_link)   platforms.push('Amazon');
  if (row.flipkart_link) platforms.push('Flipkart');
  if (row.meesho_link)   platforms.push('Meesho');
  if (row.etsy_link)     platforms.push('Etsy');
  return platforms;
}

// ─── GET /api/products/catalog ────────────────────────────────────────────────
// Returns products from ProductVault with search, category filter and pagination
router.get('/catalog', async (req, res) => {
  try {
    const {
      search   = '',
      category = '',
      status   = '',
      page     = 1,
      limit    = 50,
    } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.description ILIKE $${params.length})`
      );
    }

    if (category) {
      params.push(category);
      conditions.push(`p.category = $${params.length}`);
    }

    // status filter not applicable (no status column in ProductVault schema)

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countResult = await pvPool.query(
      `SELECT COUNT(*) FROM products p ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Data query
    params.push(parseInt(limit, 10));
    params.push(offset);

    const dataResult = await pvPool.query(
      `SELECT
         p.id,
         p.name,
         p.sku,
         p.category,
         p.description,
         p.mrp,
         p.selling_price,
         p.purchase_price,
         p.stock,
         p.amazon_link,
         p.flipkart_link,
         p.meesho_link,
         p.etsy_link,
         p.created_at
       FROM products p
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const products = dataResult.rows.map((row) => ({
      id:            row.id,
      name:          row.name,
      sku:           row.sku,
      category:      row.category,
      description:   row.description,
      mrp:           parseFloat(row.mrp || 0),
      selling_price: parseFloat(row.selling_price || 0),
      stock_qty:     parseInt(row.stock_qty || 0, 10),
      status:        row.status,
      platforms:     getPlatforms(row),
      created_at:    row.created_at,
    }));

    return res.json({
      success: true,
      data: products,
      pagination: {
        total,
        page:  parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    console.error('[GET /api/products/catalog] Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch products from ProductVault',
      error:   err.message,
    });
  }
});

// ─── GET /api/products/catalog/categories ────────────────────────────────────
// Returns distinct categories for filter dropdowns
router.get('/catalog/categories', async (req, res) => {
  try {
    const result = await pvPool.query(
      `SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category`
    );
    return res.json({
      success: true,
      data: result.rows.map((r) => r.category),
    });
  } catch (err) {
    console.error('[GET /api/products/catalog/categories] Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error:   err.message,
    });
  }
});

// ─── GET /api/products/catalog/:id ───────────────────────────────────────────
router.get('/catalog/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pvPool.query(
      `SELECT * FROM products WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const row = result.rows[0];
    return res.json({
      success: true,
      data: {
        ...row,
        mrp:           parseFloat(row.mrp || 0),
        selling_price: parseFloat(row.selling_price || 0),
        purchase_price: parseFloat(row.purchase_price || 0),
        stock_qty:     parseInt(row.stock_qty || 0, 10),
        platforms:     getPlatforms(row),
      },
    });
  } catch (err) {
    console.error('[GET /api/products/catalog/:id] Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
      error:   err.message,
    });
  }
});

module.exports = router;
