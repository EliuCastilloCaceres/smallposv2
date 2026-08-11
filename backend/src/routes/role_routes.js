// src/routes/role_routes.js
const express    = require('express');
const router     = express.Router();
const roleCtrl   = require('../controllers/roleController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

// Token requerido en todas las rutas
router.use(verifyToken);

// ─── Permisos — catálogo de solo lectura ──────────────────────────────────────
const permissionsRouter = express.Router();
permissionsRouter.use(verifyToken);
permissionsRouter.get('/', roleCtrl.getAllPermissions);

// ─── Roles — lectura (todos los autenticados pueden leer para poblar selects) ─
router.get('/',    roleCtrl.getAllRoles);
router.get('/:id', roleCtrl.getRoleById);

// ─── Roles — escritura (requiere permisos del módulo 'roles', no 'users') ────
router.post('/',   requirePermission('roles', 'create'), roleCtrl.createRole);
router.put('/:id', requirePermission('roles', 'update'), roleCtrl.updateRole);

// ─── Status ───────────────────────────────────────────────────────────────────
router.patch('/:id/status', requirePermission('roles', 'update'), roleCtrl.toggleRoleStatus);

// ─── Asignación de permisos ─────────────────────────────────────────────────
router.put('/:id/permissions', requirePermission('roles', 'update'), roleCtrl.syncRolePermissions);

module.exports = { router, permissionsRouter };