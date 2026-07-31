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

// ─── Roles — lectura ──────────────────────────────────────────────────────────
router.get('/',    roleCtrl.getAllRoles);
router.get('/:id', roleCtrl.getRoleById);

// ─── Roles — escritura (solo admin central, validado en service) ──────────────
router.post('/',   requirePermission('users', 'create'), roleCtrl.createRole);
router.put('/:id', requirePermission('users', 'update'), roleCtrl.updateRole);

// ─── Status ───────────────────────────────────────────────────────────────────
router.patch('/:id/status', requirePermission('users', 'update'), roleCtrl.toggleRoleStatus);

// ─── Asignación de permisos ───────────────────────────────────────────────────
router.put('/:id/permissions', requirePermission('users', 'update'), roleCtrl.syncRolePermissions);

module.exports = { router, permissionsRouter };