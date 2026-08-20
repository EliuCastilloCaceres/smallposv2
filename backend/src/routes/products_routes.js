// src/routes/product_routes.js
const express      = require('express');
const router       = express.Router();
const productCtrl  = require('../controllers/productController');
const { verifyToken, requirePermission } = require('../middlewares/auth');
const { uploadProductImage, verifyRealFileType } = require('../middlewares/uploadImage');

// Todas las rutas requieren token válido
router.use(verifyToken);

// ── Plantilla CSV — sin permiso especial, cualquier autenticado puede descargarla
router.get('/bulk/template', productCtrl.getBulkTemplate);

// ── Lectura ───────────────────────────────────────────────────────────────────
router.get('/',    requirePermission('products', 'read'), productCtrl.getAll);
router.get('/:id', requirePermission('products', 'read'), productCtrl.getById);

// ── Variantes ─────────────────────────────────────────────────────────────────
router.get('/:id/variants',
  requirePermission('products', 'read'),
  productCtrl.getVariants
);
router.patch('/:id/variants/:variantId/deactivate',
  requirePermission('products', 'update'),
  productCtrl.deactivateVariant
);

// ── Escritura ─────────────────────────────────────────────────────────────────
// uploadProductImage.single('image'): el campo del form-data debe llamarse "image".
// verifyRealFileType(): confirma que el contenido real del archivo sea una imagen
// válida (magic bytes), no solo su extensión/mimetype declarados.
router.post('/',
  requirePermission('products', 'create'),
  uploadProductImage.single('image'),
  verifyRealFileType(),
  productCtrl.create
);
router.put('/:id',
  requirePermission('products', 'update'),
  uploadProductImage.single('image'),
  verifyRealFileType(),
  productCtrl.update
);

// ── Estado ────────────────────────────────────────────────────────────────────
router.patch('/:id/status', requirePermission('products', 'update'), productCtrl.toggleStatus);

// ── Carga masiva ──────────────────────────────────────────────────────────────
// Requiere products.create — misma protección que crear uno a uno
router.post('/bulk',
  requirePermission('products', 'create'),
  productCtrl.bulkCreate
);

module.exports = router;