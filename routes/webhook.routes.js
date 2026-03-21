const express = require('express');
const router = express.Router();
const metaController = require('../controllers/meta.controller');
const paymentController = require('../controllers/payment.controller');
const shippingController = require('../controllers/shipping.controller');

// Meta WhatsApp webhook verification
router.get('/meta', metaController.verify);

// Receive WhatsApp messages
router.post('/meta', metaController.receive);

// Cashfree payment webhook
router.post('/cashfree', paymentController.cashfreeWebhook);

// Shiprocket shipping webhook
router.post('/shiprocket', shippingController.shiprocketWebhook);

module.exports = router;
