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
// FIX: antes usaba settings.update — ahora conectado a payment_methods.*.
router.post('/',   requirePermission('payment_methods', 'create'), pmCtrl.create);
router.put('/:id', requirePermission('payment_methods', 'update'), pmCtrl.update);
router.patch('/:id/status', requirePermission('payment_methods', 'update'), pmCtrl.toggleStatus);

module.exports = router;