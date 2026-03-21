const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const tenantMiddleware = require('../middleware/tenant.middleware');
const courierController = require('../controllers/courier.controller');

router.use(authMiddleware);
router.use(tenantMiddleware);

// GET /api/courier/rates/:orderId — compare rates from all couriers
router.get('/rates/:orderId', courierController.getRates);

// POST /api/courier/ship/:orderId — create shipment with chosen courier
router.post('/ship/:orderId', courierController.createShipment);

// GET /api/courier/track/:orderId — track shipment
router.get('/track/:orderId', courierController.trackOrder);

module.exports = router;
