// src/services/cashRegisterService.js
// Gestión de cajas: apertura, cierre, movimientos y sesiones.

const db = require('../config/db');
const { NotFoundError, ValidationError, ConflictError } = require('../errors/AppError');

// ─── Cajas ────────────────────────────────────────────────────────────────────

// [FIX] Ahora trae también la última sesión cerrada para mostrar
//        saldo final, usuario y fechas en la grilla de RegisterGate.
// [FIX] branchId ahora es opcional — null = todas las sucursales (admin
// central sin sucursal asignada, ej. selector de caja en CreditDetailModal).
// Un usuario con sucursal asignada siempre llega aquí con su branch_id
// (lo resuelve el controller), así que para él el comportamiento es
// idéntico al de antes.
const getAllRegisters = async (branchId = null) => {
  const where  = branchId !== null ? 'WHERE cr.branch_id = ? AND cr.is_active = 1' : 'WHERE cr.is_active = 1';
  const params = branchId !== null ? [branchId] : [];

  const [rows] = await db.query(
    `SELECT
       cr.cash_register_id,
       cr.name,
       cr.is_open,
       cr.is_active,
       b.name AS branch_name,

       -- Sesión ACTIVA (si existe)
       s.session_id,
       s.opened_at,
       s.open_amount,
       s.user_id         AS opened_by_user_id,
       u.first_name      AS opened_by,

       -- Última sesión CERRADA
       ls.close_amount   AS last_close_amount,
       ls.closed_at      AS last_closed_at,
       ls.opened_at      AS last_opened_at,
       lu.first_name     AS last_closed_by

     FROM cash_registers cr
     JOIN branches b ON cr.branch_id = b.branch_id

     -- Sesión abierta actual
     LEFT JOIN cash_register_sessions s
       ON s.cash_register_id = cr.cash_register_id AND s.closed_at IS NULL
     LEFT JOIN users u ON s.user_id = u.user_id

     -- Última sesión cerrada (por session_id más alto)
     LEFT JOIN (
       SELECT cash_register_id, MAX(session_id) AS max_session_id
       FROM cash_register_sessions
       WHERE closed_at IS NOT NULL
       GROUP BY cash_register_id
     ) latest ON latest.cash_register_id = cr.cash_register_id
     LEFT JOIN cash_register_sessions ls ON ls.session_id = latest.max_session_id
     LEFT JOIN users lu ON ls.user_id = lu.user_id

     ${where}
     ORDER BY b.name ASC, cr.name ASC`,
    params
  );
  return rows;
};

const getRegisterById = async ({ cashRegisterId, branchId }) => {
  let querySelect = `SELECT * FROM cash_registers WHERE cash_register_id = ?`;
  const paramsSelect = [cashRegisterId];

  if (branchId !== undefined && branchId !== null) {
    querySelect += ` AND branch_id = ?`;
    paramsSelect.push(branchId);
  }

  const [rows] = await db.query(querySelect, paramsSelect);
  if (rows.length === 0) throw new NotFoundError('Caja no encontrada');
  return rows[0];
};

const createRegister = async ({ branchId, name }) => {
  if (!name || name.trim() === '') {
    throw new ValidationError('El nombre de la caja es requerido');
  }
  const [result] = await db.query(
    `INSERT INTO cash_registers (branch_id, name) VALUES (?, ?)`,
    [branchId, name.trim()]
  );
  return getRegisterById({ cashRegisterId: result.insertId, branchId });
};

const toggleRegisterStatus = async ({ cashRegisterId, branchId, is_active, requestingUser }) => {
  const register = await getRegisterById({ cashRegisterId, branchId });

  if (register.is_active === (is_active ? 1 : 0))
    throw new ValidationError(`La caja ya está ${is_active ? 'activa' : 'inactiva'}`);

  if (register.is_open) throw new ValidationError('No se puede desactivar una caja abierta');

  await db.query(
    `UPDATE cash_registers SET is_active = ? WHERE cash_register_id = ? AND branch_id = ?`,
    [is_active ? 1 : 0, cashRegisterId, branchId]
  );

  return getRegisterById({ cashRegisterId, branchId });
};

const updateRegister = async ({ cashRegisterId, branchId, registerName }) => {
  if (!registerName || registerName.trim() === '') {
    throw new ValidationError('El nombre de la caja es requerido');
  }
  await db.query(
    `UPDATE cash_registers SET name = ? WHERE cash_register_id = ? AND branch_id = ?`,
    [registerName.trim(), cashRegisterId, branchId]
  );
  return getRegisterById({ cashRegisterId, branchId });
};

// ─── Apertura ─────────────────────────────────────────────────────────────────

const openRegister = async ({ cashRegisterId, branchId, userId, openAmount }) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [registers] = await conn.query(
      `SELECT * FROM cash_registers
       WHERE cash_register_id = ? AND branch_id = ? AND is_active = 1
       FOR UPDATE`,
      [cashRegisterId, branchId]
    );
    if (registers.length === 0) throw new NotFoundError('Caja no encontrada');
    if (registers[0].is_open) throw new ConflictError('La caja ya está abierta');

    const [session] = await conn.query(
      `INSERT INTO cash_register_sessions (cash_register_id, user_id, open_amount)
       VALUES (?, ?, ?)`,
      [cashRegisterId, userId, openAmount]
    );

    await conn.query(
      `UPDATE cash_registers SET is_open = 1 WHERE cash_register_id = ?`,
      [cashRegisterId]
    );

    await conn.commit();
    return { sessionId: session.insertId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── Cierre ───────────────────────────────────────────────────────────────────

const closeRegister = async ({ cashRegisterId, branchId, userId, cashCounted, withdrawAmt = 0 }) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // [NUEVO] Join con branches para tener el nombre listo para el reporte
    const [registers] = await conn.query(
      `SELECT cr.*, b.name AS branch_name
       FROM cash_registers cr
       JOIN branches b ON cr.branch_id = b.branch_id
       WHERE cr.cash_register_id = ? AND cr.branch_id = ? AND cr.is_active = 1
       FOR UPDATE`,
      [cashRegisterId, branchId]
    );
    if (registers.length === 0) throw new NotFoundError('Caja no encontrada');
    if (!registers[0].is_open) throw new ValidationError('La caja ya está cerrada');
    const register = registers[0];

    // [NUEVO] Join con users para tener el nombre del cajero para el reporte
    const [sessions] = await conn.query(
      `SELECT s.*, u.first_name, u.last_name
       FROM cash_register_sessions s
       JOIN users u ON s.user_id = u.user_id
       WHERE s.cash_register_id = ? AND s.closed_at IS NULL
       ORDER BY s.session_id DESC LIMIT 1`,
      [cashRegisterId]
    );
    if (sessions.length === 0) throw new NotFoundError('No hay sesión activa para esta caja');
    const session = sessions[0];

    const [movs] = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN movement_type IN ('sale','income','credit_payment','layaway_payment') THEN amount ELSE 0 END), 0) AS total_in,
         COALESCE(SUM(CASE WHEN movement_type IN ('expense','return') THEN amount ELSE 0 END), 0) AS total_out
       FROM cash_movements WHERE session_id = ?`,
      [session.session_id]
    );
    // [FIX] cash_movements ya incluye el retiro de este corte (el frontend
    // lo inserta con createCashMovement ANTES de llamar a este endpoint),
    // así que total_out ya lo trae descontado. "Efectivo esperado" debe
    // mostrar lo que debió quedar en caja por ventas y movimientos, SIN
    // contar todavía este retiro — se vuelve a sumar aquí para
    // reconstruir ese valor pre-retiro.
    const expectedAfterWithdrawal = session.open_amount + movs[0].total_in - movs[0].total_out;
    const expectedClose = expectedAfterWithdrawal + withdrawAmt;
    // "Saldo en caja": lo que físicamente queda en la caja después de
    // sacar el retiro. "Efectivo contado" (cashCounted) es lo que el
    // cajero contó ANTES de restar el retiro.
    const closeAmount = +(cashCounted - withdrawAmt).toFixed(2);
    const difference  = +(cashCounted - expectedClose).toFixed(2);

    // [NUEVO] Movimientos detallados de la sesión — para el reporte de corte
    const [movements] = await conn.query(
      `SELECT cm.movement_type, cm.amount, cm.description, cm.created_at,
              u.first_name AS user_name
       FROM cash_movements cm
       JOIN users u ON cm.user_id = u.user_id
       WHERE cm.session_id = ?
       ORDER BY cm.cash_movement_id ASC`,
      [session.session_id]
    );

    // [FIX] Total vendido por método de pago en esta sesión. Antes salía de
    // order_payments + un JOIN por cash_register_id/fecha — eso solo
    // cubría ventas normales del POS, y para apartados/créditos atribuía
    // mal el dinero (todo el historial de abonos aparecía en la sesión que
    // completó/canceló, no en la sesión real donde se cobró cada uno).
    // payment_events ya trae, para cada abono de CUALQUIER origen (venta,
    // apartado, crédito), la sesión exacta en que se cobró — así que aquí
    // basta filtrar por session_id, sin JOIN a orders ni rango de fechas.
    const [methodRows] = await conn.query(
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
    // [FIX] Antes se sobreescribía el total de la fila "cash" con
    // expectedClose (saldo neto del retiro) — por eso en "Ventas por método
    // de pago" el efectivo mostraba el saldo que quedó en caja después del
    // retiro, en vez de la suma real de ventas en efectivo. Ahora usa
    // siempre m.total, igual que los demás métodos.
    const paymentBreakdown = methodRows.map(m => ({
      payment_method_id: m.payment_method_id,
      code:               m.code,
      name:               m.name,
      total:              +Number(m.total).toFixed(2),
    }));

    // [NUEVO] Productos vendidos en la sesión + stock restante actual.
    // Nombre "Padre - Variante" se arma en el frontend con product_name/variant_label.
    const [productsSold] = await conn.query(
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
       WHERE o.cash_register_id = ? AND o.status = 'completed' AND o.created_at >= ?
       GROUP BY od.product_id, od.variant_id, p.name, pv.label, s.quantity
       ORDER BY total_sold DESC`,
      [cashRegisterId, session.opened_at]
    );

    // [NUEVO] Estadísticas generales de la sesión
    const [[salesStats]] = await conn.query(
      `SELECT COUNT(*) AS total_orders,
              COALESCE(SUM(total), 0) AS total_sales,
              COALESCE(SUM(discount), 0) AS total_discounts
       FROM orders
       WHERE cash_register_id = ? AND status = 'completed' AND created_at >= ?`,
      [cashRegisterId, session.opened_at]
    );
    const [[cancelledStats]] = await conn.query(
      `SELECT COUNT(*) AS cancelled_count
       FROM orders
       WHERE cash_register_id = ? AND status = 'cancelled' AND created_at >= ?`,
      [cashRegisterId, session.opened_at]
    );

    await conn.query(
      `UPDATE cash_register_sessions
       SET closed_at = NOW(), close_amount = ?
       WHERE session_id = ?`,
      [closeAmount, session.session_id]
    );

    await conn.query(
      `UPDATE cash_registers SET is_open = 0 WHERE cash_register_id = ?`,
      [cashRegisterId]
    );

    await conn.commit();

    const totalOrders = Number(salesStats.total_orders);

    return {
      sessionId:     session.session_id,
      openAmount:    session.open_amount,
      expectedClose: +expectedClose.toFixed(2),
      cashCounted:   +Number(cashCounted).toFixed(2),
      withdrawAmt:   +Number(withdrawAmt).toFixed(2),
      closeAmount,
      difference:    +difference.toFixed(2),

      // [NUEVO] Todo lo necesario para el reporte imprimible del corte —
      // se genera aquí porque una vez cerrada la sesión, getSessionStatus
      // ya no la encuentra (filtra closed_at IS NULL).
      branchName:   register.branch_name,
      registerName: register.name,
      cashierName:  `${session.first_name} ${session.last_name ?? ''}`.trim(),
      openedAt:     session.opened_at,
      closedAt:     new Date(),
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
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── Movimientos manuales ─────────────────────────────────────────────────────

const createMovement = async ({ cashRegisterId, branchId, userId, movementType, amount, description }) => {
  if (!['income', 'expense'].includes(movementType)) {
    throw new ValidationError('El tipo de movimiento debe ser "income" o "expense"');
  }
  if (amount <= 0) throw new ValidationError('El monto debe ser mayor a 0');

  const [sessions] = await db.query(
    `SELECT s.session_id FROM cash_register_sessions s
     JOIN cash_registers cr ON s.cash_register_id = cr.cash_register_id
     WHERE s.cash_register_id = ? AND cr.branch_id = ? AND s.closed_at IS NULL`,
    [cashRegisterId, branchId]
  );
  if (sessions.length === 0) {
    throw new ValidationError('No hay sesión activa en esta caja');
  }

  const [result] = await db.query(
    `INSERT INTO cash_movements (session_id, movement_type, amount, description, user_id)
     VALUES (?, ?, ?, ?, ?)`,
    [sessions[0].session_id, movementType, amount, description?.trim() ?? null, userId]
  );
  return { cashMovementId: result.insertId };
};

// ─── Estado de una sesión ─────────────────────────────────────────────────────

const getSessionStatus = async ({ cashRegisterId, branchId }) => {
  const [sessions] = await db.query(
    `SELECT s.*, u.first_name, u.last_name,
            cr.name AS register_name, b.name AS branch_name
     FROM cash_register_sessions s
     JOIN cash_registers cr ON s.cash_register_id = cr.cash_register_id
     JOIN branches b        ON cr.branch_id        = b.branch_id
     JOIN users u           ON s.user_id            = u.user_id
     WHERE s.cash_register_id = ? AND cr.branch_id = ? AND s.closed_at IS NULL`,
    [cashRegisterId, branchId]
  );
  if (sessions.length === 0) throw new NotFoundError('No hay sesión activa');
  const session = sessions[0];

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
      acc.total_in += m.amount;
    } else {
      acc.total_out += m.amount;
    }
    return acc;
  }, { total_in: 0, total_out: 0 });

  const expectedClose = +(session.open_amount + totals.total_in - totals.total_out).toFixed(2);

  // [FIX] Esperado por método de pago — para el corte de caja detallado.
  // Antes salía de order_payments + orders filtrado por cash_register_id y
  // fecha; eso dejaba fuera cualquier abono de apartados/créditos con
  // método distinto a efectivo (nunca tocaban orders), y cuando sí se
  // reflejaban (al completar un apartado) quedaban atribuidos a la sesión
  // equivocada. payment_events ya tiene, para cada cobro de cualquier
  // origen, la sesión real en que ocurrió — basta filtrar por session_id.
  const [methodRows] = await db.query(
    `SELECT pm.payment_method_id, pm.code, pm.name,
            COALESCE(SUM(pe.amount), 0) AS expected
     FROM payment_methods pm
     LEFT JOIN payment_events pe
       ON pe.payment_method_id = pm.payment_method_id
       AND pe.session_id = ?
     WHERE pm.is_active = 1
     GROUP BY pm.payment_method_id, pm.code, pm.name
     ORDER BY pm.name ASC`,
    [session.session_id]
  );

  // El renglón de efectivo usa expectedClose (incluye apertura + movimientos
  // manuales de entrada/salida); los demás métodos no tienen movimientos
  // manuales, así que su suma de order_payments ES su esperado completo.
  const paymentBreakdown = methodRows.map(m => ({
    payment_method_id: m.payment_method_id,
    code:               m.code,
    name:               m.name,
    expected:           m.code === 'cash' ? expectedClose : +Number(m.expected).toFixed(2),
  }));

  return {
    session,
    movements,
    paymentBreakdown,
    summary: {
      open_amount:    session.open_amount,
      total_in:       +totals.total_in.toFixed(2),
      total_out:      +totals.total_out.toFixed(2),
      expected_close: expectedClose,
    },
  };
};

module.exports = {
  getAllRegisters, createRegister, toggleRegisterStatus,
  openRegister, closeRegister,
  createMovement, getSessionStatus, updateRegister,
};