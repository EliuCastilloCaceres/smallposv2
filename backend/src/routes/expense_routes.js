// src/routes/expense_routes.js
// Gastos (specs/12-modulo-de-gastos.md, requisito 28).
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/expenseController');
const { verifyToken, requirePermission, requireAnyPermission } = require('../middlewares/auth');
const { uploadExpenseReceipt } = require('../middlewares/uploadExpenseReceipt');

router.use(verifyToken);

// Datos de los formularios: también para el cajero, que registra gastos
// desde el POS sin expenses.read
router.get('/options',
  requireAnyPermission(['expenses', 'create'], ['expenses', 'read']),
  ctrl.options
);

router.get('/',            requirePermission('expenses', 'read'), ctrl.list);
router.get('/:id',         requirePermission('expenses', 'read'), ctrl.getById);
router.get('/:id/receipt', requirePermission('expenses', 'read'), ctrl.getReceipt);

// Sin expenses.read solo se aceptan gastos pagados desde caja (el service lo valida)
router.post('/',           requirePermission('expenses', 'create'), uploadExpenseReceipt, ctrl.create);
router.post('/:id/cancel', requirePermission('expenses', 'cancel'), ctrl.cancel);

module.exports = router;
