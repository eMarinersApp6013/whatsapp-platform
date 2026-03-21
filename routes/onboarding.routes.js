const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const tenantMiddleware = require('../middleware/tenant.middleware');
const analyticsController = require('../controllers/analytics.controller');

router.use(authMiddleware);
router.use(tenantMiddleware);

router.get('/status', analyticsController.onboardingStatus);

module.exports = router;
