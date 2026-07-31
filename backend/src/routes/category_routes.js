// src/routes/category_routes.js
const express      = require('express');
const router       = express.Router();
const categoryCtrl = require('../controllers/categoryController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

// Todas las rutas requieren token válido
router.use(verifyToken);

// ─── Visibilidad de categorías por sucursal (para configurar el POS) ─────────
 
// Lectura — cualquier autenticado (misma política que GET /categories)
router.get('/branch/:branchId',          categoryCtrl.getVisibilityForBranch);
router.get('/branch/:branchId/visible',  categoryCtrl.getVisibleForBranch);
 
// Escritura — el service ya valida internamente que sea admin central
// o el propio usuario de esa sucursal (assertCanManageBranch)
router.put('/branch/:branchId',
  requirePermission('settings', 'update'),
  categoryCtrl.setHiddenForBranch
);

// ── Lectura — todos los roles autenticados ────────────────────────────────────
router.get('/',    categoryCtrl.getAll);
router.get('/:id', categoryCtrl.getById);

// ── Escritura — requiere products.update (solo admin central, validado en service)
router.post('/',              requirePermission('products', 'update'), categoryCtrl.create);
router.put('/:id',            requirePermission('products', 'update'), categoryCtrl.update);
router.patch('/:id/status',   requirePermission('products', 'update'), categoryCtrl.toggleStatus);

module.exports = router;
