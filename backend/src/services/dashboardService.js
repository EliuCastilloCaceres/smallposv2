// src/services/dashboardService.js
const db = require('../config/db');
const { ValidationError } = require('../errors/AppError');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toRange = (startDate, endDate) => [`${startDate} 00:00:00`, `${endDate} 23:59:59`];

const validateDates = (startDate, endDate) => {
  if (!startDate || !endDate || !DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    throw new ValidationError('start_date y end_date son requeridos, formato YYYY-MM-DD');
  }
  if (startDate > endDate) {
    throw new ValidationError('start_date no puede ser posterior a end_date');
  }
};

// ─── Helpers de fecha para períodos comparativos ────────────────────────────

const addDays = (dateStr, days) => {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

const daysBetween = (start, end) => {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  return Math.round((e - s) / (1000 * 60 * 60 * 24));
};

/**
 * Dado un período actual (start, end) y un preset, calcula el período
 * anterior correspondiente para la comparación.
 */
const getPreviousPeriod = (startDate, endDate, preset) => {
  const duration = daysBetween(startDate, endDate);

  switch (preset) {
    case 'today': {
      // Ayer
      const yesterday = addDays(startDate, -1);
      return { start: yesterday, end: yesterday, label: 'ayer' };
    }
    case 'week': {
      // Semana pasada (mismo rango de 7 días, desplazado)
      return {
        start: addDays(startDate, -7),
        end: addDays(endDate, -7),
        label: 'la semana pasada',
      };
    }
    case 'month': {
      // FIX: setMonth(-1) directo sobre el día actual desbordaba cuando el
      // mes anterior tiene menos días (ej. 31 de marzo -> 3 de marzo en vez
      // de 28 de febrero). Se calcula el primer y último día del mes
      // anterior de forma explícita, sin depender del día-del-mes actual.
      const start = new Date(startDate + 'T12:00:00');
      const end   = new Date(endDate + 'T12:00:00');
      const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1, 12)
        .toISOString().split('T')[0];
      // día 0 del mes de "end" = último día del mes anterior
      const prevEnd = new Date(end.getFullYear(), end.getMonth(), 0, 12)
        .toISOString().split('T')[0];
      return { start: prevStart, end: prevEnd, label: 'el mes pasado' };
    }
    case 'custom':
    default: {
      // Período anterior de la MISMA duración
      const prevStart = addDays(startDate, -(duration + 1));
      const prevEnd = addDays(startDate, -1);
      return { start: prevStart, end: prevEnd, label: 'el período anterior' };
    }
  }
};

/**
 * Calcula diferencia porcentual entre valor actual y anterior.
 * Si el anterior es 0 y el actual > 0, devuelve +100.
 * Si ambos son 0, devuelve 0.
 */
const pctChange = (current, previous) => {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return c > 0 ? 100 : 0;
  return +(((c - p) / p) * 100).toFixed(1);
};

// ─── KPIs ───────────────────────────────────────────────────────────────────

// FIX: una devolución PARCIAL deja la orden en status = 'partial_refund'
// (ver returnService.createReturn), no 'completed' — si aquí solo se
// contara 'completed', esas órdenes desaparecerían enteras del KPI en vez
// de contar por la parte no devuelta, que sigue siendo ingreso real. Se
// incluyen ambos estados y se resta lo reembolsado (returns.amount_refunded,
// solo devoluciones status='completed') y las unidades físicamente
// devueltas (sí vuelven a stock, a diferencia del caso de descuento).
//
// FIX 2: 'refunded' también se incluye — NO se excluye por completo. Una
// orden pasa a 'refunded' cuando se devolvieron TODAS las unidades (ver
// allReturned en returnService.createReturn), pero eso es una decisión
// sobre PRODUCTO, no sobre DINERO: si se cobró una tarifa de restock (se
// reembolsó menos del 100% del monto pagado), la orden queda 'refunded'
// aunque sí quedó ingreso real. El neteo de abajo (o.total - refunded_amount)
// ya reduce correctamente a $0 cuando el reembolso fue del 100% del dinero,
// así que no hace falta excluir el status aparte — excluirlo tiraba a la
// basura ese ingreso por tarifa de restock en vez de contarlo.
const getKpis = async ({ startDate, endDate, branchId }) => {
  const range = toRange(startDate, endDate);
  const branchClause = branchId ? 'AND o.branch_id = ?' : '';
  const branchParam  = branchId ? [branchId] : [];

  const [[totals]] = await db.query(
    `SELECT
       COUNT(o.order_id)          AS orders_total,
       COALESCE(SUM(o.total - COALESCE(rf.refunded, 0)), 0)  AS income,
       COALESCE(SUM(o.discount), 0) AS total_discounts,
       COALESCE(SUM(qty.total_units - COALESCE(rq.returned_units, 0)), 0) AS total_units_sold
     FROM orders o
     LEFT JOIN (
       SELECT order_id, SUM(quantity) AS total_units
       FROM order_details GROUP BY order_id
     ) qty ON qty.order_id = o.order_id
     LEFT JOIN (
       SELECT order_id, SUM(amount_refunded) AS refunded
       FROM returns WHERE status = 'completed'
       GROUP BY order_id
     ) rf ON rf.order_id = o.order_id
     LEFT JOIN (
       SELECT r.order_id, SUM(rd.quantity) AS returned_units
       FROM return_details rd
       JOIN returns r ON rd.return_id = r.return_id
       WHERE r.status = 'completed'
       GROUP BY r.order_id
     ) rq ON rq.order_id = o.order_id
     WHERE o.created_at BETWEEN ? AND ?
       AND o.status IN ('completed', 'partial_refund', 'refunded')
       ${branchClause}`,
    [...range, ...branchParam]
  );

  const [peakRows] = await db.query(
    `SELECT HOUR(o.created_at) AS hour, COUNT(*) AS cnt
     FROM orders o
     WHERE o.created_at BETWEEN ? AND ?
       AND o.status IN ('completed', 'partial_refund', 'refunded')
       ${branchClause}
     GROUP BY HOUR(o.created_at)
     ORDER BY cnt DESC
     LIMIT 1`,
    [...range, ...branchParam]
  );

  const ordersTotal = totals.orders_total ?? 0;
  const income      = Number(totals.income ?? 0);

  return {
    orders_total:      ordersTotal,
    income,
    // FIX: renombrado de total_discount -> total_discounts para que
    // coincida con el campo que lee el frontend (StatCard de descuentos)
    total_discounts:   Number(totals.total_discounts ?? 0),
    total_units_sold:  totals.total_units_sold ?? 0,
    avg_ticket:        ordersTotal > 0 ? +(income / ordersTotal).toFixed(2) : 0,
    peak_hour:         peakRows.length > 0 ? peakRows[0].hour : null,
  };
};

/**
 * Devuelve KPIs del período actual + comparativa vs período anterior.
 */
const getKpisWithComparison = async ({ startDate, endDate, branchId, preset }) => {
  const current = await getKpis({ startDate, endDate, branchId });

  const prev = getPreviousPeriod(startDate, endDate, preset);
  const previous = await getKpis({ startDate: prev.start, endDate: prev.end, branchId });

  return {
    ...current,
    comparison: {
      label: prev.label,
      orders_total:      pctChange(current.orders_total, previous.orders_total),
      income:            pctChange(current.income, previous.income),
      total_units_sold:  pctChange(current.total_units_sold, previous.total_units_sold),
      avg_ticket:        pctChange(current.avg_ticket, previous.avg_ticket),
      // FIX: faltaba la comparación de descuentos — sin esto la card
      // nueva mostraba el monto correcto pero nunca la tendencia (↑/↓)
      total_discounts:   pctChange(current.total_discounts, previous.total_discounts),
      // peak_hour no tiene comparación porcentual, solo se muestra el valor
    },
  };
};

// ─── Top productos ──────────────────────────────────────────────────────────

// FIX: total_revenue sumaba od.subtotal a secas (precio bruto de la línea),
// sin considerar el descuento a nivel ORDEN (orders.discount/total). Como
// PaymentModal manda siempre item.discount = 0 (el descuento se aplica al
// carrito completo, no por renglón), una venta con 100% de descuento
// (total = $0) seguía apareciendo aquí con el ingreso bruto de sus
// productos — ej. 2 jugos a $45 se mostraban como $90 vendidos aunque el
// cliente no pagó nada. Se prorratea el descuento de la orden entre sus
// líneas usando la razón total/subtotal de esa orden, así una orden en $0
// aporta $0 de ingreso por cada producto.
//
// FIX 2: tampoco se restaba nada por devoluciones. Las UNIDADES se restan
// completas (ret_qty) — físicamente el producto regresó al inventario
// (restoreSaleStock) sin importar cuánto dinero se reembolsó, así que ya
// no cuenta como "vendido" neto.
//
// FIX 3: el DINERO no se resta a valor de lista completo (rd.quantity *
// rd.unit_price) — eso asume que siempre se reembolsó el 100%. Si se
// cobró una tarifa de restock (returns.amount_refunded < valor de lista de
// lo devuelto), esa diferencia es ingreso real que se estaba perdiendo. En
// vez de eso se prorratea el amount_refunded REAL de cada devolución entre
// sus líneas (usando el valor de lista de cada línea DENTRO de esa
// devolución como peso — no de toda la orden), y esa porción de dinero
// real se resta DESPUÉS de aplicar el ratio de descuento de la orden a la
// línea, no antes: restarlo antes volvería a aplicarle el descuento de
// orden a un monto que ya está en dólares finales (doble descuento). Sumado
// por orden, esto da exactamente o.total - amount_refunded — el mismo neto
// que usa getKpis, así que "Top productos" y los KPIs cuadran entre sí
// incluso con tarifas de restock.
const getTopProducts = async ({ startDate, endDate, branchId }) => {
  const range = toRange(startDate, endDate);
  const branchClause = branchId ? 'AND o.branch_id = ?' : '';
  const branchParam  = branchId ? [branchId] : [];

  const [rows] = await db.query(
    `SELECT od.product_id, p.sku, p.image, p.name,
            SUM(od.quantity - COALESCE(ret.ret_qty, 0)) AS total_sold,
            SUM(
              (od.subtotal - od.discount) *
              CASE WHEN o.subtotal > 0 THEN o.total / o.subtotal ELSE 0 END
              - COALESCE(ret.ret_amount_actual, 0)
            ) AS total_revenue
     FROM order_details od
     JOIN products p ON od.product_id = p.product_id
     JOIN orders   o ON od.order_id   = o.order_id
     LEFT JOIN (
       SELECT r.order_id, rd.product_id, rd.variant_id,
              SUM(rd.quantity) AS ret_qty,
              SUM(
                r.amount_refunded * (rd.quantity * rd.unit_price)
                / NULLIF(rf.face_value, 0)
              ) AS ret_amount_actual
       FROM return_details rd
       JOIN returns r ON rd.return_id = r.return_id
       JOIN (
         -- Valor de lista TOTAL de cada devolución (todas sus líneas) — el
         -- denominador del prorrateo. Separado porque necesitamos el total
         -- de LA DEVOLUCIÓN antes de filtrar/agrupar por producto.
         SELECT return_id, SUM(quantity * unit_price) AS face_value
         FROM return_details
         GROUP BY return_id
       ) rf ON rf.return_id = rd.return_id
       WHERE r.status = 'completed'
       GROUP BY r.order_id, rd.product_id, rd.variant_id
     ) ret ON ret.order_id = od.order_id
          AND ret.product_id = od.product_id
          AND ret.variant_id <=> od.variant_id
     WHERE o.created_at BETWEEN ? AND ?
       AND o.status IN ('completed', 'partial_refund', 'refunded')
       ${branchClause}
     GROUP BY od.product_id
     ORDER BY total_sold DESC
     LIMIT 10`,
    [...range, ...branchParam]
  );
  return rows.map(r => ({ ...r, total_revenue: +Number(r.total_revenue).toFixed(2) }));
};

// ─── Desglose de ventas por método de pago ──────────────────────────────────

// FIX: incluye órdenes 'partial_refund' (antes desaparecían del desglose
// al dejar de ser 'completed'), y resta lo reembolsado por cada método
// (returns.payment_method_id/amount_refunded, solo status='completed').
// Se calcula en dos queries separadas — combinarlo en un solo JOIN
// duplicaría op.amount por cada devolución de esa orden (fan-out) — y se
// combinan en JS.
//
// FIX 2: 'refunded' también se incluye (no se excluye por completo).
// Devuelto TODO el producto no implica devuelto TODO el dinero (tarifa de
// restock) — el pago original SÍ se cuenta y el reembolso SÍ se resta,
// dando el neto correcto en cualquier combinación.
const getPaymentBreakdown = async ({ startDate, endDate, branchId }) => {
  const range = toRange(startDate, endDate);
  const branchClause = branchId ? 'AND o.branch_id = ?' : '';
  const branchParam  = branchId ? [branchId] : [];

  const [rows] = await db.query(
    `SELECT pm.payment_method_id, pm.name, pm.code,
            COALESCE(SUM(op.amount), 0) AS total
     FROM order_payments op
     JOIN payment_methods pm ON op.payment_method_id = pm.payment_method_id
     JOIN orders o ON op.order_id = o.order_id
     WHERE o.created_at BETWEEN ? AND ?
       AND o.status IN ('completed', 'partial_refund', 'refunded')
       ${branchClause}
     GROUP BY pm.payment_method_id
     ORDER BY total DESC`,
    [...range, ...branchParam]
  );

  // FIX: esta query no filtraba por o.status — con 'refunded' ahora
  // incluido en ambas queries (arriba y aquí abajo), el pago original de
  // una orden 'refunded' SÍ se suma en `rows` y su reembolso SÍ se resta
  // aquí — se compensan y el neto queda correcto (ej. $0 si se devolvió el
  // 100% del dinero, o el monto de la tarifa de restock si se devolvió
  // menos). Antes 'refunded' estaba excluido de ambas: el pago original no
  // se sumaba en `rows` pero tampoco había nada que restar aquí, así que
  // coincidentemente daba bien SOLO cuando el reembolso era del 100% del
  // dinero — con una tarifa de restock (reembolso parcial de dinero sobre
  // una devolución total de producto) se perdía ese ingreso por completo.
  const [refundRows] = await db.query(
    `SELECT r.payment_method_id,
            COALESCE(SUM(r.amount_refunded - COALESCE(r.credit_adjustment_amount, 0)), 0) AS refunded
     FROM returns r
     JOIN orders o ON r.order_id = o.order_id
     WHERE o.created_at BETWEEN ? AND ?
       AND o.status IN ('completed', 'partial_refund', 'refunded')
       AND r.status = 'completed'
       AND r.payment_method_id IS NOT NULL
       ${branchClause}
     GROUP BY r.payment_method_id`,
    [...range, ...branchParam]
  );

  // FIX: cuando una devolución sobre venta a crédito se absorbe total o
  // parcialmente contra el saldo pendiente (credit_adjustment_amount), esa
  // porción NUNCA pasó por r.payment_method_id (puede incluso ser NULL si
  // no hubo dinero real de vuelta) — la query de arriba la ignoraba por
  // completo. Se resta aparte, siempre del bucket 'credit', sin importar
  // si esa misma devolución también tuvo un payment_method_id real.
  const [[creditRefund]] = await db.query(
    `SELECT COALESCE(SUM(r.credit_adjustment_amount), 0) AS refunded_credit
     FROM returns r
     JOIN orders o ON r.order_id = o.order_id
     WHERE o.created_at BETWEEN ? AND ?
       AND o.status IN ('completed', 'partial_refund', 'refunded')
       AND r.status = 'completed'
       ${branchClause}`,
    [...range, ...branchParam]
  );

  const refundedByMethod = new Map(refundRows.map(r => [r.payment_method_id, Number(r.refunded)]));

  return rows
    .map(r => {
      const creditDeduction = r.code === 'credit' ? Number(creditRefund.refunded_credit) : 0;
      return {
        ...r,
        total: +(Number(r.total) - (refundedByMethod.get(r.payment_method_id) ?? 0) - creditDeduction).toFixed(2),
      };
    })
    .sort((a, b) => b.total - a.total);
};

// ─── Cajas abiertas ─────────────────────────────────────────────────────────

const getOpenCashRegisters = async ({ branchId }) => {
  const branchClause = branchId ? 'AND cr.branch_id = ?' : '';
  const branchParam  = branchId ? [branchId] : [];
  const branchNameCol = branchId ? '' : ', b.name AS branch_name';
  const branchJoin    = branchId ? '' : 'JOIN branches b ON b.branch_id = cr.branch_id';

  const [rows] = await db.query(
    `SELECT cr.cash_register_id, cr.name AS register_name,
            u.first_name, u.last_name,
            s.opened_at, s.open_amount,
            COALESCE(SUM(CASE WHEN cm.movement_type IN ('sale','income','credit_payment','layaway_payment')
                         THEN cm.amount ELSE 0 END), 0) AS total_in,
            COALESCE(SUM(CASE WHEN cm.movement_type IN ('expense','return')
                         THEN cm.amount ELSE 0 END), 0) AS total_out
            ${branchNameCol}
     FROM cash_registers cr
     ${branchJoin}
     JOIN cash_register_sessions s ON s.cash_register_id = cr.cash_register_id
                                   AND s.closed_at IS NULL
     JOIN users u ON s.user_id = u.user_id
     LEFT JOIN cash_movements cm ON cm.session_id = s.session_id
     WHERE cr.is_open = 1 AND cr.is_active = 1 ${branchClause}
     GROUP BY cr.cash_register_id, s.session_id`,
    branchParam
  );

  return rows.map(cr => ({
    ...cr,
    expected_close: +(cr.open_amount + cr.total_in - cr.total_out).toFixed(2),
  }));
};

// ─── Stock bajo ─────────────────────────────────────────────────────────────

const getLowStock = async ({ branchId }) => {
  if (branchId) {
    const [rows] = await db.query(
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
    );
    return rows;
  }

  const [rows] = await db.query(
    `SELECT p.product_id, p.name, p.sku,
            pv.label AS variant_label,
            b.branch_id, b.name AS branch_name,
            COALESCE(s.quantity, 0) AS stock
     FROM products p
     JOIN branches b ON b.is_active = 1
     LEFT JOIN product_variants pv ON p.product_id = pv.product_id AND pv.is_active = 1
     LEFT JOIN inventory_stock s
       ON p.product_id = s.product_id
       AND s.branch_id = b.branch_id
       AND s.variant_id <=> pv.variant_id
     WHERE p.is_active = 1
       AND COALESCE(s.quantity, 0) < 5
     ORDER BY stock ASC
     LIMIT 15`
  );
  return rows;
};

// ─── Ventas por hora ─────────────────────────────────────────────────────────

const getSalesByHour = async ({ startDate, endDate, branchId }) => {
  const range = toRange(startDate, endDate);

  // FIX: incluye 'partial_refund' e ingreso neto de lo reembolsado
  // (returns.amount_refunded), mismo criterio que getKpis — sin esto una
  // orden con devolución parcial desaparecía del todo de la gráfica en vez
  // de contar por la parte no devuelta.
  //
  // FIX 2: también incluye 'refunded' — el neteo ya reduce a $0 cuando se
  // devolvió el 100% del dinero, así que excluir el status aparte solo
  // servía para perder el ingreso de una tarifa de restock (devolución
  // total de producto, parcial de dinero).
  const refundsSubquery = `
    LEFT JOIN (
      SELECT order_id, SUM(amount_refunded) AS refunded
      FROM returns WHERE status = 'completed'
      GROUP BY order_id
    ) rf ON rf.order_id = o.order_id`;

  // Modo sucursal: una fila por hora con datos
  if (branchId) {
    const [rows] = await db.query(
      `SELECT HOUR(o.created_at) AS hour,
              COUNT(o.order_id) AS orders_count,
              COALESCE(SUM(o.total - COALESCE(rf.refunded, 0)), 0) AS income
       FROM orders o
       ${refundsSubquery}
       WHERE o.created_at BETWEEN ? AND ?
         AND o.status IN ('completed', 'partial_refund', 'refunded')
         AND o.branch_id = ?
       GROUP BY HOUR(o.created_at)
       ORDER BY hour ASC`,
      [...range, branchId]
    );
    return rows.map(r => ({ hour: r.hour, orders_count: r.orders_count, income: Number(r.income) }));
  }

  // Modo consolidado: una fila por combinación hora + sucursal
  const [rows] = await db.query(
    `SELECT HOUR(o.created_at) AS hour, o.branch_id, b.name AS branch_name,
            COUNT(o.order_id) AS orders_count,
            COALESCE(SUM(o.total - COALESCE(rf.refunded, 0)), 0) AS income
     FROM orders o
     JOIN branches b ON b.branch_id = o.branch_id
     ${refundsSubquery}
     WHERE o.created_at BETWEEN ? AND ?
       AND o.status IN ('completed', 'partial_refund', 'refunded')
     GROUP BY HOUR(o.created_at), o.branch_id
     ORDER BY hour ASC, branch_name ASC`,
    range
  );
  return rows.map(r => ({
    hour: r.hour,
    branch_id: r.branch_id,
    branch_name: r.branch_name,
    orders_count: r.orders_count,
    income: Number(r.income),
  }));
};

// ─── Ensambladores por modo ─────────────────────────────────────────────────

const getBranchDashboard = async ({ branchId, startDate, endDate, preset }) => {
  const [[branchRow]] = await db.query(
    'SELECT branch_id, name FROM branches WHERE branch_id = ?',
    [branchId]
  );

  const [kpis, topProducts, paymentBreakdown, cashRegisters, lowStock, salesByHour] = await Promise.all([
    getKpisWithComparison({ startDate, endDate, branchId, preset }),
    getTopProducts({ startDate, endDate, branchId }),
    getPaymentBreakdown({ startDate, endDate, branchId }),
    getOpenCashRegisters({ branchId }),
    getLowStock({ branchId }),
    getSalesByHour({ startDate, endDate, branchId }),
  ]);

  return {
    mode:   'branch',
    branch: branchRow ?? null,
    period: { start_date: startDate, end_date: endDate },
    kpis,
    top_products:      topProducts,
    payment_breakdown: paymentBreakdown,
    cash_registers:    cashRegisters,
    low_stock:         lowStock,
    sales_by_hour:     salesByHour,
  };
};

const getConsolidatedDashboard = async ({ startDate, endDate, preset }) => {
  const [kpis, topProducts, paymentBreakdown, cashRegisters, lowStock, salesByHour] = await Promise.all([
    getKpisWithComparison({ startDate, endDate, branchId: null, preset }),
    getTopProducts({ startDate, endDate, branchId: null }),
    getPaymentBreakdown({ startDate, endDate, branchId: null }),
    getOpenCashRegisters({ branchId: null }),
    getLowStock({ branchId: null }),
    getSalesByHour({ startDate, endDate, branchId: null }),
  ]);

  return {
    mode:   'consolidated',
    branch: null,
    period: { start_date: startDate, end_date: endDate },
    kpis,
    top_products:      topProducts,
    payment_breakdown: paymentBreakdown,
    cash_registers:    cashRegisters,
    low_stock:         lowStock,
    sales_by_hour:     salesByHour,
  };
};

// ─── Punto de entrada ───────────────────────────────────────────────────────

const getDashboard = async ({ requestingUser, branchId, startDate, endDate, preset }) => {
  validateDates(startDate, endDate);

  let effectiveBranchId = requestingUser.branch_id;
  if (effectiveBranchId === null) {
    if (branchId) {
      // FIX: antes Number(branchId) inválido daba NaN y pasaba silencioso
      // hasta la query SQL en vez de fallar con un error claro
      const parsed = Number(branchId);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new ValidationError('branch_id inválido');
      }
      effectiveBranchId = parsed;
    } else {
      effectiveBranchId = null;
    }
  }

  return effectiveBranchId !== null
    ? getBranchDashboard({ branchId: effectiveBranchId, startDate, endDate, preset })
    : getConsolidatedDashboard({ startDate, endDate, preset });
};

module.exports = { getDashboard };