// src/routes/payment_method_routes.js
const express     = require('express');
const router      = express.Router();
const pmCtrl       = require('../controllers/paymentMethodController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

// Token requerido en todas las rutas
router.use(verifyToken);

// ─── Lectura — cualquier autenticado ───────────────────────────────────────────
router.get('/',    pmCtrl.getAll);
router.get('/:id', pmCtrl.getById);

// ─── Escritura — solo admin central (validado también en el service) ──────────
router.post('/',   requirePermission('settings', 'update'), pmCtrl.create);
router.put('/:id', requirePermission('settings', 'update'), pmCtrl.update);
router.patch('/:id/status', requirePermission('settings', 'update'), pmCtrl.toggleStatus);

module.exports = router;
