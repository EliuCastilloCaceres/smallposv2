// src/routes/branch_routes.js
const express      = require('express');
const router       = express.Router();
const branchCtrl   = require('../controllers/branchController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

// Todas las rutas requieren token válido
router.use(verifyToken);

// ── Lectura ───────────────────────────────────────────────────────────────────
router.get('/',    requirePermission('settings', 'read'),   branchCtrl.getAll);
router.get('/:id', requirePermission('settings', 'read'),   branchCtrl.getById);

// ── Creación y edición — solo admin central (validado en el service) ──────────
router.post('/',   requirePermission('settings', 'update'), branchCtrl.create);
router.put('/:id', requirePermission('settings', 'update'), branchCtrl.update);

// ── Activar / desactivar ──────────────────────────────────────────────────────
router.patch('/:id/status',  requirePermission('settings', 'update'), branchCtrl.toggleStatus);

// ── Datos del recibo de la sucursal ───────────────────────────────────────────
router.put('/:id/receipt',   requirePermission('settings', 'update'), branchCtrl.upsertReceipt);

module.exports = router;