// src/services/reportsService.js
// FIX: getSalesByPaymentMethod ahora usa order_payments + payment_methods
//      (orders ya no tiene la columna payment_method).

const db = require('../config/db');

// ─── Helper: cláusula de filtro por sucursal ──────────────────────────────────

const branchFilter = (alias, branchId, params, andOrWhere = 'AND') => {
  if (branchId === null) return '';
  params.push(branchId);
  return `${andOrWhere} ${alias}.branch_id = ?`;
};

// ─── 1. VENTAS ────────────────────────────────────────────────────────────────

const getSalesSummary = async ({ branchId, startDate, endDate }) => {
  const params = [`${startDate} 00:00:00`, `${endDate} 23:59:59`];
  const bFilter = branchFilter('o', branchId, params, 'AND');

  const [daily] = await db.query(
    `SELECT
       DATE(o.created_at)              AS date,
       b.name                          AS branch_name,
       COUNT(o.order_id)               AS total_orders,
       SUM(o.subtotal)                 AS subtotal,
       SUM(o.discount)                 AS total_discount,
       SUM(o.total)                    AS total_revenue,
       SUM(o.total - (
         SELECT COALESCE(SUM(od.purchase_price * od.quantity), 0)
         FROM order_details od WHERE od.order_id = o.order_id
       ))                              AS gross_profit
     FROM orders o
     JOIN branches b ON o.branch_id = b.branch_id
     WHERE o.created_at BETWEEN ? AND ?
       AND o.status = 'completed'
       ${bFilter}
     GROUP BY DATE(o.created_at), o.branch_id
     ORDER BY date ASC, b.name ASC`,
    params
  );

  const totals = daily.reduce((acc, row) => {
    const key = row.branch_name;
    if (!acc[key]) acc[key] = { branch_name: key, total_orders: 0, subtotal: 0, total_discount: 0, total_revenue: 0, gross_profit: 0 };
    acc[key].total_orders   += row.total_orders;
    acc[key].subtotal       += row.subtotal;
    acc[key].total_discount += row.total_discount;
    acc[key].total_revenue  += row.total_revenue;
    acc[key].gross_profit   += row.gross_profit;
    return acc;
  }, {});

  const grandTotal = Object.values(totals).reduce((acc, b) => ({
    total_orders:   acc.total_orders   + b.total_orders,
    subtotal:       acc.subtotal       + b.subtotal,
    total_discount: acc.total_discount + b.total_discount,
    total_revenue:  acc.total_revenue  + b.total_revenue,
    gross_profit:   acc.gross_profit   + b.gross_profit,
  }), { total_orders: 0, subtotal: 0, total_discount: 0, total_revenue: 0, gross_profit: 0 });

  return { daily, by_branch: Object.values(totals), grand_total: grandTotal };
};

/**
 * FIX: Ventas por método de pago — ahora consulta order_payments y payment_methods
 *      en lugar de la columna eliminada orders.payment_method.
 */
const getSalesByPaymentMethod = async ({ branchId, startDate, endDate }) => {
  const params = [`${startDate} 00:00:00`, `${endDate} 23:59:59`];
  const bFilter = branchFilter('o', branchId, params, 'AND');

  const [rows] = await db.query(
    `SELECT
       pm.code           AS payment_method,
       pm.name           AS payment_method_name,
       b.name            AS branch_name,
       COUNT(DISTINCT o.order_id) AS total_orders,
       SUM(op.amount)    AS total_amount
     FROM orders o
     JOIN order_payments op ON o.order_id = op.order_id
     JOIN payment_methods pm ON op.payment_method_id = pm.payment_method_id
     JOIN branches b ON o.branch_id = b.branch_id
     WHERE o.created_at BETWEEN ? AND ?
       AND o.status = 'completed'
       ${bFilter}
     GROUP BY pm.payment_method_id, o.branch_id
     ORDER BY total_amount DESC`,
    params
  );
  return rows;
};

const getCashRegisterCut = async ({ branchId, startDate, endDate }) => {
  const params = [`${startDate} 00:00:00`, `${endDate} 23:59:59`];
  const bFilter = branchFilter('cr', branchId, params, 'AND');

  const [rows] = await db.query(
    `SELECT
       s.session_id,
       cr.name                                          AS register_name,
       b.name                                           AS branch_name,
       u.first_name                                     AS cashier,
       s.open_amount,
       s.close_amount,
       s.opened_at,
       s.closed_at,
       COALESCE(SUM(CASE WHEN cm.movement_type = 'sale'     THEN cm.amount ELSE 0 END), 0) AS cash_sales,
       COALESCE(SUM(CASE WHEN cm.movement_type = 'income'   THEN cm.amount ELSE 0 END), 0) AS other_income,
       COALESCE(SUM(CASE WHEN cm.movement_type = 'expense'  THEN cm.amount ELSE 0 END), 0) AS expenses,
       COALESCE(SUM(CASE WHEN cm.movement_type = 'return'   THEN cm.amount ELSE 0 END), 0) AS returns,
       s.open_amount
         + COALESCE(SUM(CASE WHEN cm.movement_type IN ('sale','income') THEN  cm.amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN cm.movement_type IN ('expense','return') THEN cm.amount ELSE 0 END), 0)
                                                        AS expected_close
     FROM cash_register_sessions s
     JOIN cash_registers cr ON s.cash_register_id = cr.cash_register_id
     JOIN branches b        ON cr.branch_id        = b.branch_id
     JOIN users u           ON s.user_id            = u.user_id
     LEFT JOIN cash_movements cm ON cm.session_id   = s.session_id
     WHERE s.opened_at BETWEEN ? AND ?
       ${bFilter}
     GROUP BY s.session_id
     ORDER BY s.opened_at DESC`,
    params
  );
  return rows;
};

const getSalesByUser = async ({ branchId, startDate, endDate }) => {
  const params = [`${startDate} 00:00:00`, `${endDate} 23:59:59`];
  const bFilter = branchFilter('o', branchId, params, 'AND');

  const [rows] = await db.query(
    `SELECT
       u.user_id,
       CONCAT(u.first_name, ' ', COALESCE(u.last_name,'')) AS seller,
       b.name          AS branch_name,
       COUNT(o.order_id)                                    AS total_orders,
       SUM(o.total)                                         AS total_revenue,
       SUM(o.discount)                                      AS total_discount
     FROM orders o
     JOIN users    u ON o.user_id    = u.user_id
     JOIN branches b ON o.branch_id  = b.branch_id
     WHERE o.created_at BETWEEN ? AND ?
       AND o.status = 'completed'
       ${bFilter}
     GROUP BY o.user_id, o.branch_id
     ORDER BY total_revenue DESC`,
    params
  );
  return rows;
};

// ─── 2. PRODUCTOS ─────────────────────────────────────────────────────────────

const getTopProducts = async ({ branchId, startDate, endDate, limit = 20 }) => {
  const params = [`${startDate} 00:00:00`, `${endDate} 23:59:59`];
  const bFilter = branchFilter('o', branchId, params, 'AND');
  params.push(parseInt(limit));

  const [rows] = await db.query(
    `SELECT
       p.product_id,
       p.name                                                  AS product_name,
       p.sku,
       pv.label                                                AS variant_label,
       b.name                                                  AS branch_name,
       SUM(od.quantity)                                        AS units_sold,
       SUM(od.subtotal)                                        AS total_revenue,
       SUM(od.purchase_price * od.quantity)                    AS total_cost,
       SUM(od.subtotal) - SUM(od.purchase_price * od.quantity) AS gross_profit,
       ROUND(
         (SUM(od.subtotal) - SUM(od.purchase_price * od.quantity))
         / NULLIF(SUM(od.subtotal), 0) * 100, 2
       )                                                       AS margin_pct
     FROM order_details od
     JOIN orders  o  ON od.order_id   = o.order_id
     JOIN products p ON od.product_id = p.product_id
     JOIN branches b ON o.branch_id   = b.branch_id
     LEFT JOIN product_variants pv ON od.variant_id = pv.variant_id
     WHERE o.created_at BETWEEN ? AND ?
       AND o.status = 'completed'
       ${bFilter}
     GROUP BY od.product_id, od.variant_id, o.branch_id
     ORDER BY units_sold DESC
     LIMIT ?`,
    params
  );
  return rows;
};

const getProfitMarginByProduct = async ({ branchId, startDate, endDate }) => {
  const params = [`${startDate} 00:00:00`, `${endDate} 23:59:59`];
  const bFilter = branchFilter('o', branchId, params, 'AND');

  const [rows] = await db.query(
    `SELECT
       p.product_id,
       p.name                                                  AS product_name,
       p.sku,
       b.name                                                  AS branch_name,
       SUM(od.quantity)                                        AS units_sold,
       AVG(od.unit_price)                                      AS avg_sale_price,
       AVG(od.purchase_price)                                  AS avg_purchase_price,
       SUM(od.subtotal)                                        AS total_revenue,
       SUM(od.purchase_price * od.quantity)                    AS total_cost,
       SUM(od.subtotal) - SUM(od.purchase_price * od.quantity) AS gross_profit,
       ROUND(
         (SUM(od.subtotal) - SUM(od.purchase_price * od.quantity))
         / NULLIF(SUM(od.subtotal), 0) * 100, 2
       )                                                       AS margin_pct
     FROM order_details od
     JOIN orders   o ON od.order_id   = o.order_id
     JOIN products p ON od.product_id = p.product_id
     JOIN branches b ON o.branch_id   = b.branch_id
     WHERE o.created_at BETWEEN ? AND ?
       AND o.status = 'completed'
       ${bFilter}
     GROUP BY od.product_id, o.branch_id
     ORDER BY gross_profit DESC`,
    params
  );
  return rows;
};

const getInventoryTurnover = async ({ branchId, startDate, endDate }) => {
  const daysDiff = Math.max(
    1,
    Math.round((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24))
  );
  const params = [`${startDate} 00:00:00`, `${endDate} 23:59:59`];
  const bFilter = branchFilter('o', branchId, params, 'AND');
  const stockBFilter = branchId ? 'AND s.branch_id = ?' : '';
  if (branchId) params.push(branchId);

  const [rows] = await db.query(
    `SELECT
       p.product_id,
       p.name                                      AS product_name,
       p.sku,
       pv.label                                    AS variant_label,
       COALESCE(s.quantity, 0)                     AS current_stock,
       COALESCE(SUM(od.quantity), 0)               AS units_sold,
       ROUND(COALESCE(SUM(od.quantity), 0) / ?, 4) AS daily_sales_rate,
       CASE
         WHEN COALESCE(SUM(od.quantity), 0) = 0 THEN NULL
         ELSE ROUND(COALESCE(s.quantity, 0) / (COALESCE(SUM(od.quantity), 0) / ?), 1)
       END                                         AS days_of_stock
     FROM products p
     LEFT JOIN product_variants pv ON p.product_id = pv.product_id AND pv.is_active = 1
     LEFT JOIN inventory_stock s
       ON p.product_id = s.product_id
       AND s.variant_id <=> pv.variant_id
       ${stockBFilter}
     LEFT JOIN order_details od ON od.product_id = p.product_id AND od.variant_id <=> pv.variant_id
     LEFT JOIN orders o ON od.order_id = o.order_id
       AND o.created_at BETWEEN ? AND ?
       AND o.status = 'completed'
       ${bFilter}
     WHERE p.is_active = 1
     GROUP BY p.product_id, pv.variant_id, s.quantity
     ORDER BY days_of_stock ASC`,
    [daysDiff, daysDiff, ...params]
  );
  return rows;
};

// ─── 3. CLIENTES ──────────────────────────────────────────────────────────────

const getTopCustomers = async ({ branchId, startDate, endDate, limit = 20 }) => {
  const params = [`${startDate} 00:00:00`, `${endDate} 23:59:59`];
  const bFilter = branchFilter('o', branchId, params, 'AND');
  params.push(parseInt(limit));

  const [rows] = await db.query(
    `SELECT
       c.customer_id,
       CONCAT(c.first_name, ' ', COALESCE(c.last_name,'')) AS customer_name,
       c.phone_number,
       COUNT(DISTINCT o.order_id)                           AS total_orders,
       SUM(o.total)                                         AS total_spent,
       AVG(o.total)                                         AS avg_ticket,
       c.credit_limit,
       c.credit_balance
     FROM orders o
     JOIN customers c ON o.customer_id = c.customer_id
     WHERE o.created_at BETWEEN ? AND ?
       AND o.status = 'completed'
       AND c.customer_id != 1
       ${bFilter}
     GROUP BY o.customer_id
     ORDER BY total_spent DESC
     LIMIT ?`,
    params
  );
  return rows;
};

const getCreditPortfolio = async ({ branchId }) => {
  const params = [];
  const bFilter = branchFilter('o', branchId, params, 'AND');

  const [rows] = await db.query(
    `SELECT
       c.customer_id,
       CONCAT(c.first_name, ' ', COALESCE(c.last_name,'')) AS customer_name,
       c.phone_number,
       c.credit_limit,
       c.credit_balance                                     AS total_debt,
       c.credit_limit - c.credit_balance                   AS available_credit,
       COUNT(cs.credit_sale_id)                             AS active_credits,
       MIN(cs.due_date)                                     AS nearest_due_date,
       SUM(CASE WHEN cs.status = 'overdue' THEN cs.balance ELSE 0 END) AS overdue_amount
     FROM customers c
     JOIN credit_sales cs ON c.customer_id = cs.customer_id
     LEFT JOIN orders o   ON cs.order_id   = o.order_id
     WHERE cs.status IN ('active','overdue')
       ${bFilter}
     GROUP BY c.customer_id
     ORDER BY overdue_amount DESC, total_debt DESC`,
    params
  );
  return rows;
};

const getLayawaysSummary = async ({ branchId }) => {
  const params = [];
  const bFilter = branchFilter('l', branchId, params, 'AND');

  const [summary] = await db.query(
    `SELECT
       COUNT(*)             AS total_layaways,
       SUM(l.total_amount)  AS total_value,
       SUM(l.amount_paid)   AS total_collected,
       SUM(l.balance)       AS total_pending,
       SUM(CASE WHEN l.due_date < CURDATE() THEN 1 ELSE 0 END) AS overdue_count
     FROM layaways l
     WHERE l.status = 'active'
       ${bFilter}`,
    params
  );

  const detailParams = branchId ? [branchId] : [];
  const detailFilter = branchId ? 'AND l.branch_id = ?' : '';

  const [detail] = await db.query(
    `SELECT
       l.layaway_id,
       CONCAT(c.first_name,' ',COALESCE(c.last_name,'')) AS customer_name,
       c.phone_number,
       b.name                                             AS branch_name,
       l.total_amount, l.amount_paid, l.balance,
       l.due_date,
       CASE WHEN l.due_date < CURDATE() THEN 1 ELSE 0 END AS is_overdue,
       l.created_at
     FROM layaways l
     JOIN customers c ON l.customer_id = c.customer_id
     JOIN branches  b ON l.branch_id   = b.branch_id
     WHERE l.status = 'active'
       ${detailFilter}
     ORDER BY l.due_date ASC`,
    detailParams
  );

  return { summary: summary[0], detail };
};

// ─── 4. COMPARATIVO ENTRE SUCURSALES (admin central) ─────────────────────────

const getBranchComparison = async ({ startDate, endDate }) => {
  const [sales] = await db.query(
    `SELECT
       b.branch_id,
       b.name                                                  AS branch_name,
       COUNT(o.order_id)                                       AS total_orders,
       COALESCE(SUM(o.total), 0)                               AS total_revenue,
       COALESCE(SUM(o.discount), 0)                            AS total_discount,
       COALESCE(SUM(od_agg.total_cost), 0)                     AS total_cost,
       COALESCE(SUM(o.total), 0) - COALESCE(SUM(od_agg.total_cost), 0) AS gross_profit
     FROM branches b
     LEFT JOIN orders o ON o.branch_id = b.branch_id
       AND o.created_at BETWEEN ? AND ?
       AND o.status = 'completed'
     LEFT JOIN (
       SELECT order_id, SUM(purchase_price * quantity) AS total_cost
       FROM order_details GROUP BY order_id
     ) od_agg ON od_agg.order_id = o.order_id
     WHERE b.is_active = 1
     GROUP BY b.branch_id
     ORDER BY total_revenue DESC`,
    [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
  );

  const [creditSummary] = await db.query(
    `SELECT
       b.branch_id,
       COUNT(cs.credit_sale_id)                               AS active_credits,
       COALESCE(SUM(cs.balance), 0)                           AS total_credit_balance,
       COALESCE(SUM(CASE WHEN cs.status='overdue' THEN cs.balance ELSE 0 END), 0) AS overdue_balance
     FROM branches b
     LEFT JOIN orders o     ON o.branch_id    = b.branch_id
     LEFT JOIN credit_sales cs ON cs.order_id = o.order_id AND cs.status IN ('active','overdue')
     WHERE b.is_active = 1
     GROUP BY b.branch_id`,
    []
  );

  const creditMap = Object.fromEntries(creditSummary.map(r => [r.branch_id, r]));
  const merged = sales.map(s => ({
    ...s,
    margin_pct: s.total_revenue > 0
      ? +((s.gross_profit / s.total_revenue) * 100).toFixed(2)
      : 0,
    ...(creditMap[s.branch_id] ?? { active_credits: 0, total_credit_balance: 0, overdue_balance: 0 }),
  }));

  return merged;
};

module.exports = {
  getSalesSummary,
  getSalesByPaymentMethod,
  getCashRegisterCut,
  getSalesByUser,
  getTopProducts,
  getProfitMarginByProduct,
  getInventoryTurnover,
  getTopCustomers,
  getCreditPortfolio,
  getLayawaysSummary,
  getBranchComparison,
};