// src/routes/user_routes.js
const express    = require('express');
const router     = express.Router();
const userCtrl   = require('../controllers/userController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

// Todas las rutas requieren token válido
router.use(verifyToken);

// ── Lectura ───────────────────────────────────────────────────────────────────
router.get('/',    requirePermission('users', 'read'),   userCtrl.getAll);
router.get('/:id', requirePermission('users', 'read'),   userCtrl.getById);

// ── Creación ──────────────────────────────────────────────────────────────────
router.post('/',   requirePermission('users', 'create'), userCtrl.create);

// ── Edición ───────────────────────────────────────────────────────────────────
router.put('/:id', requirePermission('users', 'update'), userCtrl.update);

// ── Contraseña — el propio usuario puede cambiar la suya sin permiso especial ─
// La lógica de si requiere current_password está en el service.
router.patch('/:id/password', userCtrl.changePassword);

// ── Activar / desactivar ──────────────────────────────────────────────────────
router.patch('/:id/status',  requirePermission('users', 'update'), userCtrl.toggleStatus);

module.exports = router;
