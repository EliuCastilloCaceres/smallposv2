// src/routes/report_routes.js
const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

router.use(verifyToken);

// GET /reports/cash-sessions?cash_register_id=&user_id=&date_from=&date_to=&only_with_difference=&page=&limit=
router.get(
  '/cash-sessions',
  requirePermission('reports', 'basic'),
  reportController.getCashSessions
);

// GET /reports/cash-sessions/:sessionId
router.get(
  '/cash-sessions/:sessionId',
  requirePermission('reports', 'basic'),
  reportController.getCashSessionDetail
);

// GET /reports/profit?start_date=&end_date=&branch_id=&category_id=&group_by=&sort_by=&sort_dir=&exclude_no_cost=&page=&limit=
router.get(
  '/profit',
  requirePermission('reports', 'profit'),
  reportController.getProfitReport
);

// GET /reports/trend?start_date=&end_date=&granularity=&compare=&branch_id=
router.get(
  '/trend',
  requirePermission('reports', 'trend'),
  reportController.getTrendReport
);

// GET /reports/inventory?branch_id=&category_id=&provider_id=&search=&exclude_category_ids=&exclude_no_cost=&group_by=&alert=&sort_by=&sort_dir=&page=&limit=
router.get(
  '/inventory',
  requirePermission('reports', 'inventory'),
  reportController.getInventoryReport
);

// GET /reports/rotation?days=&branch_id=&category_id=&provider_id=&search=&exclude_category_ids=&exclude_no_cost=&sort_by=&sort_dir=&page=&limit=
router.get(
  '/rotation',
  requirePermission('reports', 'rotation'),
  reportController.getRotationReport
);

// GET /reports/expenses?start_date=&end_date=&branch_id=&group_by=&page=&limit=
router.get(
  '/expenses',
  requirePermission('reports', 'expenses'),
  reportController.getExpenseReport
);

module.exports = router;