// src/routes/orders_routes.js
const express    = require('express');
const router     = express.Router();
const ordersCtrl = require('../controllers/ordersController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

// Todas las rutas de órdenes requieren token
router.use(verifyToken);

router.get('/',                           requirePermission('orders', 'read'),   ordersCtrl.getOrdersByDateRange);
router.get('/sold-products',              requirePermission('orders', 'read'),   ordersCtrl.getSoldProducts);
// Sin requirePermission a propósito: cualquiera con acceso a Ventas debe
// poder poblar el filtro de cajero, aunque no tenga permiso users:read.
// Solo requiere estar autenticado (router.use(verifyToken) arriba).
router.get('/cashiers',                                                           ordersCtrl.getCashiers);
router.get('/:orderId',                   requirePermission('orders', 'read'),   ordersCtrl.getOrderById);
router.post('/',                          requirePermission('pos',    'use'),     ordersCtrl.createOrder);
router.patch('/:orderId/cancel',          requirePermission('orders', 'cancel'), ordersCtrl.cancelOrder);

module.exports = router;