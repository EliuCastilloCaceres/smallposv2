// src/routes/product_routes.js
const express      = require('express');
const router       = express.Router();
const productCtrl  = require('../controllers/productController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

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
router.post('/',   requirePermission('products', 'create'), productCtrl.create);
router.put('/:id', requirePermission('products', 'update'), productCtrl.update);

// ── Estado ────────────────────────────────────────────────────────────────────
router.patch('/:id/status', requirePermission('products', 'update'), productCtrl.toggleStatus);

// ── Carga masiva ──────────────────────────────────────────────────────────────
// Requiere products.create — misma protección que crear uno a uno
router.post('/bulk',
  requirePermission('products', 'create'),
  productCtrl.bulkCreate
);

module.exports = router;
