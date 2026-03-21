const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const tenantMiddleware = require('../middleware/tenant.middleware');
const invoicesController = require('../controllers/invoices.controller');

router.use(authMiddleware);
router.use(tenantMiddleware);

router.get('/', invoicesController.list);
router.post('/generate/:orderId', invoicesController.generate);
router.get('/:id/download', invoicesController.download);
router.put('/:id', invoicesController.update);
router.post('/:id/approve', invoicesController.approve);
router.post('/bulk-download', invoicesController.bulkDownload);

module.exports = router;
