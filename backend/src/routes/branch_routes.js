// src/routes/branch_routes.js
const express      = require('express');
const router       = express.Router();
const branchCtrl   = require('../controllers/branchController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

// Todas las rutas requieren token válido
router.use(verifyToken);

// ── Lectura ───────────────────────────────────────────────────────────────────
// "/me" y "/list" van ANTES de "/:id" — si no, Express interpretaría "me" o
// "list" como un id.
// Sin requirePermission: cualquier autenticado puede ver los datos (incluido
// el receipt) de SU PROPIA sucursal, para imprimir tickets en el POS — no es
// una acción de administración.
router.get('/me', branchCtrl.getMyBranch);

// FIX: mismo criterio que /me — solo expone branch_id + name de sucursales
// activas, sin permiso branches:read, para que cualquier módulo (ej. el
// filtro de sucursal en Créditos) pueda poblar un selector sin necesitar
// permiso de ADMINISTRAR sucursales.
router.get('/list', branchCtrl.getActiveList);

// FIX: antes usaba settings.read/settings.update — permisos huérfanos del
// catálogo (branches.*) que nunca se consultaban en ninguna ruta. Ahora
// conectados al módulo específico.
router.get('/',    requirePermission('branches', 'read'),   branchCtrl.getAll);
router.get('/:id', requirePermission('branches', 'read'),   branchCtrl.getById);

// ── Creación y edición — solo admin central (validado también en el service) ──
router.post('/',   requirePermission('branches', 'create'), branchCtrl.create);
router.put('/:id', requirePermission('branches', 'update'), branchCtrl.update);

// ── Activar / desactivar ──────────────────────────────────────────────────────
router.patch('/:id/status',  requirePermission('branches', 'update'), branchCtrl.toggleStatus);

// ── Datos del recibo de la sucursal ───────────────────────────────────────────
router.put('/:id/receipt',   requirePermission('branches', 'update'), branchCtrl.upsertReceipt);

module.exports = router;