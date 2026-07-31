// src/routes/reports_routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/reportsController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

router.use(verifyToken);

// ── Ventas ──────────────────────────────────────────────────────────────────
// reports.basic   → corte de caja y resumen diario (cajero/supervisor)
// reports.advanced → margen, rotación, comparativo (supervisor/admin)

router.get('/sales/summary',         requirePermission('reports', 'basic'),    ctrl.getSalesSummary);
router.get('/sales/payment-methods', requirePermission('reports', 'basic'),    ctrl.getSalesByPaymentMethod);
router.get('/sales/cash-cut',        requirePermission('reports', 'basic'),    ctrl.getCashRegisterCut);
router.get('/sales/by-user',         requirePermission('reports', 'advanced'), ctrl.getSalesByUser);

// ── Productos ────────────────────────────────────────────────────────────────
router.get('/products/top',          requirePermission('reports', 'basic'),    ctrl.getTopProducts);
router.get('/products/margin',       requirePermission('reports', 'advanced'), ctrl.getProfitMargin);
router.get('/products/turnover',     requirePermission('reports', 'advanced'), ctrl.getInventoryTurnover);

// ── Clientes ─────────────────────────────────────────────────────────────────
router.get('/customers/top',         requirePermission('reports', 'basic'),    ctrl.getTopCustomers);
router.get('/customers/credit',      requirePermission('reports', 'advanced'), ctrl.getCreditPortfolio);
router.get('/customers/layaways',    requirePermission('reports', 'basic'),    ctrl.getLayawaysSummary);

// ── Admin central ─────────────────────────────────────────────────────────────
// Solo accesible con reports.advanced (admins y supervisores)
router.get('/branches/comparison',   requirePermission('reports', 'advanced'), ctrl.getBranchComparison);

module.exports = router;
