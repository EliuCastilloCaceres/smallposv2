// src/controllers/reportController.js
const reportService = require('../services/reportService');
const { resolveUnrestrictedBranchId } = require('../helpers/helper');

// GET /reports/cash-sessions
// [NOTA] Mismo criterio que layawayController.getByBranch: listado sin
// restricción forzada de sucursal propia — un usuario con reports:basic ve
// sus propias sesiones si tiene sucursal asignada, o todas si es admin
// central (resolveUnrestrictedBranchId ya resuelve esa diferencia).
const getCashSessions = async (req, res, next) => {
  try {
    const branchId = resolveUnrestrictedBranchId(req);
    const {
      cash_register_id: cashRegisterId,
      user_id: userId,
      date_from: dateFrom,
      date_to: dateTo,
      only_with_difference: onlyWithDifference,
      page,
      limit,
    } = req.query;

    const result = await reportService.getCashSessions({
      branchId,
      cashRegisterId: cashRegisterId ? parseInt(cashRegisterId) : null,
      userId:         userId ? parseInt(userId) : null,
      dateFrom:       dateFrom || null,
      dateTo:         dateTo || null,
      onlyWithDifference: onlyWithDifference === 'true' || onlyWithDifference === '1',
      page:  page  ? parseInt(page)  : 1,
      limit: limit ? parseInt(limit) : 20,
    });

    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

// GET /reports/cash-sessions/:sessionId
const getCashSessionDetail = async (req, res, next) => {
  try {
    const branchId = resolveUnrestrictedBranchId(req);
    const data = await reportService.getCashSessionDetail({
      sessionId: parseInt(req.params.sessionId),
      branchId,
    });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

module.exports = { getCashSessions, getCashSessionDetail };