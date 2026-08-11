// src/services/paymentMethodService.js
const db = require('../config/db');
const { NotFoundError, ConflictError, ValidationError, ForbiddenError } = require('../errors/AppError');
const { isCentralAdminOrAbove } = require('../helpers/roleHelpers');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const validate = {
  code: (v) => {
    if (!v || typeof v !== 'string' || !v.trim())
      throw new ValidationError('El código del método de pago es requerido');
    if (!/^[a-z][a-z0-9_]{1,29}$/.test(v.trim()))
      throw new ValidationError('El código debe ser minúsculas/números/guion bajo, empezar con letra (ej: "cash", "store_credit")');
  },
  name: (v) => {
    if (!v || typeof v !== 'string' || !v.trim())
      throw new ValidationError('El nombre del método de pago es requerido');
    if (v.trim().length > 50)
      throw new ValidationError('El nombre no puede superar los 50 caracteres');
  },
};

// Solo admin central puede gestionar el catálogo — es global, no por sucursal.
// FIX: antes solo miraba branch_id === null (asumía que "central" == "admin",
// sin verificar el rol). Ahora usa el helper compartido: exige rol
// admin/superadmin Y ser central — mismo fix aplicado en branchService y
// categoryService.
const assertAdmin = (requestingUser) => {
  if (!isCentralAdminOrAbove(requestingUser))
    throw new ForbiddenError('Solo el administrador central puede gestionar métodos de pago');
};

// Cuenta en cuántos pagos (de las 3 tablas de detalle) se usa un método,
// para advertir antes de desactivarlo — mismo patrón que category.product_count.
const countUsage = async (paymentMethodId) => {
  const [[row]] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM order_payments          WHERE payment_method_id = ?) +
       (SELECT COUNT(*) FROM credit_payment_details   WHERE payment_method_id = ?) +
       (SELECT COUNT(*) FROM layaway_payment_details  WHERE payment_method_id = ?)
       AS usage_count`,
    [paymentMethodId, paymentMethodId, paymentMethodId]
  );
  return row.usage_count;
};

// ─── getAll ───────────────────────────────────────────────────────────────────
// Todos los autenticados pueden leer — el POS/checkout lo usa para poblar
// las opciones de pago. Catálogo pequeño: sin paginación.

const getAll = async ({ filters = {} } = {}) => {
  const { is_active } = filters;

  const conditions = [];
  const params     = [];

  if (is_active !== undefined && is_active !== '') {
    conditions.push('is_active = ?');
    params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await db.query(
    `SELECT payment_method_id, code, name, is_active FROM payment_methods ${where} ORDER BY name ASC`,
    params
  );

  return { data: rows };
};

// ─── getById ──────────────────────────────────────────────────────────────────

const getById = async (paymentMethodId) => {
  const [rows] = await db.query(
    'SELECT payment_method_id, code, name, is_active FROM payment_methods WHERE payment_method_id = ?',
    [paymentMethodId]
  );
  if (rows.length === 0) throw new NotFoundError('Método de pago no encontrado');
  return rows[0];
};

// ─── create ───────────────────────────────────────────────────────────────────

const create = async ({ data, requestingUser }) => {
  assertAdmin(requestingUser);

  const { code, name } = data;
  validate.code(code);
  validate.name(name);

  const [[existing]] = await db.query(
    'SELECT payment_method_id FROM payment_methods WHERE code = ?',
    [code.trim().toLowerCase()]
  );
  if (existing) throw new ConflictError(`Ya existe un método de pago con el código "${code.trim()}"`);

  const [result] = await db.query(
    'INSERT INTO payment_methods (code, name) VALUES (?, ?)',
    [code.trim().toLowerCase(), name.trim()]
  );

  return getById(result.insertId);
};

// ─── update ───────────────────────────────────────────────────────────────────
// NOTA: a propósito solo se permite editar `name`, no `code`. El código es
// el identificador estable que el resto del sistema usa para lógica (ej.
// reconciliación de caja filtrando payment_methods.code = 'cash'); permitir
// renombrarlo después de creado invitaría a romper esas suposiciones en
// silencio. Si necesitas otro código, crea un método nuevo y desactiva el viejo.

const update = async ({ paymentMethodId, data, requestingUser }) => {
  assertAdmin(requestingUser);

  await getById(paymentMethodId);

  const { name } = data;
  validate.name(name);

  await db.query(
    'UPDATE payment_methods SET name = ? WHERE payment_method_id = ?',
    [name.trim(), paymentMethodId]
  );

  return getById(paymentMethodId);
};

// ─── toggleStatus ─────────────────────────────────────────────────────────────

const toggleStatus = async ({ paymentMethodId, is_active, requestingUser }) => {
  assertAdmin(requestingUser);

  const method = await getById(paymentMethodId);

  if (method.is_active === (is_active ? 1 : 0))
    throw new ValidationError(`El método de pago ya está ${is_active ? 'activo' : 'inactivo'}`);

  await db.query(
    'UPDATE payment_methods SET is_active = ? WHERE payment_method_id = ?',
    [is_active ? 1 : 0, paymentMethodId]
  );

  let warning = null;
  if (!is_active) {
    const usageCount = await countUsage(paymentMethodId);
    if (usageCount > 0) {
      warning = `El método fue desactivado pero tiene ${usageCount} pago(s) históricos registrados con él.`;
    }
  }

  const updated = await getById(paymentMethodId);
  return { ...updated, ...(warning && { warning }) };
};

module.exports = { getAll, getById, create, update, toggleStatus };