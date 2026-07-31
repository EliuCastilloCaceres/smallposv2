// src/routes/customer_routes.js
const express      = require('express');
const router       = express.Router();
const customerCtrl = require('../controllers/customersController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

// Todas las rutas requieren token válido
router.use(verifyToken);

// ── Lectura ───────────────────────────────────────────────────────────────────
router.get('/',    requirePermission('customers', 'read'), customerCtrl.getAll);
router.get('/:id', requirePermission('customers', 'read'), customerCtrl.getById);

// ── Historial — misma protección que lectura ──────────────────────────────────
router.get('/:id/orders',   requirePermission('customers', 'read'), customerCtrl.getOrders);
router.get('/:id/credits',  requirePermission('customers', 'read'), customerCtrl.getCredits);
router.get('/:id/layaways', requirePermission('customers', 'read'), customerCtrl.getLayaways);

// ── Escritura ─────────────────────────────────────────────────────────────────
router.post('/',   requirePermission('customers', 'create'), customerCtrl.create);
router.put('/:id', requirePermission('customers', 'update'), customerCtrl.update);

// ── Estado ────────────────────────────────────────────────────────────────────
router.patch('/:id/status', requirePermission('customers', 'update'), customerCtrl.toggleStatus);

module.exports = router;
