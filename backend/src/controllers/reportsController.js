// src/controllers/reportsController.js
// Cada endpoint soporta dos modos según el header Accept o query ?format=csv:
//   · JSON  → respuesta normal para el frontend
//   · CSV   → descarga directa para Excel
//
// El frontend solo necesita añadir ?format=csv a cualquier URL de reporte
// y el navegador descargará el archivo automáticamente.

const reportsService = require('../services/reportsService');

// ─── Helper CSV ───────────────────────────────────────────────────────────────

const toCSV = (rows) => {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape  = (v) => {
    if (v === null || v === undefined) return '';
    const str = String(v);
    // Escapar comas, comillas y saltos de línea
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };
  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => escape(row[h])).join(','))
  ];
  return lines.join('\r\n');
};

const sendResponse = (res, data, filename, format) => {
  if (format === 'csv') {
    // Aplanar data si viene como objeto con sub-arrays (ej: getSalesSummary)
    const rows = Array.isArray(data) ? data : data.daily ?? data.detail ?? [data];
    const csv  = toCSV(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    // BOM para que Excel abra correctamente con acentos
    return res.send('\uFEFF' + csv);
  }
  res.json({ status: 'success', data });
};

// ─── Helper: extraer params comunes ──────────────────────────────────────────

const getDateRange = (query) => {
  const today = new Date().toISOString().split('T')[0];
  return {
    startDate: query.startDate ?? today,
    endDate:   query.endDate   ?? today,
    format:    query.format    ?? 'json',
  };
};

const getBranchId = (req) => {
  // Admin central puede pasar ?branchId=N para filtrar una sucursal específica,
  // o dejarlo vacío para ver todo.
  // Empleados de sucursal usan siempre su propio branch_id del token.
  if (req.user.branch_id !== null) return req.user.branch_id;
  return req.query.branchId ? parseInt(req.query.branchId) : null;
};

// ─── 1. VENTAS ────────────────────────────────────────────────────────────────

const getSalesSummary = async (req, res, next) => {
  try {
    const { startDate, endDate, format } = getDateRange(req.query);
    const branchId = getBranchId(req);
    const data = await reportsService.getSalesSummary({ branchId, startDate, endDate });
    sendResponse(res, data, `ventas_${startDate}_${endDate}`, format);
  } catch (err) { next(err); }
};

const getSalesByPaymentMethod = async (req, res, next) => {
  try {
    const { startDate, endDate, format } = getDateRange(req.query);
    const branchId = getBranchId(req);
    const data = await reportsService.getSalesByPaymentMethod({ branchId, startDate, endDate });
    sendResponse(res, data, `metodos_pago_${startDate}_${endDate}`, format);
  } catch (err) { next(err); }
};

const getCashRegisterCut = async (req, res, next) => {
  try {
    const { startDate, endDate, format } = getDateRange(req.query);
    const branchId = getBranchId(req);
    const data = await reportsService.getCashRegisterCut({ branchId, startDate, endDate });
    sendResponse(res, data, `corte_caja_${startDate}_${endDate}`, format);
  } catch (err) { next(err); }
};

const getSalesByUser = async (req, res, next) => {
  try {
    const { startDate, endDate, format } = getDateRange(req.query);
    const branchId = getBranchId(req);
    const data = await reportsService.getSalesByUser({ branchId, startDate, endDate });
    sendResponse(res, data, `ventas_vendedor_${startDate}_${endDate}`, format);
  } catch (err) { next(err); }
};

// ─── 2. PRODUCTOS ─────────────────────────────────────────────────────────────

const getTopProducts = async (req, res, next) => {
  try {
    const { startDate, endDate, format } = getDateRange(req.query);
    const branchId = getBranchId(req);
    const limit = parseInt(req.query.limit ?? 20);
    const data = await reportsService.getTopProducts({ branchId, startDate, endDate, limit });
    sendResponse(res, data, `productos_top_${startDate}_${endDate}`, format);
  } catch (err) { next(err); }
};

const getProfitMargin = async (req, res, next) => {
  try {
    const { startDate, endDate, format } = getDateRange(req.query);
    const branchId = getBranchId(req);
    const data = await reportsService.getProfitMarginByProduct({ branchId, startDate, endDate });
    sendResponse(res, data, `margen_productos_${startDate}_${endDate}`, format);
  } catch (err) { next(err); }
};

const getInventoryTurnover = async (req, res, next) => {
  try {
    const { startDate, endDate, format } = getDateRange(req.query);
    const branchId = getBranchId(req);
    const data = await reportsService.getInventoryTurnover({ branchId, startDate, endDate });
    sendResponse(res, data, `rotacion_inventario_${startDate}_${endDate}`, format);
  } catch (err) { next(err); }
};

// ─── 3. CLIENTES ──────────────────────────────────────────────────────────────

const getTopCustomers = async (req, res, next) => {
  try {
    const { startDate, endDate, format } = getDateRange(req.query);
    const branchId = getBranchId(req);
    const limit = parseInt(req.query.limit ?? 20);
    const data = await reportsService.getTopCustomers({ branchId, startDate, endDate, limit });
    sendResponse(res, data, `clientes_top_${startDate}_${endDate}`, format);
  } catch (err) { next(err); }
};

const getCreditPortfolio = async (req, res, next) => {
  try {
    const { format } = getDateRange(req.query);
    const branchId = getBranchId(req);
    const data = await reportsService.getCreditPortfolio({ branchId });
    sendResponse(res, data, 'cartera_credito', format);
  } catch (err) { next(err); }
};

const getLayawaysSummary = async (req, res, next) => {
  try {
    const { format } = getDateRange(req.query);
    const branchId = getBranchId(req);
    const data = await reportsService.getLayawaysSummary({ branchId });
    sendResponse(res, data, 'apartados_activos', format);
  } catch (err) { next(err); }
};

// ─── 4. COMPARATIVO ENTRE SUCURSALES ─────────────────────────────────────────

const getBranchComparison = async (req, res, next) => {
  try {
    const { startDate, endDate, format } = getDateRange(req.query);
    const data = await reportsService.getBranchComparison({ startDate, endDate });
    sendResponse(res, data, `comparativo_sucursales_${startDate}_${endDate}`, format);
  } catch (err) { next(err); }
};

module.exports = {
  getSalesSummary, getSalesByPaymentMethod, getCashRegisterCut, getSalesByUser,
  getTopProducts, getProfitMargin, getInventoryTurnover,
  getTopCustomers, getCreditPortfolio, getLayawaysSummary,
  getBranchComparison,
};
