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
// o el propio usuario de esa sucursal (assertCanManageBranch). El rol
// 'admin' (central o de sucursal) comparte el mismo permiso RBAC; la
// diferencia de alcance por sucursal la resuelve el service, no la ruta.
// FIX: antes usaba settings.update — ahora conectado a categories.update.
router.put('/branch/:branchId',
  requirePermission('categories', 'update'),
  categoryCtrl.setHiddenForBranch
);

// ── Lectura — todos los roles autenticados ────────────────────────────────────
router.get('/',    categoryCtrl.getAll);
router.get('/:id', categoryCtrl.getById);

// ── Escritura — solo admin central (validado en el service) ──────────────────
// FIX: antes usaba products.update — permiso prestado de otro módulo. Ahora
// conectado al catálogo granular categories.* que ya existía en el seed
// pero nunca se consultaba en ninguna ruta.
router.post('/',              requirePermission('categories', 'create'), categoryCtrl.create);
router.put('/:id',            requirePermission('categories', 'update'), categoryCtrl.update);
router.patch('/:id/status',   requirePermission('categories', 'update'), categoryCtrl.toggleStatus);

module.exports = router;