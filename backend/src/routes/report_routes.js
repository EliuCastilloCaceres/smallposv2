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

module.exports = router;