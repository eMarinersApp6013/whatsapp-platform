'use strict';
const express  = require('express');
const router   = express.Router();
const pool     = require('../config/db');
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');

// ── File upload setup ─────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// ─── GET /api/clients (conversations list) ────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search = '', status = '', starred = '', priority = '', page = 1, limit = 40 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = ['c.tenant_id = $1'];
    const params = [1];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(cl.name ILIKE $${params.length} OR cl.phone ILIKE $${params.length} OR c.last_message ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`c.status = $${params.length}`);
    }
    if (starred === 'true') {
      conditions.push('c.is_starred = true');
    }
    if (priority) {
      params.push(priority);
      conditions.push(`c.priority = $${params.length}`);
    }

    const where = conditions.join(' AND ');
    const { rows } = await pool.query(
      `SELECT c.id, c.status, c.last_message, c.last_message_at, c.created_at,
              c.assigned_to, c.is_starred, c.priority, c.label_ids, c.unread_count,
              cl.name, cl.phone, cl.id as client_id
       FROM conversations c
       LEFT JOIN clients cl ON c.client_id = cl.id
       WHERE ${where}
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM conversations c LEFT JOIN clients cl ON c.client_id = cl.id WHERE ${where}`,
      params
    );
    return res.json({
      success: true,
      data: rows,
      pagination: {
        total: parseInt(countRes.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit))
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/clients/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.status, c.last_message, c.last_message_at, c.created_at,
              c.assigned_to, c.is_starred, c.priority, c.label_ids, c.unread_count,
              cl.name, cl.phone, cl.id as client_id
       FROM conversations c
       LEFT JOIN clients cl ON c.client_id = cl.id
       WHERE c.id = $1`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/clients/:id/messages ───────────────────────────────────────────
router.get('/:id/messages', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /api/clients/:id/status ───────────────────────────────────────────
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(
      'UPDATE conversations SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/clients/:id/reply ─────────────────────────────────────────────
router.post('/:id/reply', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, message: 'content required' });

    const { rows } = await pool.query(
      `SELECT c.id, cl.phone FROM conversations c JOIN clients cl ON c.client_id = cl.id WHERE c.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });

    const { rows: msgRows } = await pool.query(
      `INSERT INTO messages (conversation_id, direction, message_type, content, created_at)
       VALUES ($1, 'outbound', 'text', $2, NOW()) RETURNING *`,
      [req.params.id, content]
    );
    await pool.query(
      'UPDATE conversations SET last_message=$1, last_message_at=NOW(), unread_count=0 WHERE id=$2',
      [content, req.params.id]
    );

    try {
      const tenantRes = await pool.query('SELECT * FROM tenants WHERE id = 1');
      const t = tenantRes.rows[0];
      if (t?.meta_whatsapp_token && t.meta_phone_number_id) {
        const metaSvc = require('../services/meta.service');
        metaSvc.configure(t.meta_whatsapp_token, t.meta_phone_number_id);
        await metaSvc.sendText(rows[0].phone, content);
      }
    } catch (_e) { /* Meta not configured */ }

    return res.json({ success: true, data: msgRows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/clients/:id/attachment ────────────────────────────────────────
router.post('/:id/attachment', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const { rows: convRows } = await pool.query(
      `SELECT c.id, cl.phone FROM conversations c JOIN clients cl ON c.client_id = cl.id WHERE c.id = $1`,
      [req.params.id]
    );
    if (!convRows.length) return res.status(404).json({ success: false, message: 'Not found' });

    const fileUrl = `${process.env.BASE_URL || 'https://whatsapp.nodesurge.tech'}/uploads/${req.file.filename}`;
    const mimeType = req.file.mimetype;
    const msgType = mimeType.startsWith('image/') ? 'image' : 'document';

    const { rows: msgRows } = await pool.query(
      `INSERT INTO messages (conversation_id, direction, message_type, content, media_url, created_at)
       VALUES ($1, 'outbound', $2, $3, $4, NOW()) RETURNING *`,
      [req.params.id, msgType, req.file.originalname, fileUrl]
    );
    await pool.query(
      'UPDATE conversations SET last_message=$1, last_message_at=NOW() WHERE id=$2',
      [`[${msgType}] ${req.file.originalname}`, req.params.id]
    );

    // Send via Meta
    try {
      const tenantRes = await pool.query('SELECT * FROM tenants WHERE id = 1');
      const t = tenantRes.rows[0];
      if (t?.meta_whatsapp_token && t.meta_phone_number_id) {
        const metaSvc = require('../services/meta.service');
        metaSvc.configure(t.meta_whatsapp_token, t.meta_phone_number_id);
        if (msgType === 'image') {
          await metaSvc.sendImage(convRows[0].phone, fileUrl);
        } else {
          await metaSvc.sendDocument(convRows[0].phone, fileUrl, req.file.originalname);
        }
      }
    } catch (_e) { /* Meta not configured */ }

    return res.json({ success: true, data: { ...msgRows[0], file_url: fileUrl } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
