const express = require('express');
const router = express.Router();
const metaController = require('../controllers/meta.controller');

// Meta WhatsApp webhook verification
router.get('/meta', metaController.verify);

// Receive WhatsApp messages
router.post('/meta', metaController.receive);

module.exports = router;
