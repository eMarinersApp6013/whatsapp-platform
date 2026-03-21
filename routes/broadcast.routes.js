const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const tenantMiddleware = require('../middleware/tenant.middleware');
const broadcastController = require('../controllers/broadcast.controller');

router.use(authMiddleware);
router.use(tenantMiddleware);

router.post('/', broadcastController.send);
router.get('/history', broadcastController.history);

module.exports = router;
