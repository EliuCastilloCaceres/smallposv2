// src/services/expenseService.js
// Módulo de gastos (specs/12-modulo-de-gastos.md).
//
// - Un gasto guarda fecha, categoría, monto, descripción, sucursal, método de
//   pago (activos, sin Crédito), proveedor y folio opcionales, comprobante
//   opcional y quién lo registró.
// - "Pagado desde caja": solo con Efectivo, de hoy y de una caja con sesión
//   abierta de la sucursal. En la misma transacción se crea su salida en
//   cash_movements, de tipo 'expense', ligada al gasto (cash_movement_id).
// - No se edita: se cancela con motivo. Si se pagó desde caja y su sesión
//   sigue abierta, la cancelación registra el reingreso ('expense_refund');
//   si ya se cerró, se cancela sin reingreso.
// - Alcance por sucursal: un usuario con sucursal solo ve y registra los de
//   la suya (lo resuelve el controller); el admin central ve todas.

const db = require('../config/db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../errors/AppError');
const { todayInMexico } = require('../utils/timezone');
const { toFlag } = require('./expenseCategoryService');

const DESCRIPTION_MAX = 255;
const FOLIO_MAX = 50;
const REASON_MAX = 255;
const MOVEMENT_DESCRIPTION_MAX = 100; // cash_movements.description
const MAX_AMOUNT = 9999999999.99;    // decimal(12,2)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['active', 'cancelled', 'all'];

// ─── Validaciones ─────────────────────────────────────────────────────────────

const isValidDate = (value) => {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

const toId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const optionalText = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

const parseAmount = (value) => {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(n) || n <= 0) {
    throw new ValidationError('El monto debe ser mayor a 0');
  }
  if (n > MAX_AMOUNT) throw new ValidationError('El monto es demasiado grande');
  return Math.round(n * 100) / 100;
};

const parseDescription = (value) => {
  const text = optionalText(value);
  if (!text) throw new ValidationError('La descripción es requerida');
  if (text.length > DESCRIPTION_MAX) {
    throw new ValidationError(`La descripción no puede superar los ${DESCRIPTION_MAX} caracteres`);
  }
  return text;
};

const parseFolio = (value) => {
  const text = optionalText(value);
  if (text && text.length > FOLIO_MAX) {
    throw new ValidationError(`El folio no puede superar los ${FOLIO_MAX} caracteres`);
  }
  return text;
};

// Hoy o una fecha pasada, nunca futura (decisión 8). Sin fecha: hoy.
const parseExpenseDate = (value) => {
  const today = todayInMexico();
  if (value === undefined || value === null || value === '') return today;
  if (!isValidDate(value)) throw new ValidationError('La fecha del gasto no es válida (YYYY-MM-DD)');
  if (value > today) throw new ValidationError('La fecha del gasto no puede ser futura');
  return value;
};

const findActiveCategory = async (conn, id) => {
  const [[row]] = await conn.query(
    'SELECT expense_category_id, name FROM expense_categories WHERE expense_category_id = ? AND is_active = 1',
    [toId(id)]
  );
  if (!row) throw new ValidationError('La categoría de gasto no existe o está inactiva');
  return row;
};

const findPaymentMethod = async (conn, id) => {
  const [[row]] = await conn.query(
    'SELECT payment_method_id, code FROM payment_methods WHERE payment_method_id = ? AND is_active = 1',
    [toId(id)]
  );
  if (!row) throw new ValidationError('El método de pago no existe o está inactivo');
  if (row.code === 'credit') throw new ValidationError('Un gasto no se puede pagar con Crédito');
  return row;
};

const findActiveProvider = async (conn, id) => {
  if (id === undefined || id === null || id === '') return null;
  const [[row]] = await conn.query(
    'SELECT provider_id FROM providers WHERE provider_id = ? AND is_active = 1',
    [toId(id)]
  );
  if (!row) throw new ValidationError('El proveedor no existe o está inactivo');
  return row.provider_id;
};

const assertActiveBranch = async (conn, branchId) => {
  const [[row]] = await conn.query(
    'SELECT branch_id FROM branches WHERE branch_id = ? AND is_active = 1',
    [branchId]
  );
  if (!row) throw new ValidationError('La sucursal no existe o está inactiva');
};

// Sesión abierta de una caja activa de la sucursal. FOR UPDATE: bloquea la
// caja como closeRegister, así el gasto y el corte no se cruzan.
const lockOpenSession = async (conn, { cashRegisterId, branchId }) => {
  const [[row]] = await conn.query(
    `SELECT s.session_id
       FROM cash_register_sessions s
       JOIN cash_registers cr ON cr.cash_register_id = s.cash_register_id
      WHERE cr.cash_register_id = ? AND cr.branch_id = ? AND cr.is_active = 1
        AND s.closed_at IS NULL
      ORDER BY s.session_id DESC
      LIMIT 1
      FOR UPDATE`,
    [toId(cashRegisterId), branchId]
  );
  if (!row) throw new ValidationError('La caja no tiene una sesión abierta en esta sucursal');
  return row.session_id;
};

const movementDescription = (expenseId, categoryName, description) =>
  `Gasto #${expenseId}: ${categoryName} – ${description}`.slice(0, MOVEMENT_DESCRIPTION_MAX);

// ─── Lectura ──────────────────────────────────────────────────────────────────

const DETAIL_SQL = `
  SELECT e.expense_id, DATE_FORMAT(e.expense_date, '%Y-%m-%d') AS expense_date,
         e.amount, e.description, e.folio, e.status,
         e.branch_id, b.name AS branch_name,
         e.expense_category_id, ec.name AS category_name, ec.counts_in_net_profit,
         e.payment_method_id, pm.name AS payment_method_name, pm.code AS payment_method_code,
         e.provider_id, pv.name AS provider_name,
         e.receipt_file, e.receipt_name,
         e.created_at, CONCAT_WS(' ', cu.first_name, cu.last_name) AS created_by_name,
         e.cash_movement_id, cm.session_id, cr.name AS register_name, crs.closed_at AS session_closed_at,
         e.cancel_reason, e.cancelled_at, CONCAT_WS(' ', xu.first_name, xu.last_name) AS cancelled_by_name,
         e.refund_cash_movement_id
    FROM expenses e
    JOIN branches b            ON b.branch_id = e.branch_id
    JOIN expense_categories ec ON ec.expense_category_id = e.expense_category_id
    JOIN payment_methods pm    ON pm.payment_method_id = e.payment_method_id
    LEFT JOIN providers pv     ON pv.provider_id = e.provider_id
    JOIN users cu              ON cu.user_id = e.created_by
    LEFT JOIN users xu         ON xu.user_id = e.cancelled_by
    LEFT JOIN cash_movements cm          ON cm.cash_movement_id = e.cash_movement_id
    LEFT JOIN cash_register_sessions crs ON crs.session_id = cm.session_id
    LEFT JOIN cash_registers cr          ON cr.cash_register_id = crs.cash_register_id
`;

const toDetail = (r) => ({
  expense_id:          r.expense_id,
  expense_date:        r.expense_date,
  amount:              r.amount,
  description:         r.description,
  folio:               r.folio,
  status:              r.status,
  branch_id:           r.branch_id,
  branch_name:         r.branch_name,
  expense_category_id: r.expense_category_id,
  category_name:       r.category_name,
  counts_in_net_profit: r.counts_in_net_profit,
  payment_method_id:   r.payment_method_id,
  payment_method_name: r.payment_method_name,
  payment_method_code: r.payment_method_code,
  provider_id:         r.provider_id,
  provider_name:       r.provider_name,
  has_receipt:         r.receipt_file !== null,
  receipt_name:        r.receipt_name,
  created_at:          r.created_at,
  created_by_name:     r.created_by_name,
  paid_from_register:  r.cash_movement_id !== null,
  cash_movement:       r.cash_movement_id === null ? null : {
    cash_movement_id: r.cash_movement_id,
    session_id:       r.session_id,
    register_name:    r.register_name,
    session_open:     r.session_closed_at === null,
  },
  cancel_reason:       r.cancel_reason,
  cancelled_at:        r.cancelled_at,
  cancelled_by_name:   r.status === 'cancelled' ? r.cancelled_by_name : null,
  refund_registered:   r.refund_cash_movement_id !== null,
});

// branchId null = cualquier sucursal (admin central). Un gasto de otra
// sucursal responde igual que uno que no existe.
const findExpense = async (conn, { expenseId, branchId = null }) => {
  const params = [toId(expenseId)];
  let branchFilter = '';
  if (branchId !== null) { branchFilter = 'AND e.branch_id = ?'; params.push(branchId); }
  const [rows] = await conn.query(`${DETAIL_SQL} WHERE e.expense_id = ? ${branchFilter}`, params);
  if (rows.length === 0) throw new NotFoundError('Gasto no encontrado');
  return rows[0];
};

const getExpenseById = async ({ expenseId, branchId = null }) =>
  toDetail(await findExpense(db, { expenseId, branchId }));

// Archivo del comprobante: { fileName, originalName }
const getReceipt = async ({ expenseId, branchId = null }) => {
  const row = await findExpense(db, { expenseId, branchId });
  if (!row.receipt_file) throw new NotFoundError('El gasto no tiene comprobante');
  return { fileName: row.receipt_file, originalName: row.receipt_name };
};

// Lista con filtros y paginación. summary: total y número de los gastos
// ACTIVOS del filtro, sin importar el filtro de estado (requisito 25).
const listExpenses = async ({
  branchId = null, startDate, endDate, categoryId, paymentMethodId, providerId,
  status = 'active', search, page = 1, limit = 20,
}) => {
  if (!STATUSES.includes(status)) throw new ValidationError('El estado debe ser active, cancelled o all');
  if (startDate && !isValidDate(startDate)) throw new ValidationError('start_date no es una fecha válida (YYYY-MM-DD)');
  if (endDate && !isValidDate(endDate)) throw new ValidationError('end_date no es una fecha válida (YYYY-MM-DD)');
  if (startDate && endDate && startDate > endDate) {
    throw new ValidationError('start_date no puede ser posterior a end_date');
  }

  const where  = ['1=1'];
  const params = [];
  if (branchId !== null)  { where.push('e.branch_id = ?');           params.push(branchId); }
  if (startDate)          { where.push('e.expense_date >= ?');       params.push(startDate); }
  if (endDate)            { where.push('e.expense_date <= ?');       params.push(endDate); }
  if (toId(categoryId))   { where.push('e.expense_category_id = ?'); params.push(toId(categoryId)); }
  if (toId(paymentMethodId)) { where.push('e.payment_method_id = ?'); params.push(toId(paymentMethodId)); }
  if (toId(providerId))   { where.push('e.provider_id = ?');         params.push(toId(providerId)); }
  if (search && search.trim()) {
    where.push('(e.description LIKE ? OR e.folio LIKE ?)');
    const like = `%${search.trim()}%`;
    params.push(like, like);
  }
  const baseWhere = where.join(' AND ');

  const statusWhere  = status === 'all' ? '' : ' AND e.status = ?';
  const statusParams = status === 'all' ? [] : [status];

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const safePage  = Math.max(parseInt(page, 10) || 1, 1);

  const [rows] = await db.query(
    `SELECT e.expense_id, DATE_FORMAT(e.expense_date, '%Y-%m-%d') AS expense_date,
            e.amount, e.description, e.folio, e.status, e.created_at,
            e.branch_id, b.name AS branch_name,
            ec.name AS category_name, pm.name AS payment_method_name, pv.name AS provider_name,
            (e.cash_movement_id IS NOT NULL) AS paid_from_register,
            (e.receipt_file IS NOT NULL) AS has_receipt
       FROM expenses e
       JOIN branches b            ON b.branch_id = e.branch_id
       JOIN expense_categories ec ON ec.expense_category_id = e.expense_category_id
       JOIN payment_methods pm    ON pm.payment_method_id = e.payment_method_id
       LEFT JOIN providers pv     ON pv.provider_id = e.provider_id
      WHERE ${baseWhere}${statusWhere}
      ORDER BY e.expense_date DESC, e.created_at DESC, e.expense_id DESC
      LIMIT ? OFFSET ?`,
    [...params, ...statusParams, safeLimit, (safePage - 1) * safeLimit]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM expenses e WHERE ${baseWhere}${statusWhere}`,
    [...params, ...statusParams]
  );

  const [[summary]] = await db.query(
    `SELECT COUNT(*) AS count, COALESCE(SUM(e.amount), 0) AS total_amount
       FROM expenses e WHERE ${baseWhere} AND e.status = 'active'`,
    params
  );

  return {
    data: rows.map(r => ({ ...r, paid_from_register: !!r.paid_from_register, has_receipt: !!r.has_receipt })),
    pagination: {
      page:       safePage,
      limit:      safeLimit,
      total:      Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / safeLimit)),
    },
    summary: {
      count:        Number(summary.count),
      total_amount: +Number(summary.total_amount).toFixed(2),
    },
  };
};

// Datos para los formularios de gasto (módulo y POS), para que el cajero no
// necesite providers.read ni otros permisos de catálogo. branchId null
// (admin central): las cajas abiertas de todas las sucursales y la lista de
// sucursales activas para elegir.
const getOptions = async ({ branchId = null }) => {
  const [categories] = await db.query(
    `SELECT expense_category_id, name, counts_in_net_profit
       FROM expense_categories WHERE is_active = 1 ORDER BY name ASC`
  );
  const [paymentMethods] = await db.query(
    `SELECT payment_method_id, code, name
       FROM payment_methods WHERE is_active = 1 AND code <> 'credit' ORDER BY name ASC`
  );
  const [providers] = await db.query(
    'SELECT provider_id, name FROM providers WHERE is_active = 1 ORDER BY name ASC'
  );
  const [registers] = await db.query(
    `SELECT cr.cash_register_id, cr.name, cr.branch_id, b.name AS branch_name, s.session_id
       FROM cash_registers cr
       JOIN branches b ON b.branch_id = cr.branch_id
       JOIN cash_register_sessions s ON s.cash_register_id = cr.cash_register_id AND s.closed_at IS NULL
      WHERE cr.is_active = 1 ${branchId !== null ? 'AND cr.branch_id = ?' : ''}
      ORDER BY b.name ASC, cr.name ASC`,
    branchId !== null ? [branchId] : []
  );
  const result = { categories, payment_methods: paymentMethods, providers, registers };
  if (branchId === null) {
    const [branches] = await db.query(
      'SELECT branch_id, name FROM branches WHERE is_active = 1 ORDER BY name ASC'
    );
    result.branches = branches;
  }
  return result;
};

// ─── Registro ─────────────────────────────────────────────────────────────────

// canReadExpenses: sin expenses.read (el cajero) solo se aceptan gastos
// pagados desde caja (requisito 21). receipt: { fileName, originalName } del
// comprobante ya guardado, o null.
const createExpense = async ({ branchId, userId, canReadExpenses, data, receipt = null }) => {
  const paidFromRegister = toFlag(data.paid_from_register);
  if (!paidFromRegister && !canReadExpenses) {
    throw new ForbiddenError('Solo puedes registrar gastos pagados desde tu caja');
  }

  const amount      = parseAmount(data.amount);
  const description = parseDescription(data.description);
  const folio       = parseFolio(data.folio);
  const expenseDate = parseExpenseDate(data.expense_date);
  if (paidFromRegister && expenseDate !== todayInMexico()) {
    throw new ValidationError('Un gasto pagado desde caja es de hoy');
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await assertActiveBranch(conn, branchId);
    const category      = await findActiveCategory(conn, data.expense_category_id);
    const paymentMethod = await findPaymentMethod(conn, data.payment_method_id);
    const providerId    = await findActiveProvider(conn, data.provider_id);

    let sessionId = null;
    if (paidFromRegister) {
      if (paymentMethod.code !== 'cash') {
        throw new ValidationError('Solo un gasto en Efectivo se puede pagar desde caja');
      }
      if (!toId(data.cash_register_id)) throw new ValidationError('Elige la caja de la que sale el efectivo');
      sessionId = await lockOpenSession(conn, { cashRegisterId: data.cash_register_id, branchId });
    }

    const [result] = await conn.query(
      `INSERT INTO expenses
         (branch_id, expense_date, expense_category_id, amount, description, payment_method_id,
          provider_id, folio, receipt_file, receipt_name, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        branchId, expenseDate, category.expense_category_id, amount, description,
        paymentMethod.payment_method_id, providerId, folio,
        receipt?.fileName ?? null, receipt?.originalName ?? null, userId,
      ]
    );
    const expenseId = result.insertId;

    if (paidFromRegister) {
      const [movement] = await conn.query(
        `INSERT INTO cash_movements (session_id, movement_type, amount, description, user_id)
         VALUES (?, 'expense', ?, ?, ?)`,
        [sessionId, amount, movementDescription(expenseId, category.name, description), userId]
      );
      await conn.query(
        'UPDATE expenses SET cash_movement_id = ? WHERE expense_id = ?',
        [movement.insertId, expenseId]
      );
    }

    await conn.commit();
    return toDetail(await findExpense(db, { expenseId }));
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── Cancelación ──────────────────────────────────────────────────────────────

// refund: 'registered' si se registró el reingreso en la sesión abierta,
// 'session_closed' si se pagó desde caja pero su sesión ya se cerró, o null
// si no se pagó desde caja.
const cancelExpense = async ({ expenseId, branchId = null, userId, reason }) => {
  const cleanReason = optionalText(reason);
  if (!cleanReason) throw new ValidationError('El motivo de la cancelación es requerido');
  if (cleanReason.length > REASON_MAX) {
    throw new ValidationError(`El motivo no puede superar los ${REASON_MAX} caracteres`);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const params = [toId(expenseId)];
    let branchFilter = '';
    if (branchId !== null) { branchFilter = 'AND branch_id = ?'; params.push(branchId); }
    const [[expense]] = await conn.query(
      `SELECT expense_id, amount, status, cash_movement_id
         FROM expenses WHERE expense_id = ? ${branchFilter} FOR UPDATE`,
      params
    );
    if (!expense) throw new NotFoundError('Gasto no encontrado');
    if (expense.status === 'cancelled') throw new ValidationError('El gasto ya está cancelado');

    let refund = null;
    let refundMovementId = null;
    if (expense.cash_movement_id !== null) {
      // Bloquea la caja de la sesión, como closeRegister, para que el corte
      // no se cruce con el reingreso
      const [[session]] = await conn.query(
        `SELECT s.session_id, s.closed_at
           FROM cash_movements cm
           JOIN cash_register_sessions s ON s.session_id = cm.session_id
           JOIN cash_registers cr        ON cr.cash_register_id = s.cash_register_id
          WHERE cm.cash_movement_id = ?
          FOR UPDATE`,
        [expense.cash_movement_id]
      );
      if (session && session.closed_at === null) {
        const [movement] = await conn.query(
          `INSERT INTO cash_movements (session_id, movement_type, amount, description, user_id)
           VALUES (?, 'expense_refund', ?, ?, ?)`,
          [session.session_id, expense.amount, `Reingreso del gasto #${expense.expense_id}`, userId]
        );
        refundMovementId = movement.insertId;
        refund = 'registered';
      } else {
        refund = 'session_closed';
      }
    }

    await conn.query(
      `UPDATE expenses
          SET status = 'cancelled', cancel_reason = ?, cancelled_by = ?, cancelled_at = NOW(),
              refund_cash_movement_id = ?
        WHERE expense_id = ?`,
      [cleanReason, userId, refundMovementId, expense.expense_id]
    );

    await conn.commit();
    return { expense: toDetail(await findExpense(db, { expenseId: expense.expense_id })), refund };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = {
  listExpenses, getExpenseById, getReceipt, getOptions, createExpense, cancelExpense,
};
