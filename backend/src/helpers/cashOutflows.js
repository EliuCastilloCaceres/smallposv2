// src/helpers/cashOutflows.js
//
// Piezas compartidas por los registros que sacan dinero del negocio: los
// gastos (specs/12-modulo-de-gastos.md) y las compras
// (specs/14-modulo-de-compras.md). Los dos piden una fecha que no sea futura,
// un método de pago activo sin Crédito, un proveedor y una sucursal activos,
// y pueden pagarse desde una caja abierta, con su reingreso al cancelarse
// mientras la sesión siga abierta.

const { ValidationError } = require('../errors/AppError');
const { todayInMexico } = require('../utils/timezone');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

const toFlag = (value) => value === true || value === 1 || value === '1' || value === 'true';

const optionalText = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

// Texto opcional con un máximo de caracteres (folio, notas)
const parseOptionalText = (value, max, tooLongMessage) => {
  const text = optionalText(value);
  if (text && text.length > max) throw new ValidationError(tooLongMessage);
  return text;
};

// Hoy o una fecha pasada, nunca futura. Sin fecha: hoy. noun: "del gasto",
// "de la compra".
const parseRecordDate = (value, noun) => {
  const today = todayInMexico();
  if (value === undefined || value === null || value === '') return today;
  if (!isValidDate(value)) throw new ValidationError(`La fecha ${noun} no es válida (YYYY-MM-DD)`);
  if (value > today) throw new ValidationError(`La fecha ${noun} no puede ser futura`);
  return value;
};

// Método de pago activo, sin Crédito (el que se da a clientes)
const findPaymentMethod = async (conn, id, creditMessage) => {
  const [[row]] = await conn.query(
    'SELECT payment_method_id, code FROM payment_methods WHERE payment_method_id = ? AND is_active = 1',
    [toId(id)]
  );
  if (!row) throw new ValidationError('El método de pago no existe o está inactivo');
  if (row.code === 'credit') throw new ValidationError(creditMessage);
  return row;
};

// { provider_id, name } de un proveedor activo, o null si no se mandó
const findActiveProvider = async (conn, id) => {
  if (id === undefined || id === null || id === '') return null;
  const [[row]] = await conn.query(
    'SELECT provider_id, name FROM providers WHERE provider_id = ? AND is_active = 1',
    [toId(id)]
  );
  if (!row) throw new ValidationError('El proveedor no existe o está inactivo');
  return row;
};

const assertActiveBranch = async (conn, branchId) => {
  const [[row]] = await conn.query(
    'SELECT branch_id FROM branches WHERE branch_id = ? AND is_active = 1',
    [branchId]
  );
  if (!row) throw new ValidationError('La sucursal no existe o está inactiva');
};

// Sesión abierta de una caja activa de la sucursal. FOR UPDATE: bloquea la
// caja como closeRegister, así el registro y el corte no se cruzan.
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

// Reingreso al cancelar un registro pagado desde caja (cashMovementId: su
// salida). Si la sesión de esa salida sigue abierta, crea en ella el
// movimiento movementType ('expense_refund', 'purchase_refund'). Devuelve
// refund: 'registered', 'session_closed' o null si no se pagó desde caja.
const registerRefund = async (conn, { cashMovementId, movementType, amount, description, userId }) => {
  if (cashMovementId === null) return { refund: null, refundMovementId: null };

  // Bloquea la caja de la sesión, como closeRegister, para que el corte no
  // se cruce con el reingreso
  const [[session]] = await conn.query(
    `SELECT s.session_id, s.closed_at
       FROM cash_movements cm
       JOIN cash_register_sessions s ON s.session_id = cm.session_id
       JOIN cash_registers cr        ON cr.cash_register_id = s.cash_register_id
      WHERE cm.cash_movement_id = ?
      FOR UPDATE`,
    [cashMovementId]
  );
  if (!session || session.closed_at !== null) return { refund: 'session_closed', refundMovementId: null };

  const [movement] = await conn.query(
    `INSERT INTO cash_movements (session_id, movement_type, amount, description, user_id)
     VALUES (?, ?, ?, ?, ?)`,
    [session.session_id, movementType, amount, description, userId]
  );
  return { refund: 'registered', refundMovementId: movement.insertId };
};

module.exports = {
  isValidDate,
  toId,
  toFlag,
  optionalText,
  parseOptionalText,
  parseRecordDate,
  findPaymentMethod,
  findActiveProvider,
  assertActiveBranch,
  lockOpenSession,
  registerRefund,
};
