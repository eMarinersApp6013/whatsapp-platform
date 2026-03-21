const { pool } = require('../config/db');
const XLSX = require('xlsx');
const fs = require('fs');

// GET /api/products
exports.list = async (req, res) => {
  try {
    const { search, rank, active } = req.query;
    let query = 'SELECT * FROM products WHERE tenant_id = $1';
    const params = [req.tenantId];
    let idx = 2;

    if (active !== undefined) {
      query += ` AND is_active = $${idx++}`;
      params.push(active === 'true');
    } else {
      query += ' AND is_active = true';
    }

    if (search) {
      query += ` AND (name ILIKE $${idx} OR sku ILIKE $${idx} OR description ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    if (rank) {
      query += ` AND $${idx++} = ANY(rank_tags)`;
      params.push(rank);
    }

    query += ' ORDER BY name';
    const result = await pool.query(query, params);
    res.json({ products: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('Products list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /api/products/:id
exports.getById = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error('Product get error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/products
exports.create = async (req, res) => {
  try {
    const { sku, name, description, price, gst_rate, hsn_code, stock_qty, rank_tags, image_urls, weight_kg } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Product name is required' });
    }
    const result = await pool.query(
      `INSERT INTO products (tenant_id, sku, name, description, price, gst_rate, hsn_code, stock_qty, rank_tags, image_urls, weight_kg)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.tenantId, sku || null, name, description || null, price || 0, gst_rate || 0, hsn_code || null, stock_qty || 0, rank_tags || [], image_urls || [], weight_kg || 0]
    );
    res.status(201).json({ product: result.rows[0] });
  } catch (err) {
    console.error('Product create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// PUT /api/products/:id
exports.update = async (req, res) => {
  try {
    const { sku, name, description, price, gst_rate, hsn_code, stock_qty, rank_tags, image_urls, weight_kg, is_active } = req.body;
    const result = await pool.query(
      `UPDATE products SET
        sku = COALESCE($1, sku),
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        price = COALESCE($4, price),
        gst_rate = COALESCE($5, gst_rate),
        hsn_code = COALESCE($6, hsn_code),
        stock_qty = COALESCE($7, stock_qty),
        rank_tags = COALESCE($8, rank_tags),
        image_urls = COALESCE($9, image_urls),
        weight_kg = COALESCE($10, weight_kg),
        is_active = COALESCE($11, is_active)
       WHERE id = $12 AND tenant_id = $13 RETURNING *`,
      [sku, name, description, price, gst_rate, hsn_code, stock_qty, rank_tags, image_urls, weight_kg, is_active, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error('Product update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// DELETE /api/products/:id (soft delete)
exports.remove = async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE products SET is_active = false WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deactivated', id: result.rows[0].id });
  } catch (err) {
    console.error('Product delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/products/import — Excel bulk import
exports.importExcel = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Send .xlsx file as "file" field.' });
  }

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = row.name || row.Name || row.PRODUCT_NAME || row.product_name;
      if (!name) {
        skipped++;
        errors.push(`Row ${i + 2}: Missing product name`);
        continue;
      }

      const sku = row.sku || row.SKU || row.Sku || null;
      const description = row.description || row.Description || null;
      const price = parseFloat(row.price || row.Price || row.MRP || 0) || 0;
      const gst_rate = parseFloat(row.gst_rate || row.GST || row.gst || 0) || 0;
      const hsn_code = row.hsn_code || row.HSN || row.hsn || null;
      const stock_qty = parseInt(row.stock_qty || row.stock || row.Stock || row.qty || 0, 10) || 0;
      const weight_kg = parseFloat(row.weight_kg || row.weight || row.Weight || 0) || 0;

      // Parse rank_tags: comma-separated string or already array
      let rank_tags = [];
      const rawTags = row.rank_tags || row.ranks || row.Ranks || '';
      if (typeof rawTags === 'string' && rawTags.trim()) {
        rank_tags = rawTags.split(',').map((t) => t.trim()).filter(Boolean);
      }

      // Parse image_urls: comma-separated or pipe-separated
      let image_urls = [];
      const rawImages = row.image_urls || row.images || row.Images || '';
      if (typeof rawImages === 'string' && rawImages.trim()) {
        image_urls = rawImages.split(/[,|]/).map((u) => u.trim()).filter(Boolean);
      }

      try {
        await pool.query(
          `INSERT INTO products (tenant_id, sku, name, description, price, gst_rate, hsn_code, stock_qty, rank_tags, image_urls, weight_kg)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [req.tenantId, sku, name, description, price, gst_rate, hsn_code, stock_qty, rank_tags, image_urls, weight_kg]
        );
        imported++;
      } catch (dbErr) {
        skipped++;
        errors.push(`Row ${i + 2} (${name}): ${dbErr.message}`);
      }
    }

    // Clean up uploaded temp file
    fs.unlink(req.file.path, () => {});

    res.json({
      message: `Import complete: ${imported} imported, ${skipped} skipped`,
      imported,
      skipped,
      total: rows.length,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    console.error('Excel import error:', err);
    // Clean up on error
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Failed to process Excel file' });
  }
};
