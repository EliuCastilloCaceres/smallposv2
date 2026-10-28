// src/services/reportService.js
// Módulo de Reportes. Primera tab: Sesiones de caja.
//
// [DISEÑO] Todo se reconstruye de forma histórica a partir de datos ya
// existentes (cash_register_sessions, cash_movements, payment_events,
// orders) — no se agrega ninguna columna nueva. La fórmula de "esperado" y
// "diferencia" es la MISMA que ya usa cashRegisterService.closeRegister,
// solo que aquí se calcula para cualquier sesión ya cerrada (o abierta),
// no solo en el momento del cierre:
//
//   esperado    = open_amount + SUM(movimientos que suman)
//                 − SUM(movimientos que restan)
//   diferencia  = close_amount − esperado
//
// Qué tipos suman y cuáles restan vive en helpers/cashMovements.js (spec 12).
//
// El retiro de efectivo (withdrawAmt) no se pierde: el POS lo inserta como
// un movimiento 'withdrawal' en cash_movements ANTES de cerrar, así que
// total_out de aquí ya lo trae contado — no hace falta guardarlo aparte.

const db = require('../config/db');
const { NotFoundError, ValidationError } = require('../errors/AppError');
const {
  SOLD_STATUSES_SQL, RETURNS_JOIN_SQL, NET_QUANTITY_SQL, NET_SALE_SQL,
} = require('../helpers/soldLines');
const { ORDER_REFUNDS_JOIN_SQL, ORDER_NET_SALE_SQL } = require('../helpers/orderNet');
const periods = require('../utils/periods');
const { CASH_IN_SQL, CASH_OUT_SQL, sumCashMovements } = require('../helpers/cashMovements');
// FIX: dateFrom/dateTo llegan del frontend como fecha "de pared" en México
// (ej. "2026-08-24"), pero se comparaban directo contra s.opened_at /
// s.closed_at, que son hora del SERVIDOR (2h adelantada sobre México) —
// mismo bug que ya se corrigió en orderService.js. Se usa el mismo módulo
// compartido para no volver a desincronizar el criterio.
const { toServerDayStart, toServerDayEnd, toServerRange, createdAtMx } = require('../utils/timezone');

// ─── Sesiones de caja — listado ────────────────────────────────────────────

// [NOTA] branchId = null → todas las sucursales (admin central). Un usuario
// con sucursal asignada siempre llega aquí con su branch_id ya resuelto por
// el controller, igual que en cashRegisterService.getAllRegisters.
const getCashSessions = async ({
  branchId = null,
  cashRegisterId = null,
  userId = null,
  dateFrom = null,
  dateTo = null,
  onlyWithDifference = false,
  page = 1,
  limit = 20,
}) => {
  const where  = ['1=1'];
  const params = [];

  if (branchId !== null)       { where.push('b.branch_id = ?');           params.push(branchId); }
  if (cashRegisterId !== null) { where.push('s.cash_register_id = ?');    params.push(cashRegisterId); }
  if (userId !== null)         { where.push('s.user_id = ?');             params.push(userId); }
  // Filtra por apertura — una sesión que sigue abierta desde antes del
  // rango igual se cuela si su cierre (o "ahora") cae dentro; se prioriza
  // no esconder cajas abiertas viejas, que es justo la señal de alerta
  // que más importa en este reporte.
  // [FIX] dateTo llega como fecha simple ('2026-08-24', sin hora) desde el
  // <input type="date"> del frontend. MySQL la interpreta como
  // '2026-08-24 00:00:00' — comparar "opened_at <= dateTo" tal cual
  // excluía CUALQUIER sesión abierta ese mismo día después de medianoche,
  // es decir prácticamente todas las de "hoy" (el filtro por defecto).
  // Se extiende al final del día para que sea inclusivo.
  if (dateFrom !== null) {
    // FIX: se traduce la fecha de México al límite equivalente en hora del
    // servidor antes de compararla — antes una sesión abierta a las 11pm
    // México (medianoche+ en el servidor) podía quedar fuera de "hoy", o
    // colarse un día antes/después según el caso.
    const serverDateFrom = await toServerDayStart(dateFrom);
    where.push('(s.closed_at IS NULL OR s.closed_at >= ?) AND s.opened_at >= ?');
    params.push(serverDateFrom, serverDateFrom);
  }
  if (dateTo !== null) {
    const serverDateTo = await toServerDayEnd(dateTo);
    where.push('s.opened_at <= ?');
    params.push(serverDateTo);
  }

  const whereSql = where.join(' AND ');

  // Derivadas agregadas por session_id — se agregan ANTES de unirse a la
  // sesión para no cruzar cash_movements con payment_events directamente
  // (dos tablas 1-a-muchos combinadas en el mismo JOIN multiplicarían
  // filas y dañarían las sumas).
  const baseFrom = `
     FROM cash_register_sessions s
     JOIN cash_registers cr ON s.cash_register_id = cr.cash_register_id
     JOIN branches b        ON cr.branch_id        = b.branch_id
     JOIN users u           ON s.user_id            = u.user_id
     LEFT JOIN (
       SELECT session_id,
              SUM(CASE WHEN movement_type IN (${CASH_IN_SQL}) THEN amount ELSE 0 END) AS total_in,
              SUM(CASE WHEN movement_type IN (${CASH_OUT_SQL}) THEN amount ELSE 0 END) AS total_out
       FROM cash_movements
       GROUP BY session_id
     ) mv ON mv.session_id = s.session_id
     LEFT JOIN (
       SELECT session_id, SUM(amount) AS total_sold
       FROM payment_events
       GROUP BY session_id
     ) pe ON pe.session_id = s.session_id
     WHERE ${whereSql}
  `;

  // FIX: 'HAVING s.closed_at IS NOT NULL AND ABS(s.close_amount - expected) > 0.01'
  // tronaba con "Unknown column 's.closed_at'" en la query de conteo
  // (`SELECT COUNT(*) FROM (SELECT s.session_id ${baseFrom} HAVING ...) t`)
  // — esa subconsulta solo selecciona s.session_id, ni s.closed_at ni el
  // alias `expected` existen ahí para que HAVING los referencie. Se mueve
  // el filtro a WHERE, con "esperado" calculado inline (la misma fórmula
  // del alias `expected` de abajo, pero sin depender de ningún alias) —
  // así funciona igual en la query de filas y en la de conteo, sin
  // importar qué columnas seleccione cada una. mv.total_in/total_out ya
  // están disponibles aquí porque ese LEFT JOIN vive en baseFrom, antes de
  // este WHERE.
  //
  // Se mantiene SEPARADO de whereSql (no se agrega al arreglo `where`)
  // porque el resumen (`summary`, más abajo) usa `${baseFrom}` sin este
  // filtro a propósito — muestra los KPIs del rango completo, no solo de
  // las sesiones con diferencia, aun cuando onlyWithDifference esté activo
  // en las filas/paginación.
  const differenceFilterSql = onlyWithDifference
    // Solo aplica a sesiones YA cerradas — una sesión abierta no tiene
    // close_amount todavía, así que no tiene "diferencia" que mostrar (se
    // excluye del filtro con closed_at IS NOT NULL, no se fuerza a 0).
    ? ` AND s.closed_at IS NOT NULL AND ABS(s.close_amount - (COALESCE(mv.total_in, 0) - COALESCE(mv.total_out, 0) + s.open_amount)) > 0.01`
    : '';

  const selectCols = `
     s.session_id, s.opened_at, s.closed_at, s.open_amount, s.close_amount,
     cr.cash_register_id, cr.name AS register_name,
     b.branch_id, b.name AS branch_name,
     u.user_id AS opened_by_id, u.first_name AS opened_by_name, u.last_name AS opened_by_last_name,
     COALESCE(mv.total_in, 0) - COALESCE(mv.total_out, 0) + s.open_amount AS expected,
     COALESCE(pe.total_sold, 0) AS total_sold
  `;

  const offset = (Math.max(1, page) - 1) * limit;

  const [rows] = await db.query(
    `SELECT ${selectCols} ${baseFrom}${differenceFilterSql}
     ORDER BY (s.closed_at IS NULL) DESC, s.closed_at DESC, s.opened_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ totalCount }]] = await db.query(
    `SELECT COUNT(*) AS totalCount FROM (
       SELECT s.session_id ${baseFrom}${differenceFilterSql}
     ) t`,
    params
  );

  // Resumen para las tarjetas KPI de la tab — mismo filtro, sin paginar.
  const [[summary]] = await db.query(
    `SELECT
       COUNT(*)                                                     AS session_count,
       COALESCE(SUM(pe.total_sold), 0)                               AS total_sold,
       SUM(CASE WHEN s.closed_at IS NULL THEN 1 ELSE 0 END)          AS open_count,
       SUM(CASE WHEN s.closed_at IS NOT NULL
                 AND ABS(s.close_amount - (COALESCE(mv.total_in,0) - COALESCE(mv.total_out,0) + s.open_amount)) > 0.01
                THEN 1 ELSE 0 END)                                   AS with_difference_count
     ${baseFrom}`,
    params
  );

  const sessions = rows.map(r => ({
    sessionId:     r.session_id,
    branchId:      r.branch_id,
    branchName:    r.branch_name,
    cashRegisterId: r.cash_register_id,
    registerName:  r.register_name,
    openedBy:      `${r.opened_by_name} ${r.opened_by_last_name ?? ''}`.trim(),
    openedById:    r.opened_by_id,
    openedAt:      r.opened_at,
    closedAt:      r.closed_at,
    isOpen:        r.closed_at === null,
    openAmount:    +Number(r.open_amount).toFixed(2),
    expected:      +Number(r.expected).toFixed(2),
    closeAmount:   r.close_amount === null ? null : +Number(r.close_amount).toFixed(2),
    difference:    r.close_amount === null ? null : +Number(r.close_amount - r.expected).toFixed(2),
    totalSold:     +Number(r.total_sold).toFixed(2),
  }));

  return {
    data: sessions,
    pagination: {
      page:  Math.max(1, page),
      limit,
      total: Number(totalCount),
      totalPages: Math.max(1, Math.ceil(Number(totalCount) / limit)),
    },
    summary: {
      sessionCount:        Number(summary.session_count),
      openCount:            Number(summary.open_count),
      withDifferenceCount:  Number(summary.with_difference_count),
      totalSold:            +Number(summary.total_sold).toFixed(2),
    },
  };
};

// ─── Sesión de caja — detalle ──────────────────────────────────────────────

// Clona lo que cashRegisterService.closeRegister arma al momento de cerrar,
// pero de solo lectura y para CUALQUIER sesión (abierta o cerrada) — no
// solo la que se está cerrando ahora mismo.
//
// [DIFERENCIA IMPORTANTE con closeRegister] productsSold/stats ahí filtran
// solo por `cash_register_id + created_at >= opened_at`, sin límite
// superior, porque en vivo no puede existir todavía una orden posterior (la
// sesión sigue abierta). Aquí SÍ hace falta acotar también por
// `< closed_at` (o NOW() si sigue abierta) — si no, una sesión histórica se
// robaría órdenes de sesiones posteriores de la misma caja.
const getCashSessionDetail = async ({ sessionId, branchId = null }) => {
  const sessionParams = [sessionId];
  let branchFilter = '';
  if (branchId !== null) { branchFilter = 'AND b.branch_id = ?'; sessionParams.push(branchId); }

  const [sessions] = await db.query(
    `SELECT s.*, u.first_name, u.last_name,
            cr.cash_register_id, cr.name AS register_name,
            b.branch_id, b.name AS branch_name
     FROM cash_register_sessions s
     JOIN cash_registers cr ON s.cash_register_id = cr.cash_register_id
     JOIN branches b        ON cr.branch_id        = b.branch_id
     JOIN users u           ON s.user_id            = u.user_id
     WHERE s.session_id = ? ${branchFilter}`,
    sessionParams
  );
  if (sessions.length === 0) throw new NotFoundError('Sesión no encontrada');
  const session = sessions[0];

  const windowEnd = session.closed_at ?? new Date();

  // Movimientos — ya están ligados a session_id exacto, sin necesidad de
  // acotar por fecha.
  const [movements] = await db.query(
    `SELECT cm.movement_type, cm.amount, cm.description, cm.created_at,
            u.first_name AS user_name
     FROM cash_movements cm
     JOIN users u ON cm.user_id = u.user_id
     WHERE cm.session_id = ?
     ORDER BY cm.cash_movement_id ASC`,
    [session.session_id]
  );

  const totals = sumCashMovements(movements);
  const expected = +(Number(session.open_amount) + totals.total_in - totals.total_out).toFixed(2);
  const difference = session.close_amount === null ? null : +(session.close_amount - expected).toFixed(2);

  // Desglose por método de pago — payment_events también está ligado a
  // session_id exacto (cubre venta normal, apartado y crédito por igual).
  const [methodRows] = await db.query(
    `SELECT pm.payment_method_id, pm.code, pm.name,
            COALESCE(SUM(pe.amount), 0) AS total
     FROM payment_methods pm
     LEFT JOIN payment_events pe
       ON pe.payment_method_id = pm.payment_method_id
       AND pe.session_id = ?
     WHERE pm.is_active = 1
     GROUP BY pm.payment_method_id, pm.code, pm.name
     ORDER BY pm.name ASC`,
    [session.session_id]
  );
  const paymentBreakdown = methodRows.map(m => ({
    payment_method_id: m.payment_method_id,
    code:               m.code,
    name:               m.name,
    total:              +Number(m.total).toFixed(2),
  }));

  // Productos vendidos — orders no tiene session_id, así que se acota por
  // caja + ventana de tiempo [opened_at, closed_at u ahora).
  const [productsSold] = await db.query(
    `SELECT
       od.product_id, od.variant_id,
       p.name  AS product_name,
       pv.label AS variant_label,
       SUM(od.quantity) AS total_sold,
       COALESCE(s.quantity, 0) AS remaining_stock
     FROM order_details od
     JOIN orders o   ON od.order_id   = o.order_id
     JOIN products p ON od.product_id = p.product_id
     LEFT JOIN product_variants pv ON od.variant_id = pv.variant_id
     LEFT JOIN inventory_stock s
       ON s.branch_id  = o.branch_id
       AND s.product_id = od.product_id
       AND s.variant_id <=> od.variant_id
     WHERE o.cash_register_id = ? AND o.status = 'completed'
       AND o.created_at >= ? AND o.created_at < ?
     GROUP BY od.product_id, od.variant_id, p.name, pv.label, s.quantity
     ORDER BY total_sold DESC`,
    [session.cash_register_id, session.opened_at, windowEnd]
  );

  const [[salesStats]] = await db.query(
    `SELECT COUNT(*) AS total_orders,
            COALESCE(SUM(total), 0) AS total_sales,
            COALESCE(SUM(discount), 0) AS total_discounts
     FROM orders
     WHERE cash_register_id = ? AND status = 'completed'
       AND created_at >= ? AND created_at < ?`,
    [session.cash_register_id, session.opened_at, windowEnd]
  );
  const [[cancelledStats]] = await db.query(
    `SELECT COUNT(*) AS cancelled_count
     FROM orders
     WHERE cash_register_id = ? AND status = 'cancelled'
       AND created_at >= ? AND created_at < ?`,
    [session.cash_register_id, session.opened_at, windowEnd]
  );

  const totalOrders = Number(salesStats.total_orders);

  return {
    sessionId:     session.session_id,
    branchId:      session.branch_id,
    branchName:    session.branch_name,
    cashRegisterId: session.cash_register_id,
    registerName:  session.register_name,
    cashierName:   `${session.first_name} ${session.last_name ?? ''}`.trim(),
    openedAt:      session.opened_at,
    closedAt:      session.closed_at,
    isOpen:        session.closed_at === null,
    openAmount:    +Number(session.open_amount).toFixed(2),
    expected,
    closeAmount:   session.close_amount === null ? null : +Number(session.close_amount).toFixed(2),
    difference,
    movements,
    paymentBreakdown,
    productsSold,
    stats: {
      totalOrders,
      totalSales:     +Number(salesStats.total_sales).toFixed(2),
      totalDiscounts: +Number(salesStats.total_discounts).toFixed(2),
      avgTicket:      totalOrders > 0 ? +(salesStats.total_sales / totalOrders).toFixed(2) : 0,
      cancelledCount: Number(cancelledStats.cancelled_count),
      topProduct:     productsSold[0]
        ? `${productsSold[0].product_name}${productsSold[0].variant_label ? ' - ' + productsSold[0].variant_label : ''}`
        : null,
    },
  };
};

// ─── Ventas y utilidad ─────────────────────────────────────────────────────

// Utilidad bruta de lo vendido en un rango, agrupada por producto,
// categoría, sucursal o proveedor (specs/04-reporte-ventas-y-utilidad.md).
// Por cada línea de venta:
//   venta neta = fórmula compartida de helpers/soldLines.js (la misma de
//                Ventas → Productos vendidos)
//   costo      = unidades netas × od.purchase_price (lo devuelto regresó al
//                inventario, así que no cuenta como costo)
//   utilidad   = venta neta − costo
//   margen     = utilidad ÷ venta neta × 100; null si la venta neta es 0
// Una línea con od.purchase_price = 0 es "sin costo" (spec 03): se cuenta y
// se marca, o se excluye de todo con excludeNoCost.
//
// Con includeNet (specs/13-reporte-de-gastos-y-utilidad-neta.md, requisitos
// 10–15 y 20), el resumen agrega `net`: los gastos que cuentan en la utilidad
// neta, la utilidad neta y el margen neto. Al agrupar por sucursal, cada fila
// agrega sus gastos y su utilidad neta, y entran también las sucursales con
// gastos y sin ventas. El controller decide includeNet: pide reports.expenses
// y que no haya filtro de categoría de producto.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Cada agrupación: la columna de la línea que la define y cómo sacar el
// nombre del grupo a partir de esa llave (alias g, sobre la fila agregada t).
const PROFIT_GROUPS = {
  product: {
    key:  'od.product_id',
    join: 'JOIN products g ON g.product_id = t.group_id',
    cols: 'g.name AS name, g.sku AS sku, g.uom AS uom',
  },
  category: {
    key:  'p.category_id',
    join: 'LEFT JOIN categories g ON g.category_id = t.group_id',
    cols: "COALESCE(g.name, 'Sin categoría') AS name",
  },
  branch: {
    key:  'o.branch_id',
    join: 'JOIN branches g ON g.branch_id = t.group_id',
    cols: 'g.name AS name',
  },
  provider: {
    key:  'p.provider_id',
    join: 'JOIN providers g ON g.provider_id = t.group_id',
    cols: 'g.name AS name',
  },
};

const PROFIT_SORTS = { net_sales: 'net_sales', profit: 'profit', margin: 'margin' };

const isPositiveInt = (value) => Number.isInteger(value) && value > 0;
const round2 = (value) => +Number(value).toFixed(2);

// branchId = null → consolidado (admin central). Un usuario con sucursal
// asignada llega aquí con la suya ya forzada por el controller.
const getProfitReport = async ({
  startDate,
  endDate,
  branchId = null,
  categoryId = null,
  groupBy = 'product',
  sortBy = 'profit',
  sortDir = 'desc',
  excludeNoCost = false,
  includeNet = false,
  page = 1,
  limit = 20,
}) => {
  if (!DATE_RE.test(startDate ?? '') || !DATE_RE.test(endDate ?? '')) {
    throw new ValidationError('start_date y end_date son requeridos, formato YYYY-MM-DD');
  }
  if (startDate > endDate) throw new ValidationError('start_date no puede ser posterior a end_date');
  if (branchId !== null && !isPositiveInt(branchId)) throw new ValidationError('branch_id inválido');
  if (categoryId !== null && !isPositiveInt(categoryId)) throw new ValidationError('category_id inválido');

  const group = PROFIT_GROUPS[groupBy];
  if (!group) throw new ValidationError('group_by debe ser product, category, branch o provider');
  const sortColumn = PROFIT_SORTS[sortBy];
  if (!sortColumn) throw new ValidationError('sort_by debe ser net_sales, profit o margin');
  if (sortDir !== 'asc' && sortDir !== 'desc') throw new ValidationError('sort_dir debe ser asc o desc');

  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safePage  = Math.max(parseInt(page) || 1, 1);

  const where  = [SOLD_STATUSES_SQL, 'o.created_at BETWEEN ? AND ?'];
  const params = await toServerRange(startDate, endDate);
  if (branchId !== null)   { where.push('o.branch_id = ?');   params.push(branchId); }
  if (categoryId !== null) { where.push('p.category_id = ?'); params.push(categoryId); }
  if (excludeNoCost)       { where.push('od.purchase_price > 0'); }

  // Una fila por línea de venta, con sus valores ya netos. Las tres
  // consultas de abajo agregan sobre esto mismo.
  const linesSql = `
    SELECT ${group.key} AS group_id,
           od.product_id,
           od.purchase_price,
           ${NET_QUANTITY_SQL} AS net_qty,
           ${NET_SALE_SQL} AS net_sale,
           (${NET_QUANTITY_SQL}) * od.purchase_price AS cost
      FROM order_details od
      JOIN orders o   ON o.order_id   = od.order_id
      JOIN products p ON p.product_id = od.product_id
      ${RETURNS_JOIN_SQL}
     WHERE ${where.join(' AND ')}
  `;

  const totalsCols = `
    COALESCE(SUM(l.net_sale), 0)                    AS net_sales,
    COALESCE(SUM(l.cost), 0)                        AS cost,
    COALESCE(SUM(l.net_sale) - SUM(l.cost), 0)      AS profit,
    CASE WHEN ROUND(SUM(l.net_sale), 2) = 0 THEN NULL
         ELSE (SUM(l.net_sale) - SUM(l.cost)) / SUM(l.net_sale) * 100 END AS margin,
    COALESCE(SUM(l.purchase_price = 0), 0)          AS no_cost_lines,
    COALESCE(SUM(CASE WHEN l.purchase_price = 0 THEN l.net_sale ELSE 0 END), 0) AS no_cost_net_sales
  `;

  // Sin margen ("—") siempre al final, en cualquier dirección; group_id
  // desempata para que la paginación sea estable.
  const rowsSql = `
    SELECT t.*, ${group.cols}
       FROM (
         SELECT l.group_id,
                ${totalsCols},
                SUM(l.net_qty)               AS units,
                COUNT(DISTINCT l.product_id) AS product_count
           FROM (${linesSql}) l
          GROUP BY l.group_id
       ) t
       ${group.join}
      ORDER BY (t.${sortColumn} IS NULL), t.${sortColumn} ${sortDir.toUpperCase()}, t.group_id`;

  // Por sucursal con utilidad neta, las filas se completan en JS con las
  // sucursales que solo tienen gastos; son pocas, así que se traen todas y se
  // pagina después
  const netByBranch = includeNet && groupBy === 'branch';
  const [rows] = await db.query(
    netByBranch ? rowsSql : `${rowsSql} LIMIT ? OFFSET ?`,
    netByBranch ? params : [...params, safeLimit, (safePage - 1) * safeLimit]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM (
       SELECT l.group_id FROM (${linesSql}) l GROUP BY l.group_id
     ) t`,
    params
  );

  // KPIs sobre todo el resultado del filtro, no solo la página
  const [[summary]] = await db.query(
    `SELECT ${totalsCols} FROM (${linesSql}) l`,
    params
  );

  const toAmounts = (r) => ({
    netSales: round2(r.net_sales),
    cost:     round2(r.cost),
    profit:   round2(r.profit),
    margin:   r.margin === null ? null : round2(r.margin),
    noCost: {
      lines:    Number(r.no_cost_lines),
      netSales: round2(r.no_cost_net_sales),
    },
  });

  let data = rows.map(r => ({
    groupId: r.group_id,
    name:    r.name,
    ...(groupBy === 'product'
      ? { sku: r.sku, units: +Number(r.units).toFixed(3), uom: r.uom }
      : { productCount: Number(r.product_count) }),
    ...toAmounts(r),
  }));
  let groupCount = Number(total);

  const result = { summary: toAmounts(summary) };

  if (includeNet) {
    const expensesByBranch = await netProfitExpensesByBranch({ startDate, endDate, branchId });
    const expenses = round2([...expensesByBranch.values()].reduce((sum, value) => sum + value, 0));
    result.summary.net = {
      ...netOf(result.summary, expenses),
      firstExpenseDate: await getFirstExpenseDate(branchId),
    };

    if (netByBranch) {
      // Sucursales con gastos y sin ventas: venta, costo y utilidad en 0
      const missing = [...expensesByBranch.keys()].filter(id => !data.some(r => r.groupId === id));
      if (missing.length > 0) {
        const [branches] = await db.query('SELECT branch_id, name FROM branches WHERE branch_id IN (?)', [missing]);
        data.push(...branches.map(b => ({
          groupId: b.branch_id, name: b.name, productCount: 0,
          netSales: 0, cost: 0, profit: 0, margin: null, noCost: { lines: 0, netSales: 0 },
        })));
      }
      data = data
        .map(r => {
          const { expenses: branchExpenses, netProfit } = netOf(r, expensesByBranch.get(r.groupId) ?? 0);
          return { ...r, net: { expenses: branchExpenses, netProfit } };
        })
        .sort(compareProfitRows(sortColumn, sortDir));
      groupCount = data.length;
      data = data.slice((safePage - 1) * safeLimit, safePage * safeLimit);
    }
  }

  return {
    data,
    pagination: {
      page:  safePage,
      limit: safeLimit,
      total: groupCount,
      totalPages: Math.max(1, Math.ceil(groupCount / safeLimit)),
    },
    ...result,
  };
};

// Gastos, utilidad neta y margen neto de un resumen o una fila ya en pesos
const netOf = ({ netSales, profit }, expenses) => {
  const netProfit = round2(profit - expenses);
  return {
    expenses:  round2(expenses),
    netProfit,
    netMargin: round2(netSales) === 0 ? null : round2(netProfit / netSales * 100),
  };
};

// El mismo orden que el ORDER BY de las filas: sin valor al final en
// cualquier dirección y group_id para desempatar
const PROFIT_ROW_FIELDS = { net_sales: 'netSales', profit: 'profit', margin: 'margin' };
const compareProfitRows = (sortColumn, sortDir) => (a, b) => {
  const field = PROFIT_ROW_FIELDS[sortColumn];
  const va = a[field];
  const vb = b[field];
  if (va === null && vb !== null) return 1;
  if (vb === null && va !== null) return -1;
  if (va !== vb) return sortDir === 'asc' ? va - vb : vb - va;
  return a.groupId - b.groupId;
};

// ─── Tendencia de ventas ───────────────────────────────────────────────────

// Monto, número de ventas, utilidad y ticket por día, semana o mes, con
// comparación contra el año anterior o por sucursal
// (specs/05-tendencia-de-ventas.md). Monto y ventas usan el ingreso neto del
// Dashboard (helpers/orderNet.js); la utilidad, la venta neta menos el costo
// por línea de Ventas y utilidad (helpers/soldLines.js).

const TREND_COMPARES = ['none', 'previous_year', 'branch'];
const GRANULARITY_LABELS = { day: 'Por día', week: 'Por semana', month: 'Por mes' };

// Periodo de cada venta, en hora de México: el día, el lunes de su semana o
// el día 1 de su mes
const MX_DAY_SQL = `DATE(${createdAtMx('o.created_at')})`;
const TREND_BUCKETS = {
  day:   `DATE_FORMAT(${MX_DAY_SQL}, '%Y-%m-%d')`,
  week:  `DATE_FORMAT(DATE_SUB(${MX_DAY_SQL}, INTERVAL WEEKDAY(${MX_DAY_SQL}) DAY), '%Y-%m-%d')`,
  month: `DATE_FORMAT(${MX_DAY_SQL}, '%Y-%m-01')`,
};

const EMPTY_TOTALS = { netSales: 0, orders: 0, profit: 0, noCostLines: 0, noCostNetSales: 0 };
const NO_VALUES    = { netSales: null, orders: null, profit: null, avgTicket: null };

const trendKey = (branchId, period) => `${branchId ?? ''}|${period}`;

// Totales entre dos fechas de México, agrupados por periodo (granularity) y,
// con byBranch, también por sucursal. Sin granularity, un solo grupo 'all'.
// Devuelve Map(trendKey → totales).
const queryTrendTotals = async ({ from, to, granularity = null, branchId = null, byBranch = false }) => {
  const bucket    = granularity ? TREND_BUCKETS[granularity] : "'all'";
  const branchCol = byBranch ? 'o.branch_id' : 'NULL';
  const where  = [SOLD_STATUSES_SQL, 'o.created_at BETWEEN ? AND ?'];
  const params = await toServerRange(from, to);
  if (branchId !== null) { where.push('o.branch_id = ?'); params.push(branchId); }
  const whereSql = where.join(' AND ');

  // Alias que no chocan con columnas: en GROUP BY, MySQL busca primero en las
  // columnas de las tablas, así que "branch_id" agruparía por o.branch_id
  // aunque el SELECT lo defina como NULL
  const [orderRows] = await db.query(
    `SELECT ${bucket} AS trend_period, ${branchCol} AS trend_branch,
            COUNT(*) AS orders,
            SUM(${ORDER_NET_SALE_SQL}) AS net_sales
       FROM orders o
       ${ORDER_REFUNDS_JOIN_SQL}
      WHERE ${whereSql}
      GROUP BY trend_period, trend_branch`,
    params
  );
  const [lineRows] = await db.query(
    `SELECT ${bucket} AS trend_period, ${branchCol} AS trend_branch,
            SUM(${NET_SALE_SQL}) - SUM((${NET_QUANTITY_SQL}) * od.purchase_price) AS profit,
            SUM(od.purchase_price = 0) AS no_cost_lines,
            SUM(CASE WHEN od.purchase_price = 0 THEN ${NET_SALE_SQL} ELSE 0 END) AS no_cost_net_sales
       FROM order_details od
       JOIN orders o ON o.order_id = od.order_id
       ${RETURNS_JOIN_SQL}
      WHERE ${whereSql}
      GROUP BY trend_period, trend_branch`,
    params
  );

  const totals = new Map();
  const entry  = (r) => {
    const key = trendKey(r.trend_branch, r.trend_period);
    if (!totals.has(key)) totals.set(key, { ...EMPTY_TOTALS });
    return totals.get(key);
  };
  for (const r of orderRows) {
    Object.assign(entry(r), { orders: Number(r.orders), netSales: Number(r.net_sales) });
  }
  for (const r of lineRows) {
    Object.assign(entry(r), {
      profit:         Number(r.profit),
      noCostLines:    Number(r.no_cost_lines),
      noCostNetSales: Number(r.no_cost_net_sales),
    });
  }
  return totals;
};

const sumTotals = (list) => list.reduce((acc, t) => ({
  netSales:       acc.netSales + t.netSales,
  orders:         acc.orders + t.orders,
  profit:         acc.profit + t.profit,
  noCostLines:    acc.noCostLines + t.noCostLines,
  noCostNetSales: acc.noCostNetSales + t.noCostNetSales,
}), { ...EMPTY_TOTALS });

// Ticket sin ventas: sin valor (no existe un ticket de $0)
const toMetrics = (t) => ({
  netSales:  round2(t.netSales),
  orders:    t.orders,
  profit:    round2(t.profit),
  avgTicket: t.orders > 0 ? round2(t.netSales / t.orders) : null,
});

// Periodos con sus métricas; los futuros van sin valor
const buildSeries = (periodList, totals, branchId = null) => periodList.map(p => ({
  ...p,
  ...(p.future ? NO_VALUES : toMetrics(totals.get(trendKey(branchId, p.start)) ?? EMPTY_TOTALS)),
}));

// Promedio por periodo sobre los periodos que ya empezaron
const averagesOf = (metrics, elapsedCount) => (elapsedCount === 0 ? null : {
  netSales: round2(metrics.netSales / elapsedCount),
  orders:   round2(metrics.orders / elapsedCount),
  profit:   round2(metrics.profit / elapsedCount),
});

// Mejor periodo de cada métrica entre los que ya empezaron; un empate se
// queda con el más antiguo. Sin ventas no hay mejor periodo. Con el año
// anterior, previousValue es el del mismo periodo un año antes.
const bestPeriods = (series, previousSeries) => {
  const elapsed  = series.map((p, index) => ({ p, index })).filter(({ p }) => !p.future);
  const hasSales = elapsed.some(({ p }) => p.orders > 0);

  const best = (metric) => {
    const candidates = elapsed.filter(({ p }) => p[metric] !== null);
    if (!hasSales || candidates.length === 0) return null;
    const top = candidates.reduce((a, b) => (b.p[metric] > a.p[metric] ? b : a));
    return {
      index: top.index,
      start: top.p.start,
      value: top.p[metric],
      ...(previousSeries && { previousValue: previousSeries[top.index][metric] }),
    };
  };

  return { netSales: best('netSales'), orders: best('orders'), profit: best('profit'), avgTicket: best('avgTicket') };
};

// today: fecha de hoy en México, 'YYYY-MM-DD'. branchId = null → consolidado
// (admin central); un usuario con sucursal llega con la suya ya forzada.
const getTrendReport = async ({
  startDate,
  endDate,
  granularity = null,
  compare = 'none',
  branchId = null,
  today,
}) => {
  if (!periods.isValidDate(startDate) || !periods.isValidDate(endDate)) {
    throw new ValidationError('start_date y end_date son requeridos, formato YYYY-MM-DD');
  }
  if (startDate > endDate) throw new ValidationError('start_date no puede ser posterior a end_date');
  if (branchId !== null && !isPositiveInt(branchId)) throw new ValidationError('branch_id inválido');

  const days = periods.rangeDays(startDate, endDate);
  if (days > periods.MAX_RANGE_DAYS) {
    throw new ValidationError(`El rango máximo es de 5 años (${periods.MAX_RANGE_DAYS} días)`);
  }
  const gran = granularity ?? periods.autoGranularity(days);
  if (!periods.GRANULARITIES.includes(gran)) throw new ValidationError('granularity debe ser day, week o month');
  if (!periods.fitsGranularity(gran, days)) {
    throw new ValidationError(`${GRANULARITY_LABELS[gran]}: el rango puede tener hasta ${periods.GRANULARITY_LIMITS[gran]} días`);
  }
  if (!TREND_COMPARES.includes(compare)) throw new ValidationError('compare debe ser none, previous_year o branch');
  if (compare === 'branch' && branchId !== null) {
    throw new ValidationError('La comparación por sucursal solo está disponible en el consolidado del administrador central');
  }

  const periodList = periods.buildPeriods(startDate, endDate, gran, today);
  const totals     = await queryTrendTotals({ from: startDate, to: endDate, granularity: gran, branchId });
  const series     = buildSeries(periodList, totals);

  // "A la fecha": los periodos que ya empezaron (en el futuro no hay ventas)
  const elapsedCount  = periodList.filter(p => !p.future).length;
  const toDate        = sumTotals(periodList.filter(p => !p.future).map(p => totals.get(trendKey(null, p.start)) ?? EMPTY_TOTALS));
  const toDateMetrics = toMetrics(toDate);

  // ── Año anterior: los mismos periodos, alineados, y sus KPIs a la fecha ──
  let previousYear    = null;
  let previousSummary = null;
  if (compare === 'previous_year') {
    const prev       = periods.previousYearRange(startDate, endDate, gran);
    const prevTotals = await queryTrendTotals({ from: prev.start, to: prev.end, granularity: gran, branchId });
    previousYear = {
      startDate: prev.start,
      endDate:   prev.end,
      periods:   buildSeries(periods.buildPeriods(prev.start, prev.end, gran, today), prevTotals),
    };

    const prevToday  = periods.previousYearDate(today, gran);
    const prevTo     = prev.end < prevToday ? prev.end : prevToday;
    const prevToDate = prev.start > prevTo
      ? EMPTY_TOTALS
      : (await queryTrendTotals({ from: prev.start, to: prevTo, branchId })).get(trendKey(null, 'all')) ?? EMPTY_TOTALS;
    const prevMetrics = toMetrics(prevToDate);
    previousSummary = {
      from:     prev.start,
      to:       prevTo,
      totals:   prevMetrics,
      averages: averagesOf(prevMetrics, elapsedCount),
    };
  }

  // ── Por sucursal: una serie por sucursal con ventas en el rango ──
  let branches = null;
  if (compare === 'branch') {
    const byBranch = await queryTrendTotals({ from: startDate, to: endDate, granularity: gran, byBranch: true });
    const ids = [...new Set([...byBranch.keys()].map(key => Number(key.split('|')[0])))];
    const [rows] = ids.length === 0
      ? [[]]
      : await db.query('SELECT branch_id, name FROM branches WHERE branch_id IN (?) ORDER BY name', [ids]);
    branches = rows.map(b => ({
      branchId: b.branch_id,
      name:     b.name,
      periods:  buildSeries(periodList, byBranch, b.branch_id),
    }));
  }

  return {
    granularity: gran,
    startDate,
    endDate,
    today,
    periods: series,
    previousYear,
    branches,
    summary: {
      elapsedPeriods: elapsedCount,
      totals:   toDateMetrics,
      averages: averagesOf(toDateMetrics, elapsedCount),
      best:     bestPeriods(series, previousYear?.periods ?? null),
    },
    previousSummary,
    noCost: { lines: toDate.noCostLines, netSales: round2(toDate.noCostNetSales) },
  };
};

// ─── Valuación de inventario ───────────────────────────────────────────────

// Existencias del momento valoradas al costo y al precio de venta del
// producto (specs/07-valuacion-de-inventario.md). Un artículo es un producto
// simple o una variante; las variantes usan el costo y el precio de su
// producto.
//   disponible = stock > 0 de artículos activos, con las reglas de
//                inventoryService.getStockByBranch. A diferencia de
//                Inventario, las categorías ocultas para la sucursal sí
//                cuentan: es mercancía que está ahí.
//   apartado   = líneas de apartados activos; su stock ya se descontó al
//                apartar. Se valoran con el costo y el precio de hoy, no con
//                los del apartado.
//   total      = disponible + apartado
// Un artículo con purchase_price = 0 es "sin costo" (spec 06): cuenta y se
// avisa, o sale de todo con excludeNoCost, menos de las alertas.

// De dónde salen los artículos. Alias: i = la fila con la cantidad,
// p = producto, v = variante.
const INVENTORY_SOURCES = {
  stock: {
    branchCol: 'i.branch_id',
    from: `inventory_stock i
      JOIN products p              ON p.product_id = i.product_id
      LEFT JOIN product_variants v ON v.variant_id = i.variant_id`,
    // En un producto variable cuentan las filas de sus variantes; en uno
    // simple, la fila sin variante. Inventario trata is_variable NULL como simple.
    where: [
      'i.quantity > 0',
      `((p.is_variable = 1 AND i.variant_id IS NOT NULL)
        OR (NOT (p.is_variable <=> 1) AND i.variant_id IS NULL))`,
    ],
  },
  reserved: {
    branchCol: 'l.branch_id',
    from: `layaway_details i
      JOIN layaways l              ON l.layaway_id = i.layaway_id
      JOIN products p              ON p.product_id = i.product_id
      LEFT JOIN product_variants v ON v.variant_id = i.variant_id`,
    where: ["l.status = 'active'", 'i.quantity > 0'],
  },
};

const ACTIVE_ITEM_SQL = '(p.is_active = 1 AND (i.variant_id IS NULL OR v.is_active = 1))';

// Lo que cuenta cada tarjeta de alerta; su vista en la tabla muestra lo mismo
const INVENTORY_ALERTS = {
  no_cost:    `${ACTIVE_ITEM_SQL} AND p.purchase_price = 0`,
  below_cost: `${ACTIVE_ITEM_SQL} AND p.sale_price < p.purchase_price`,
  inactive:   `NOT ${ACTIVE_ITEM_SQL}`,
};

// Cada agrupación: la columna del artículo que la define y cómo sacar el
// nombre del grupo (alias g, sobre la fila agregada r).
const INVENTORY_GROUPS = {
  product: {
    key:  't.product_id',
    join: 'JOIN products g ON g.product_id = r.group_id',
    cols: 'g.name AS name, g.sku AS sku, g.uom AS uom',
  },
  category: {
    key:  't.category_id',
    join: 'LEFT JOIN categories g ON g.category_id = r.group_id',
    cols: "COALESCE(g.name, 'Sin categoría') AS name",
  },
  provider: {
    key:  't.provider_id',
    join: 'JOIN providers g ON g.provider_id = r.group_id',
    cols: 'g.name AS name',
  },
  branch: {
    key:  't.branch_id',
    join: 'JOIN branches g ON g.branch_id = r.group_id',
    cols: 'g.name AS name',
  },
};

const INVENTORY_SORTS = ['cost_value', 'sale_value', 'profit', 'margin'];

// Un artículo es el par producto-variante
const ITEM_KEY_SQL = "CONCAT(t.product_id, ':', IFNULL(t.variant_id, 0))";

const ITEM_AMOUNTS_SQL = `
  COUNT(DISTINCT ${ITEM_KEY_SQL})                 AS items,
  COALESCE(SUM(t.quantity * t.purchase_price), 0) AS cost_value,
  COALESCE(SUM(t.quantity * t.sale_price), 0)     AS sale_value,
  COUNT(DISTINCT CASE WHEN t.purchase_price = 0 THEN ${ITEM_KEY_SQL} END) AS no_cost_items,
  COALESCE(SUM(CASE WHEN t.purchase_price = 0 THEN t.quantity * t.sale_price ELSE 0 END), 0) AS no_cost_sale_value
`;

const round3 = (value) => +Number(value).toFixed(3);

const marginOf = (costValue, saleValue) =>
  (round2(saleValue) === 0 ? null : round2((saleValue - costValue) / saleValue * 100));

// "3,4" → [3, 4]; null si algún id no es un entero positivo
const parseIdList = (value) => {
  const parts = String(value ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (parts.some(s => !/^\d+$/.test(s) || Number(s) === 0)) return null;
  return [...new Set(parts.map(Number))];
};

// Artículos de una fuente con los filtros del reporte y las condiciones
// extra. Devuelve una consulta que se usa como tabla derivada.
const inventoryItemsQuery = (source, filters, conditions) => {
  const { branchCol, from, where: baseWhere } = INVENTORY_SOURCES[source];
  const where  = [...baseWhere, ...conditions];
  const params = [];

  if (filters.branchId !== null)   { where.push(`${branchCol} = ?`);  params.push(filters.branchId); }
  if (filters.categoryId !== null) { where.push('p.category_id = ?'); params.push(filters.categoryId); }
  if (filters.providerId !== null) { where.push('p.provider_id = ?'); params.push(filters.providerId); }
  if (filters.excludeCategoryIds.length > 0) {
    where.push('(p.category_id IS NULL OR p.category_id NOT IN (?))');
    params.push(filters.excludeCategoryIds);
  }
  // Igual que Inventario: si coincide, cuenta el producto con sus variantes
  if (filters.search) {
    const like = `%${filters.search}%`;
    where.push(`(p.name LIKE ? OR p.sku LIKE ? OR EXISTS (
      SELECT 1 FROM product_variants sv
       WHERE sv.product_id = p.product_id AND sv.is_active = 1 AND sv.sku LIKE ?
    ))`);
    params.push(like, like, like);
  }

  return {
    sql: `SELECT ${branchCol} AS branch_id, i.product_id, i.variant_id, i.quantity,
                 p.purchase_price, p.sale_price, p.category_id, p.provider_id, p.uom
            FROM ${from}
           WHERE ${where.join(' AND ')}`,
    params,
  };
};

const unionItems = (...queries) => ({
  sql:    queries.map(q => q.sql).join(' UNION ALL '),
  params: queries.flatMap(q => q.params),
});

// Artículos, unidades por unidad de medida, valores y margen de un conjunto
const aggregateItems = async ({ sql, params }) => {
  const [[[totals]], [units]] = await Promise.all([
    db.query(`SELECT ${ITEM_AMOUNTS_SQL} FROM (${sql}) t`, params),
    db.query(
      `SELECT NULLIF(TRIM(t.uom), '') AS uom, SUM(t.quantity) AS quantity
         FROM (${sql}) t
        GROUP BY NULLIF(TRIM(t.uom), '')
        ORDER BY quantity DESC, uom`,
      params
    ),
  ]);
  const costValue = Number(totals.cost_value);
  const saleValue = Number(totals.sale_value);
  return {
    items:     Number(totals.items),
    units:     units.map(u => ({ uom: u.uom, quantity: round3(u.quantity) })),
    costValue: round2(costValue),
    saleValue: round2(saleValue),
    profit:    round2(saleValue - costValue),
    margin:    marginOf(costValue, saleValue),
    noCost: {
      items:     Number(totals.no_cost_items),
      saleValue: round2(totals.no_cost_sale_value),
    },
  };
};

// branchId = null → consolidado (admin central). Un usuario con sucursal
// asignada llega aquí con la suya ya forzada por el controller; isCentral
// dice si es el admin central, el único que puede agrupar por sucursal.
const getInventoryReport = async ({
  branchId = null,
  isCentral = false,
  categoryId = null,
  providerId = null,
  search = '',
  excludeCategoryIds = '',
  excludeNoCost = false,
  groupBy = 'product',
  alert = null,
  sortBy = 'cost_value',
  sortDir = 'desc',
  page = 1,
  limit = 20,
}) => {
  if (branchId !== null && !isPositiveInt(branchId))     throw new ValidationError('branch_id inválido');
  if (categoryId !== null && !isPositiveInt(categoryId)) throw new ValidationError('category_id inválido');
  if (providerId !== null && !isPositiveInt(providerId)) throw new ValidationError('provider_id inválido');
  const excludedIds = parseIdList(excludeCategoryIds);
  if (excludedIds === null) throw new ValidationError('exclude_category_ids debe ser una lista de ids separados por coma');
  if (categoryId !== null && excludedIds.length > 0) {
    throw new ValidationError('Para excluir categorías hay que ver todas las categorías (sin category_id)');
  }

  const group = INVENTORY_GROUPS[groupBy];
  if (!group) throw new ValidationError('group_by debe ser product, category, provider o branch');
  if (groupBy === 'branch' && !isCentral) {
    throw new ValidationError('La agrupación por sucursal solo está disponible para el administrador central');
  }
  if (alert !== null && !INVENTORY_ALERTS[alert]) {
    throw new ValidationError('alert debe ser no_cost, below_cost o inactive');
  }
  if (alert !== null && groupBy !== 'product') throw new ValidationError('alert solo se puede usar con group_by=product');
  if (!INVENTORY_SORTS.includes(sortBy)) throw new ValidationError('sort_by debe ser cost_value, sale_value, profit o margin');
  if (sortDir !== 'asc' && sortDir !== 'desc') throw new ValidationError('sort_dir debe ser asc o desc');

  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safePage  = Math.max(parseInt(page) || 1, 1);

  const filters = {
    branchId, categoryId, providerId, excludeCategoryIds: excludedIds, search: String(search).trim(),
  };
  const counted   = excludeNoCost ? [ACTIVE_ITEM_SQL, 'p.purchase_price > 0'] : [ACTIVE_ITEM_SQL];
  const available = inventoryItemsQuery('stock', filters, counted);
  const reserved  = inventoryItemsQuery('reserved', filters, counted);
  const alertSets = Object.fromEntries(Object.entries(INVENTORY_ALERTS).map(
    ([key, condition]) => [key, inventoryItemsQuery('stock', filters, [condition])]
  ));
  const tableSet  = alert ? alertSets[alert] : available;

  // Sin margen ("—") siempre al final, en cualquier dirección; el nombre y
  // luego group_id desempatan para que la paginación sea estable.
  const rowsQuery = db.query(
    `SELECT r.*, ${group.cols}
       FROM (
         SELECT ${group.key} AS group_id,
                ${ITEM_AMOUNTS_SQL},
                SUM(t.quantity) AS units,
                COALESCE(SUM(t.quantity * t.sale_price) - SUM(t.quantity * t.purchase_price), 0) AS profit,
                CASE WHEN ROUND(SUM(t.quantity * t.sale_price), 2) = 0 THEN NULL
                     ELSE (SUM(t.quantity * t.sale_price) - SUM(t.quantity * t.purchase_price))
                          / SUM(t.quantity * t.sale_price) * 100 END AS margin
           FROM (${tableSet.sql}) t
          GROUP BY ${group.key}
       ) r
       ${group.join}
      ORDER BY (r.${sortBy} IS NULL), r.${sortBy} ${sortDir.toUpperCase()}, name, r.group_id
      LIMIT ? OFFSET ?`,
    [...tableSet.params, safeLimit, (safePage - 1) * safeLimit]
  );
  const countQuery = db.query(
    `SELECT COUNT(*) AS total FROM (
       SELECT ${group.key} FROM (${tableSet.sql}) t GROUP BY ${group.key}
     ) g`,
    tableSet.params
  );

  const [[rows], [[{ total }]], availableAgg, reservedAgg, totalAgg, noCostAgg, belowCostAgg, inactiveAgg] =
    await Promise.all([
      rowsQuery,
      countQuery,
      aggregateItems(available),
      aggregateItems(reserved),
      aggregateItems(unionItems(available, reserved)),
      aggregateItems(alertSets.no_cost),
      aggregateItems(alertSets.below_cost),
      aggregateItems(alertSets.inactive),
    ]);

  const withoutNoCost = ({ noCost, ...agg }) => agg;

  const data = rows.map(r => ({
    groupId: r.group_id,
    name:    r.name,
    ...(groupBy === 'product'
      ? { sku: r.sku, units: round3(r.units), uom: r.uom }
      : { items: Number(r.items) }),
    costValue:   round2(r.cost_value),
    saleValue:   round2(r.sale_value),
    profit:      round2(r.profit),
    margin:      r.margin === null ? null : round2(r.margin),
    noCostItems: Number(r.no_cost_items),
  }));

  return {
    data,
    pagination: {
      page:  safePage,
      limit: safeLimit,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / safeLimit)),
    },
    summary: {
      available: withoutNoCost(availableAgg),
      reserved:  withoutNoCost(reservedAgg),
      total:     withoutNoCost(totalAgg),
      noCost:    availableAgg.noCost,
      alerts: {
        noCost:    withoutNoCost(noCostAgg),
        belowCost: withoutNoCost(belowCostAgg),
        inactive:  withoutNoCost(inactiveAgg),
      },
    },
  };
};

// ─── Rotación de inventario ────────────────────────────────────────────────

// Productos con stock que llevan N días o más sin venderse en su sucursal,
// con sugerencias para moverlos (specs/10-rotacion-de-inventario.md). Cada
// fila es un producto en una sucursal, con sus variantes sumadas: las ventas
// anteriores a 2026-08-25 no guardan la variante.
//   última venta = orden no cancelada o apartado activo de la sucursal. Sale
//                  de orders y layaways, no de inventory_movements, que
//                  empieza el 2026-08-25.
//   nunca vendido = se cuenta desde el primer movimiento en la sucursal, o
//                  desde el alta del producto si no hay movimientos o el
//                  primero ya encontró existencias (stock cargado antes de
//                  que se registraran movimientos).
// El stock es el disponible de Valuación (INVENTORY_SOURCES.stock).

const ROTATION_DAYS  = [30, 60, 90, 180];
const ROTATION_SORTS = ['cost_value', 'days'];
const PROMOTION_SIZE = 3;

// Rebaja según días sin venta (decisión 5 de la spec); nunca baja del costo
const discountPercentFor = (days) => (days < 60 ? 10 : days < 90 ? 20 : 30);

// Ventas que cuentan para la última venta y el traspaso: órdenes no
// canceladas y apartados activos (decisión 6 de la spec). ref distingue una
// orden de un apartado para contarlos por separado. branchId limita a una
// sucursal; from (hora del servidor), a las ventas desde esa hora.
const rotationSalesQuery = ({ branchId = null, from = null } = {}) => {
  const half = (alias, baseWhere) => {
    const where  = [baseWhere];
    const params = [];
    if (branchId !== null) { where.push(`${alias}.branch_id = ?`);  params.push(branchId); }
    if (from !== null)     { where.push(`${alias}.created_at >= ?`); params.push(from); }
    return { where: where.join(' AND '), params };
  };
  const orders   = half('o', SOLD_STATUSES_SQL);
  const layaways = half('l', "l.status = 'active'");
  return {
    sql: `
      SELECT o.branch_id, od.product_id, o.created_at AS sold_at, CONCAT('o', o.order_id) AS ref
        FROM order_details od
        JOIN orders o ON o.order_id = od.order_id
       WHERE ${orders.where}
      UNION ALL
      SELECT l.branch_id, ld.product_id, l.created_at AS sold_at, CONCAT('l', l.layaway_id) AS ref
        FROM layaway_details ld
        JOIN layaways l ON l.layaway_id = ld.layaway_id
       WHERE ${layaways.where}
    `,
    params: [...orders.params, ...layaways.params],
  };
};

const discountFor = ({ days, costPrice, salePrice }) => {
  if (costPrice === 0) return { reason: 'no_cost' };
  if (salePrice <= costPrice) return { reason: 'price_not_above_cost' };
  const percent = discountPercentFor(days);
  // En centavos enteros para que el redondeo al centavo no dependa de floats
  const priceCents     = Math.round(salePrice * 100);
  const discountedCents = Math.round(priceCents * (100 - percent) / 100);
  const costCents      = Math.round(costPrice * 100);
  if (discountedCents >= costCents) {
    return { reason: null, percent, price: salePrice, suggestedPrice: discountedCents / 100, cappedByCost: false };
  }
  return {
    reason:         null,
    percent:        round2((priceCents - costCents) / priceCents * 100),
    price:          salePrice,
    suggestedPrice: costCents / 100,
    cappedByCost:   true,
  };
};

const compareText = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' });

// Traspaso y promoción de las filas de una página. periodFrom: inicio del
// periodo en hora del servidor.
const rotationSuggestions = async (rows, periodFrom) => {
  if (rows.length === 0) return rows;

  const productIds = [...new Set(rows.map(r => r.productId))];
  const pairs = [...new Map(
    rows.filter(r => r.categoryId !== null).map(r => [`${r.branchId}|${r.categoryId}`, [r.branchId, r.categoryId]])
  ).values()];

  const sales = rotationSalesQuery({ from: periodFrom });
  const [[transfers], [partners]] = await Promise.all([
    // Ventas del periodo en sucursales activas
    db.query(
      `SELECT s.product_id, s.branch_id, b.name, COUNT(DISTINCT s.ref) AS sales
         FROM (${sales.sql}) s
         JOIN branches b ON b.branch_id = s.branch_id AND b.is_active = 1
        WHERE s.product_id IN (?)
        GROUP BY s.product_id, s.branch_id, b.name`,
      [...sales.params, productIds]
    ),
    // Los más vendidos del periodo por sucursal y categoría, activos y con
    // stock disponible en esa sucursal
    pairs.length === 0
      ? [[]]
      : db.query(
        `SELECT o.branch_id, p.category_id, p.product_id, p.name, COUNT(DISTINCT o.order_id) AS sales
           FROM order_details od
           JOIN orders o   ON o.order_id   = od.order_id
           JOIN products p ON p.product_id = od.product_id AND p.is_active = 1
          WHERE ${SOLD_STATUSES_SQL}
            AND o.created_at >= ?
            AND (o.branch_id, p.category_id) IN (?)
            AND EXISTS (
              SELECT 1
                FROM inventory_stock i
                LEFT JOIN product_variants v ON v.variant_id = i.variant_id
               WHERE i.branch_id = o.branch_id AND i.product_id = p.product_id
                 AND ${INVENTORY_SOURCES.stock.where.join(' AND ')}
                 AND ${ACTIVE_ITEM_SQL}
            )
          GROUP BY o.branch_id, p.category_id, p.product_id, p.name`,
        [periodFrom, pairs]
      ),
  ]);

  const bySales = (a, b) => b.sales - a.sales || compareText(a.name, b.name);

  return rows.map(r => {
    const transfer = transfers
      .filter(t => t.product_id === r.productId && t.branch_id !== r.branchId)
      .map(t => ({ branchId: t.branch_id, name: t.name, sales: Number(t.sales) }))
      .sort(bySales)[0] ?? null;
    const promotion = partners
      .filter(p => p.branch_id === r.branchId && p.category_id === r.categoryId && p.product_id !== r.productId)
      .map(p => ({ productId: p.product_id, name: p.name, sales: Number(p.sales) }))
      .sort(bySales)
      .slice(0, PROMOTION_SIZE)
      .map(({ productId, name }) => ({ productId, name }));
    return { ...r, suggestions: { transfer, discount: discountFor(r), promotion } };
  });
};

// today: fecha de hoy en México, 'YYYY-MM-DD'. branchId = null → consolidado
// (admin central); un usuario con sucursal llega con la suya ya forzada.
const getRotationReport = async ({
  today,
  days = 30,
  branchId = null,
  categoryId = null,
  providerId = null,
  search = '',
  excludeCategoryIds = '',
  excludeNoCost = false,
  sortBy = 'cost_value',
  sortDir = 'desc',
  page = 1,
  limit = 20,
}) => {
  if (!ROTATION_DAYS.includes(days)) throw new ValidationError('days debe ser 30, 60, 90 o 180');
  if (branchId !== null && !isPositiveInt(branchId))     throw new ValidationError('branch_id inválido');
  if (categoryId !== null && !isPositiveInt(categoryId)) throw new ValidationError('category_id inválido');
  if (providerId !== null && !isPositiveInt(providerId)) throw new ValidationError('provider_id inválido');
  const excludedIds = parseIdList(excludeCategoryIds);
  if (excludedIds === null) throw new ValidationError('exclude_category_ids debe ser una lista de ids separados por coma');
  if (categoryId !== null && excludedIds.length > 0) {
    throw new ValidationError('Para excluir categorías hay que ver todas las categorías (sin category_id)');
  }
  if (!ROTATION_SORTS.includes(sortBy)) throw new ValidationError('sort_by debe ser cost_value o days');
  if (sortDir !== 'asc' && sortDir !== 'desc') throw new ValidationError('sort_dir debe ser asc o desc');

  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safePage  = Math.max(parseInt(page) || 1, 1);

  const filters = {
    branchId, categoryId, providerId, excludeCategoryIds: excludedIds, search: String(search).trim(),
  };
  const items = inventoryItemsQuery('stock', filters, [ACTIVE_ITEM_SQL]);
  const sales = rotationSalesQuery({ branchId });

  // Todo el disponible, con su última venta y su llegada. Se filtra por días
  // aquí y no en SQL porque el valor de todo el disponible es el denominador
  // de "parte del inventario".
  const arrivalSql = 'CASE WHEN fm.created_at IS NULL OR fm.quantity_before > 0 THEN p.created_at ELSE fm.created_at END';
  const [stockRows] = await db.query(
    `SELECT a.branch_id, b.name AS branch_name, a.product_id, p.name, p.sku, p.uom, p.category_id,
            a.quantity, p.purchase_price, p.sale_price,
            DATE_FORMAT(${createdAtMx('ls.sold_at')}, '%Y-%m-%d') AS last_sale,
            DATEDIFF(?, DATE(${createdAtMx(`COALESCE(ls.sold_at, ${arrivalSql})`)})) AS days
       FROM (
         SELECT t.branch_id, t.product_id, SUM(t.quantity) AS quantity
           FROM (${items.sql}) t
          GROUP BY t.branch_id, t.product_id
       ) a
       JOIN products p ON p.product_id = a.product_id
       JOIN branches b ON b.branch_id = a.branch_id
       LEFT JOIN (
         SELECT s.branch_id, s.product_id, MAX(s.sold_at) AS sold_at
           FROM (${sales.sql}) s
          GROUP BY s.branch_id, s.product_id
       ) ls ON ls.branch_id = a.branch_id AND ls.product_id = a.product_id
       LEFT JOIN (
         SELECT m.branch_id, m.product_id, m.created_at, m.quantity_before
           FROM inventory_movements m
           JOIN (
             SELECT branch_id, product_id, MIN(movement_id) AS movement_id
               FROM inventory_movements
              GROUP BY branch_id, product_id
           ) f ON f.movement_id = m.movement_id
       ) fm ON fm.branch_id = a.branch_id AND fm.product_id = a.product_id`,
    [today, ...items.params, ...sales.params]
  );

  const all = stockRows.map(r => ({
    branchId:   r.branch_id,
    branchName: r.branch_name,
    productId:  r.product_id,
    name:       r.name,
    sku:        r.sku,
    uom:        r.uom,
    categoryId: r.category_id,
    units:      round3(r.quantity),
    costPrice:  Number(r.purchase_price),
    salePrice:  Number(r.sale_price),
    costValue:  Number(r.quantity) * Number(r.purchase_price),
    saleValue:  Number(r.quantity) * Number(r.sale_price),
    lastSale:   r.last_sale,
    neverSold:  r.last_sale === null,
    // Sin venta ni fecha de alta no hay desde cuándo contar: no entra
    days:       r.days === null ? null : Number(r.days),
  }));
  const counted  = excludeNoCost ? all.filter(r => r.costPrice > 0) : all;
  const stale    = (list) => list.filter(r => r.days !== null && r.days >= days);
  const rows     = stale(counted);
  const noCost   = stale(all).filter(r => r.costPrice === 0);

  const sum = (list, key) => list.reduce((acc, r) => acc + r[key], 0);
  const units = new Map();
  for (const r of rows) {
    const uom = r.uom?.trim() || null;
    units.set(uom, (units.get(uom) ?? 0) + r.units);
  }
  const costValue      = sum(rows, 'costValue');
  const availableValue = sum(counted, 'costValue');

  // El nombre y luego la sucursal y el id desempatan para que la paginación
  // sea estable
  const dir = sortDir === 'asc' ? 1 : -1;
  const primary = sortBy === 'days'
    ? (a, b) => dir * (a.days - b.days)
    : (a, b) => dir * (a.costValue - b.costValue) || b.days - a.days;
  rows.sort((a, b) =>
    primary(a, b) || compareText(a.name, b.name) || compareText(a.branchName, b.branchName) || a.productId - b.productId);

  const pageRows = rows.slice((safePage - 1) * safeLimit, safePage * safeLimit);
  const periodFrom = await toServerDayStart(periods.addDays(today, -(days - 1)));
  const data = (await rotationSuggestions(pageRows, periodFrom)).map(({ categoryId: _, ...r }) => ({
    ...r,
    costValue: round2(r.costValue),
    saleValue: round2(r.saleValue),
  }));

  return {
    data,
    pagination: {
      page:  safePage,
      limit: safeLimit,
      total: rows.length,
      totalPages: Math.max(1, Math.ceil(rows.length / safeLimit)),
    },
    summary: {
      days,
      today,
      products:  rows.length,
      neverSold: rows.filter(r => r.neverSold).length,
      units: [...units.entries()]
        .map(([uom, quantity]) => ({ uom, quantity: round3(quantity) }))
        .sort((a, b) => b.quantity - a.quantity || compareText(a.uom ?? '', b.uom ?? '')),
      costValue:          round2(costValue),
      saleValue:          round2(sum(rows, 'saleValue')),
      availableCostValue: round2(availableValue),
      share:              round2(availableValue) === 0 ? null : round2(costValue / availableValue * 100),
      noCost: {
        products:  noCost.length,
        saleValue: round2(sum(noCost, 'saleValue')),
      },
    },
  };
};

// ─── Gastos ────────────────────────────────────────────────────────────────

// Gasto de un periodo, agrupado por categoría, sucursal, proveedor o método
// de pago (specs/13-reporte-de-gastos-y-utilidad-neta.md). Cuentan los gastos
// activos (no cancelados) cuya fecha del gasto cae en el periodo. La fecha
// del gasto ya es un día de México sin hora, así que se compara directo, sin
// pasar por utils/timezone.js. El resumen separa lo que cuenta en la utilidad
// neta según la marca ACTUAL de cada categoría.

const EXPENSE_GROUPS = {
  category: {
    key:  'e.expense_category_id',
    join: 'JOIN expense_categories g ON g.expense_category_id = t.group_id',
    cols: 'g.name AS name, g.counts_in_net_profit',
  },
  branch: {
    key:  'e.branch_id',
    join: 'JOIN branches g ON g.branch_id = t.group_id',
    cols: 'g.name AS name',
  },
  provider: {
    key:  'e.provider_id',
    join: 'LEFT JOIN providers g ON g.provider_id = t.group_id',
    cols: "COALESCE(g.name, 'Sin proveedor') AS name",
  },
  payment_method: {
    key:  'e.payment_method_id',
    join: 'JOIN payment_methods g ON g.payment_method_id = t.group_id',
    cols: 'g.name AS name',
  },
};

// WHERE de los gastos activos del periodo y la sucursal (null = todas)
const activeExpensesWhere = ({ startDate, endDate, branchId = null }) => {
  const where  = ["e.status = 'active'", 'e.expense_date BETWEEN ? AND ?'];
  const params = [startDate, endDate];
  if (branchId !== null) { where.push('e.branch_id = ?'); params.push(branchId); }
  return { whereSql: where.join(' AND '), params };
};

// Fecha ('YYYY-MM-DD') del gasto activo más antiguo de la sucursal (null =
// todas), o null si no hay ninguno. Para el aviso de los periodos que empiezan
// antes de que se registraran gastos (requisitos 16–18).
const getFirstExpenseDate = async (branchId = null) => {
  const [[row]] = await db.query(
    `SELECT DATE_FORMAT(MIN(e.expense_date), '%Y-%m-%d') AS first_date
       FROM expenses e
      WHERE e.status = 'active' ${branchId !== null ? 'AND e.branch_id = ?' : ''}`,
    branchId !== null ? [branchId] : []
  );
  return row.first_date;
};

// Gastos que restan de la utilidad neta (categorías que cuentan en ella),
// por sucursal: Map branch_id → total
const netProfitExpensesByBranch = async ({ startDate, endDate, branchId = null }) => {
  const { whereSql, params } = activeExpensesWhere({ startDate, endDate, branchId });
  const [rows] = await db.query(
    `SELECT e.branch_id, SUM(e.amount) AS total
       FROM expenses e
       JOIN expense_categories ec ON ec.expense_category_id = e.expense_category_id
      WHERE ${whereSql} AND ec.counts_in_net_profit = 1
      GROUP BY e.branch_id`,
    params
  );
  return new Map(rows.map(r => [r.branch_id, Number(r.total)]));
};

const getExpenseReport = async ({
  startDate,
  endDate,
  branchId = null,
  groupBy = 'category',
  page = 1,
  limit = 20,
}) => {
  if (!DATE_RE.test(startDate ?? '') || !DATE_RE.test(endDate ?? '')) {
    throw new ValidationError('start_date y end_date son requeridos, formato YYYY-MM-DD');
  }
  if (startDate > endDate) throw new ValidationError('start_date no puede ser posterior a end_date');
  if (branchId !== null && !isPositiveInt(branchId)) throw new ValidationError('branch_id inválido');
  const group = EXPENSE_GROUPS[groupBy];
  if (!group) throw new ValidationError('group_by debe ser category, branch, provider o payment_method');

  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safePage  = Math.max(parseInt(page) || 1, 1);
  const { whereSql, params } = activeExpensesWhere({ startDate, endDate, branchId });

  const [[summary]] = await db.query(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(e.amount), 0) AS total,
            COALESCE(SUM(CASE WHEN ec.counts_in_net_profit = 1 THEN e.amount ELSE 0 END), 0) AS in_net_profit
       FROM expenses e
       JOIN expense_categories ec ON ec.expense_category_id = e.expense_category_id
      WHERE ${whereSql}`,
    params
  );
  const total = Number(summary.total);
  const count = Number(summary.count);

  // Mayor total primero; group_id desempata para que la paginación sea
  // estable (los gastos sin proveedor tienen group_id NULL y van al final
  // de su empate)
  const [rows] = await db.query(
    `SELECT t.*, ${group.cols}
       FROM (
         SELECT ${group.key} AS group_id, COUNT(*) AS count, SUM(e.amount) AS total
           FROM expenses e
          WHERE ${whereSql}
          GROUP BY ${group.key}
       ) t
       ${group.join}
      ORDER BY t.total DESC, (t.group_id IS NULL), t.group_id
      LIMIT ? OFFSET ?`,
    [...params, safeLimit, (safePage - 1) * safeLimit]
  );

  const [[{ groups }]] = await db.query(
    `SELECT COUNT(DISTINCT ${group.key}) + MAX(${group.key} IS NULL) AS \`groups\`
       FROM expenses e WHERE ${whereSql}`,
    params
  );

  return {
    data: rows.map(r => ({
      groupId: r.group_id,
      name:    r.name,
      count:   Number(r.count),
      total:   round2(r.total),
      share:   total === 0 ? null : round2(Number(r.total) / total * 100),
      ...(groupBy === 'category' ? { countsInNetProfit: r.counts_in_net_profit === 1 } : {}),
    })),
    pagination: {
      page:       safePage,
      limit:      safeLimit,
      total:      Number(groups ?? 0),
      totalPages: Math.max(1, Math.ceil(Number(groups ?? 0) / safeLimit)),
    },
    summary: {
      total:          round2(total),
      count,
      average:        count === 0 ? null : round2(total / count),
      inNetProfit:    round2(summary.in_net_profit),
      outOfNetProfit: round2(total - Number(summary.in_net_profit)),
    },
    firstExpenseDate: await getFirstExpenseDate(branchId),
  };
};

module.exports = {
  getCashSessions, getCashSessionDetail, getProfitReport, getTrendReport, getInventoryReport, getRotationReport,
  getExpenseReport,
};