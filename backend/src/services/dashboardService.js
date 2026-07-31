// src/services/dashboardService.js
// FIX: eliminada la condición p.branch_id = ? en low_stock (products no tiene branch_id).

const db = require('../config/db');

const getDashboardInfo = async ({ branchId, date }) => {
  const [
    [productsSold],
    [orderTotals],
    [cashRegisters],
    [lowStock],
  ] = await Promise.all([

    // Productos más vendidos del día
    db.query(
      `SELECT od.product_id, p.sku, p.image, p.name,
              SUM(od.quantity) AS total_sold,
              SUM(od.subtotal) AS total_revenue
       FROM order_details od
       JOIN products p ON od.product_id = p.product_id
       JOIN orders   o ON od.order_id   = o.order_id
       WHERE o.created_at BETWEEN ? AND ?
         AND o.status = 'completed'
         AND o.branch_id = ?
       GROUP BY od.product_id
       ORDER BY total_sold DESC
       LIMIT 10`,
      [`${date} 00:00:00`, `${date} 23:59:59`, branchId]
    ),

    // Totales del día
    db.query(
      `SELECT
         COUNT(o.order_id)        AS orders_total,
         COALESCE(SUM(total), 0) AS income,
         COALESCE(SUM(discount), 0) AS total_discount,
         COALESCE(SUM(quantity_agg.total_units), 0) AS total_units_sold
       FROM orders o
       LEFT JOIN (
         SELECT order_id, SUM(quantity) AS total_units
         FROM order_details GROUP BY order_id
       ) quantity_agg ON quantity_agg.order_id = o.order_id
       WHERE o.created_at BETWEEN ? AND ?
         AND o.status = 'completed'
         AND o.branch_id = ?`,
      [`${date} 00:00:00`, `${date} 23:59:59`, branchId]
    ),

    // Estado de cajas abiertas en la sucursal
    db.query(
      `SELECT cr.cash_register_id, cr.name AS register_name,
              u.first_name, u.last_name,
              s.opened_at, s.open_amount,
              COALESCE(SUM(CASE WHEN cm.movement_type IN ('sale','income','credit_payment','layaway_payment')
                           THEN cm.amount ELSE 0 END), 0) AS total_in,
              COALESCE(SUM(CASE WHEN cm.movement_type IN ('expense','return')
                           THEN cm.amount ELSE 0 END), 0) AS total_out
       FROM cash_registers cr
       JOIN cash_register_sessions s ON s.cash_register_id = cr.cash_register_id
                                     AND s.closed_at IS NULL
       JOIN users u ON s.user_id = u.user_id
       LEFT JOIN cash_movements cm ON cm.session_id = s.session_id
       WHERE cr.branch_id = ? AND cr.is_open = 1 AND cr.is_active = 1
       GROUP BY cr.cash_register_id, s.session_id`,
      [branchId]
    ),

    // Productos con stock bajo (menos de 5 unidades) — FIX: quitado p.branch_id
    db.query(
      `SELECT p.product_id, p.name, p.sku,
              pv.label AS variant_label,
              COALESCE(s.quantity, 0) AS stock
       FROM products p
       LEFT JOIN product_variants pv ON p.product_id = pv.product_id AND pv.is_active = 1
       LEFT JOIN inventory_stock s
         ON p.product_id = s.product_id
         AND s.branch_id = ?
         AND s.variant_id <=> pv.variant_id
       WHERE p.is_active = 1
         AND COALESCE(s.quantity, 0) < 5
       ORDER BY stock ASC
       LIMIT 10`,
      [branchId]
    ),
  ]);

  const cashSummary = cashRegisters.map(cr => ({
    ...cr,
    expected_close: +(cr.open_amount + cr.total_in - cr.total_out).toFixed(2),
  }));

  return {
    orders:        orderTotals[0] ?? {},
    products_sold: productsSold,
    cash_registers: cashSummary,
    low_stock:     lowStock,
  };
};

// Vista rápida del admin central
const getAdminOverview = async ({ date }) => {
  const [branches] = await db.query(
    `SELECT
       b.branch_id, b.name AS branch_name,
       COUNT(o.order_id)          AS orders_today,
       COALESCE(SUM(o.total), 0)  AS revenue_today,
       SUM(CASE WHEN cr.is_open = 1 THEN 1 ELSE 0 END) AS open_registers
     FROM branches b
     LEFT JOIN orders o ON o.branch_id = b.branch_id
       AND o.created_at BETWEEN ? AND ?
       AND o.status = 'completed'
     LEFT JOIN cash_registers cr ON cr.branch_id = b.branch_id AND cr.is_active = 1
     WHERE b.is_active = 1
     GROUP BY b.branch_id
     ORDER BY revenue_today DESC`,
    [`${date} 00:00:00`, `${date} 23:59:59`]
  );
  return branches;
};

module.exports = { getDashboardInfo, getAdminOverview };