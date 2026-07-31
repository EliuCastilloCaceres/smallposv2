// src/controllers/dashboardController.js
const dashboardService = require('../services/dashboardService');

const getDashboard = async (req, res, next) => {
  try {
    const branchId = req.user.branch_id;
    const date     = req.query.date ?? new Date().toISOString().split('T')[0];

    // Admin central sin sucursal asignada → overview global
    if (branchId === null) {
      const data = await dashboardService.getAdminOverview({ date });
      return res.json({ status: 'success', mode: 'admin_overview', data });
    }

    const data = await dashboardService.getDashboardInfo({ branchId, date });
    res.json({ status: 'success', mode: 'branch', data });
  } catch (err) { next(err); }
};

module.exports = { getDashboard };
