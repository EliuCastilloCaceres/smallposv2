// src/controllers/reportController.js
const reportService = require('../services/reportService');
const { resolveOptionalBranchId } = require('../helpers/helper');
const { todayInMexico } = require('../utils/timezone');

// Alcance por sucursal de todo el módulo, igual que el Dashboard: un usuario
// con sucursal asignada ve solo la suya aunque mande otro branch_id; el
// admin central ve todas o filtra por una (resolveOptionalBranchId).
// [FIX] Sesiones de caja usaba resolveUnrestrictedBranchId, que nunca lee la
// sucursal del usuario: sin branch_id devolvía todas, y la pestaña no lo
// manda para quien no es admin central. Ver specs/04-reporte-ventas-y-utilidad.md,
// requisito 9.

const intOrNull = (value) => (value ? parseInt(value) : null);

// La utilidad neta de Ventas y utilidad muestra el total de gastos, así que
// pide también reports.expenses (specs/13-reporte-de-gastos-y-utilidad-neta.md,
// requisito 15). Mismo bypass de superadmin que requirePermission.
const canSeeExpenses = (user) =>
  user.role_name === 'superadmin' || user.permissions.includes('reports.expenses');

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

    // Con una categoría de producto, la utilidad bruta es solo la de esa
    // categoría y los gastos son de todo el negocio: no hay utilidad neta
    // (requisito 13)
    const result = await reportService.getProfitReport({
      startDate,
      endDate,
      branchId:      resolveOptionalBranchId(req),
      categoryId:    intOrNull(categoryId),
      includeNet:    canSeeExpenses(req.user) && !intOrNull(categoryId),
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

// GET /reports/trend
const getTrendReport = async (req, res, next) => {
  try {
    const { start_date: startDate, end_date: endDate, granularity, compare } = req.query;

    const data = await reportService.getTrendReport({
      startDate,
      endDate,
      granularity: granularity || null,
      compare:     compare || 'none',
      branchId:    resolveOptionalBranchId(req),
      today:       todayInMexico(),
    });

    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

// GET /reports/inventory
const getInventoryReport = async (req, res, next) => {
  try {
    const {
      category_id: categoryId,
      provider_id: providerId,
      search,
      exclude_category_ids: excludeCategoryIds,
      exclude_no_cost: excludeNoCost,
      group_by: groupBy,
      alert,
      sort_by: sortBy,
      sort_dir: sortDir,
      page,
      limit,
    } = req.query;

    const result = await reportService.getInventoryReport({
      branchId:           resolveOptionalBranchId(req),
      isCentral:          req.user.branch_id === null,
      categoryId:         intOrNull(categoryId),
      providerId:         intOrNull(providerId),
      search:             search ? String(search) : '',
      excludeCategoryIds: excludeCategoryIds ? String(excludeCategoryIds) : '',
      excludeNoCost:      excludeNoCost === 'true' || excludeNoCost === '1',
      groupBy:            groupBy || 'product',
      alert:              alert || null,
      sortBy:             sortBy  || 'cost_value',
      sortDir:            sortDir || 'desc',
      page:  intOrNull(page)  ?? 1,
      limit: intOrNull(limit) ?? 20,
    });

    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

// GET /reports/rotation
const getRotationReport = async (req, res, next) => {
  try {
    const {
      days,
      category_id: categoryId,
      provider_id: providerId,
      search,
      exclude_category_ids: excludeCategoryIds,
      exclude_no_cost: excludeNoCost,
      sort_by: sortBy,
      sort_dir: sortDir,
      page,
      limit,
    } = req.query;

    const result = await reportService.getRotationReport({
      today:              todayInMexico(),
      // Sin parseInt: "30x" no es un periodo válido
      days:               days === undefined || days === '' ? 30 : Number(days),
      branchId:           resolveOptionalBranchId(req),
      categoryId:         intOrNull(categoryId),
      providerId:         intOrNull(providerId),
      search:             search ? String(search) : '',
      excludeCategoryIds: excludeCategoryIds ? String(excludeCategoryIds) : '',
      excludeNoCost:      excludeNoCost === 'true' || excludeNoCost === '1',
      sortBy:             sortBy  || 'cost_value',
      sortDir:            sortDir || 'desc',
      page:  intOrNull(page)  ?? 1,
      limit: intOrNull(limit) ?? 20,
    });

    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

// GET /reports/expenses
const getExpenseReport = async (req, res, next) => {
  try {
    const { start_date: startDate, end_date: endDate, group_by: groupBy, page, limit } = req.query;

    const result = await reportService.getExpenseReport({
      startDate,
      endDate,
      branchId: resolveOptionalBranchId(req),
      groupBy:  groupBy || 'category',
      page:  intOrNull(page)  ?? 1,
      limit: intOrNull(limit) ?? 20,
    });

    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

module.exports = {
  getCashSessions, getCashSessionDetail, getProfitReport, getTrendReport, getInventoryReport, getRotationReport,
  getExpenseReport,
};