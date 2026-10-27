// src/routes/expense_category_routes.js
// Categorías de gasto (specs/12-modulo-de-gastos.md, requisito 3): todo pide
// expenses.categories. Los formularios de gasto no usan estas rutas: leen las
// categorías activas de GET /expenses/options.
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/expenseCategoryController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

router.use(verifyToken);
router.use(requirePermission('expenses', 'categories'));

router.get('/',             ctrl.getAll);
router.post('/',            ctrl.create);
router.put('/:id',          ctrl.update);
router.patch('/:id/status', ctrl.setStatus);

module.exports = router;
