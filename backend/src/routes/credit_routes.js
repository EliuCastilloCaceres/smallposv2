// src/routes/credit_routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/creditController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

router.use(verifyToken);

router.get('/',                                    requirePermission('credit', 'read'),    ctrl.getByBranch);
router.get('/overdue',                             requirePermission('credit', 'read'),    ctrl.getOverdue);
router.get('/customer/:customerId',                requirePermission('credit', 'read'),    ctrl.getByCustomer);
router.get('/:creditSaleId',                       requirePermission('credit', 'read'),    ctrl.getById);
router.post('/:creditSaleId/payments',             requirePermission('credit', 'create'),  ctrl.addPayment);
router.patch('/overdue/mark',                      requirePermission('credit', 'approve'), ctrl.markOverdue);

// Aprobar / modificar límite de crédito de un cliente
router.patch('/customers/:customerId/limit',       requirePermission('credit', 'approve'), ctrl.updateCreditLimit);

module.exports = router;
