const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const tenantMiddleware = require('../middleware/tenant.middleware');
const { pool } = require('../config/db');

router.use(authMiddleware);
router.use(tenantMiddleware);

// GET /api/clients
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM clients WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ clients: result.rows });
  } catch (err) {
    console.error('Clients list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/conversations/:phone
router.get('/conversations/:phone', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM conversations WHERE tenant_id = $1 AND phone = $2 ORDER BY created_at ASC',
      [req.tenantId, req.params.phone]
    );
    res.json({ conversations: result.rows });
  } catch (err) {
    console.error('Conversations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
