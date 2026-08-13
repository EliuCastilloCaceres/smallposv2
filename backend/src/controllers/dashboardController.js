// src/controllers/dashboardController.js
const dashboardService = require('../services/dashboardService');

// GET /dashboard?branch_id=&start_date=&end_date=&preset=
// - branch_id: opcional. Solo un usuario CENTRAL puede mandarlo para ver
//   una sucursal específica; si lo omite, ve el consolidado. Un usuario
//   de sucursal lo tiene forzado a la suya sin importar qué mande (lo
//   resuelve el service, igual que el resto de módulos "reports-style").
// - start_date / end_date: requeridos, YYYY-MM-DD. El frontend calcula el
//   rango según el preset elegido (hoy/semana/mes/personalizado).
// - preset: 'today' | 'week' | 'month' | 'custom'. Se usa para calcular
//   el período anterior y la comparativa de KPIs.
const getDashboard = async (req, res, next) => {
  try {
    const { branch_id, start_date, end_date, preset } = req.query;

    const data = await dashboardService.getDashboard({
      requestingUser: req.user,
      branchId:       branch_id,
      startDate:      start_date,
      endDate:        end_date,
      preset:         preset || 'today',
    });

    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

module.exports = { getDashboard };