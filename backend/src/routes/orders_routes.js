// src/routes/orders_routes.js
const express    = require('express');
const router     = express.Router();
const ordersCtrl = require('../controllers/ordersController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

// Todas las rutas de órdenes requieren token
router.use(verifyToken);

router.get('/',                           requirePermission('orders', 'read'),   ordersCtrl.getOrdersByDateRange);
router.get('/sold-products',              requirePermission('orders', 'read'),   ordersCtrl.getSoldProducts);
router.get('/:orderId',                   requirePermission('orders', 'read'),   ordersCtrl.getOrderById);
router.post('/',                          requirePermission('pos',    'use'),     ordersCtrl.createOrder);
router.patch('/:orderId/cancel',          requirePermission('orders', 'cancel'), ordersCtrl.cancelOrder);

module.exports = router;