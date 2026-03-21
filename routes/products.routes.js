const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const authMiddleware = require('../middleware/auth.middleware');
const tenantMiddleware = require('../middleware/tenant.middleware');
const productsController = require('../controllers/products.controller');

const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx and .xls files are allowed'));
    }
  },
});

router.use(authMiddleware);
router.use(tenantMiddleware);

// GET /api/products
router.get('/', productsController.list);

// GET /api/products/:id
router.get('/:id', productsController.getById);

// POST /api/products
router.post('/', productsController.create);

// PUT /api/products/:id
router.put('/:id', productsController.update);

// DELETE /api/products/:id
router.delete('/:id', productsController.remove);

// POST /api/products/import — Excel bulk import
router.post('/import', upload.single('file'), productsController.importExcel);

module.exports = router;
