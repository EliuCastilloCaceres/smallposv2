// src/controllers/reportController.js
const reportService = require('../services/reportService');
const { resolveOptionalBranchId } = require('../helpers/helper');

// Alcance por sucursal de todo el módulo, igual que el Dashboard: un usuario
// con sucursal asignada ve solo la suya aunque mande otro branch_id; el
// admin central ve todas o filtra por una (resolveOptionalBranchId).
// [FIX] Sesiones de caja usaba resolveUnrestrictedBranchId, que nunca lee la
// sucursal del usuario: sin branch_id devolvía todas, y la pestaña no lo
// manda para quien no es admin central. Ver specs/04-reporte-ventas-y-utilidad.md,
// requisito 9.

const intOrNull = (value) => (value ? parseInt(value) : null);

// GET /reports/cash-sessions
const getCashSessions = async (req, res, next) => {
  try {
    const branchId = resolveOptionalBranchId(req);
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
      cashRegisterId: intOrNull(cashRegisterId),
      userId:         intOrNull(userId),
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
// Una sesión de otra sucursal responde igual que una que no existe (404).
const getCashSessionDetail = async (req, res, next) => {
  try {
    const branchId = resolveOptionalBranchId(req);
    const data = await reportService.getCashSessionDetail({
      sessionId: parseInt(req.params.sessionId),
      branchId,
    });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

// GET /reports/profit
const getProfitReport = async (req, res, next) => {
  try {
    const {
      start_date: startDate,
      end_date: endDate,
      category_id: categoryId,
      group_by: groupBy,
      sort_by: sortBy,
      sort_dir: sortDir,
      exclude_no_cost: excludeNoCost,
      page,
      limit,
    } = req.query;

    const result = await reportService.getProfitReport({
      startDate,
      endDate,
      branchId:      resolveOptionalBranchId(req),
      categoryId:    intOrNull(categoryId),
      groupBy:       groupBy || 'product',
      sortBy:        sortBy  || 'profit',
      sortDir:       sortDir || 'desc',
      excludeNoCost: excludeNoCost === 'true' || excludeNoCost === '1',
      page:  intOrNull(page)  ?? 1,
      limit: intOrNull(limit) ?? 20,
    });

    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

module.exports = { getCashSessions, getCashSessionDetail, getProfitReport };