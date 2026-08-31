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
//   esperado    = open_amount + SUM(cash_movements IN sale/income/
//                 credit_payment/layaway_payment)
//                 − SUM(cash_movements IN expense/return)
//   diferencia  = close_amount − esperado
//
// El retiro de efectivo (withdrawAmt) no se pierde: closeRegister ya lo
// inserta como un movimiento 'expense' en cash_movements ANTES de cerrar,
// así que total_out de aquí ya lo trae contado — no hace falta guardarlo
// aparte.

const db = require('../config/db');
const { NotFoundError } = require('../errors/AppError');
// FIX: dateFrom/dateTo llegan del frontend como fecha "de pared" en México
// (ej. "2026-08-24"), pero se comparaban directo contra s.opened_at /
// s.closed_at, que son hora del SERVIDOR (2h adelantada sobre México) —
// mismo bug que ya se corrigió en orderService.js. Se usa el mismo módulo
// compartido para no volver a desincronizar el criterio.
const { toServerDayStart, toServerDayEnd } = require('../utils/timezone');

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
              SUM(CASE WHEN movement_type IN ('sale','income','credit_payment','layaway_payment') THEN amount ELSE 0 END) AS total_in,
              SUM(CASE WHEN movement_type IN ('expense','return') THEN amount ELSE 0 END) AS total_out
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

  const totals = movements.reduce((acc, m) => {
    if (['sale', 'income', 'credit_payment', 'layaway_payment'].includes(m.movement_type)) {
      acc.total_in += Number(m.amount);
    } else {
      acc.total_out += Number(m.amount);
    }
    return acc;
  }, { total_in: 0, total_out: 0 });
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

module.exports = { getCashSessions, getCashSessionDetail };