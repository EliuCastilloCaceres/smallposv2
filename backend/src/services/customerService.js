// src/services/customerService.js
const db = require('../config/db');
const { NotFoundError, ConflictError, ValidationError } = require('../errors/AppError');

// ID del cliente genérico (público general) — nunca se modifica ni elimina
const GENERIC_CUSTOMER_ID = 1;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SAFE_COLUMNS = `
  customer_id, first_name, last_name, address, state, city,
  zip_code, phone_number, rfc, email,
  credit_limit, credit_balance, is_active, created_at, updated_at
`;

const validate = {
  email: (v) => {
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
      throw new ValidationError('El email no tiene un formato válido');
  },
  rfc: (v) => {
    if (v && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(v))
      throw new ValidationError('El RFC no tiene un formato válido');
  },
  creditLimit: (v) => {
    if (v !== undefined && v !== null && (isNaN(v) || Number(v) < 0))
      throw new ValidationError('El límite de crédito debe ser un número mayor o igual a 0');
  },
};

// ─── getAllCustomers ───────────────────────────────────────────────────────────
// Soporta paginación, búsqueda y filtro por estado.

const getAllCustomers = async ({ filters = {} } = {}) => {
  const {
    search,
    is_active,
    page  = 1,
    limit = 20,
  } = filters;

  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safePage  = Math.max(parseInt(page) || 1, 1);
  const offset    = (safePage - 1) * safeLimit;

  const conditions = [];
  const params     = [];

  if (is_active !== undefined && is_active !== '') {
    conditions.push('is_active = ?');
    params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
  }

  if (search) {
    conditions.push(`(
      first_name   LIKE ? OR
      last_name    LIKE ? OR
      phone_number LIKE ? OR
      email        LIKE ? OR
      rfc          LIKE ?
    )`);
    const like = `%${search}%`;
    params.push(like, like, like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM customers ${where}`,
    params
  );

  const [rows] = await db.query(
    `SELECT ${SAFE_COLUMNS}
     FROM customers
     ${where}
     ORDER BY customer_id DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  return {
    data: rows,
    pagination: {
      total,
      page:       safePage,
      limit:      safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
};

// ─── getCustomerById ──────────────────────────────────────────────────────────
// No filtra por is_active para poder acceder a clientes inactivos
// (ej. al reactivarlos o ver su historial).

const getCustomerById = async (customerId) => {
  const [rows] = await db.query(
    `SELECT ${SAFE_COLUMNS} FROM customers WHERE customer_id = ?`,
    [customerId]
  );
  if (rows.length === 0) throw new NotFoundError('Cliente no encontrado');
  return rows[0];
};

// ─── getGenericCustomerId ─────────────────────────────────────────────────────

const getGenericCustomerId = () => GENERIC_CUSTOMER_ID;

// ─── createCustomer ───────────────────────────────────────────────────────────

const createCustomer = async ({
  first_name, last_name, address, state, city,
  zip_code, phone_number, rfc, email, credit_limit,
}) => {
  validate.email(email);
  validate.rfc(rfc);
  validate.creditLimit(credit_limit);

  // Email único si se provee
  if (email?.trim()) {
    const [[existing]] = await db.query(
      'SELECT customer_id FROM customers WHERE email = ?',
      [email.trim()]
    );
    if (existing) throw new ConflictError(`El email "${email.trim()}" ya está registrado`);
  }

  const [result] = await db.query(
    `INSERT INTO customers
       (first_name, last_name, address, state, city,
        zip_code, phone_number, rfc, email, credit_limit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      first_name?.trim()    ?? null,
      last_name?.trim()     ?? null,
      address?.trim()       ?? null,
      state?.trim()         ?? null,
      city?.trim()          ?? null,
      zip_code?.trim()      ?? null,
      phone_number?.trim()  ?? null,
      rfc?.trim()           ?? null,
      email?.trim()         ?? null,
      credit_limit          ?? 0,
    ]
  );

  return getCustomerById(result.insertId);
};

// ─── updateCustomer ───────────────────────────────────────────────────────────
// canEditCredit: booleano que el controller pasa según el permiso 'credit.create'
// del usuario solicitante. Evita que un cajero sin permiso modifique credit_limit.

const updateCustomer = async (customerId, updates, { canEditCredit = false } = {}) => {
  if (customerId === GENERIC_CUSTOMER_ID)
    throw new ConflictError('No se puede modificar el cliente genérico');

  await getCustomerById(customerId);

  if (updates.email !== undefined) validate.email(updates.email);
  if (updates.rfc   !== undefined) validate.rfc(updates.rfc);

  // Verificar email único si cambió
  if (updates.email?.trim()) {
    const [[conflict]] = await db.query(
      'SELECT customer_id FROM customers WHERE email = ? AND customer_id != ?',
      [updates.email.trim(), customerId]
    );
    if (conflict) throw new ConflictError(`El email "${updates.email.trim()}" ya está registrado`);
  }

  const allowed = {
    first_name:   updates.first_name?.trim()   ?? undefined,
    last_name:    updates.last_name?.trim()    ?? undefined,
    address:      updates.address?.trim()      ?? undefined,
    state:        updates.state?.trim()        ?? undefined,
    city:         updates.city?.trim()         ?? undefined,
    zip_code:     updates.zip_code?.trim()     ?? undefined,
    phone_number: updates.phone_number?.trim() ?? undefined,
    rfc:          updates.rfc?.trim()          ?? undefined,
    email:        updates.email?.trim()        ?? undefined,
  };

  // credit_limit solo si tiene permiso
  if (canEditCredit && updates.credit_limit !== undefined) {
    validate.creditLimit(updates.credit_limit);
    allowed.credit_limit = Number(updates.credit_limit);
  }

  const setClauses = [];
  const values     = [];
  for (const [col, val] of Object.entries(allowed)) {
    if (val !== undefined) { setClauses.push(`${col} = ?`); values.push(val); }
  }

  if (setClauses.length === 0)
    throw new ValidationError('No se enviaron campos para actualizar');

  values.push(customerId);
  await db.query(
    `UPDATE customers SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE customer_id = ?`,
    values
  );

  return getCustomerById(customerId);
};

// ─── toggleStatus ─────────────────────────────────────────────────────────────

const toggleStatus = async (customerId, is_active) => {
  if (customerId === GENERIC_CUSTOMER_ID)
    throw new ConflictError('No se puede desactivar el cliente genérico');

  await getCustomerById(customerId);

  await db.query(
    'UPDATE customers SET is_active = ?, updated_at = NOW() WHERE customer_id = ?',
    [is_active ? 1 : 0, customerId]
  );

  return getCustomerById(customerId);
};

// ─── Historial ────────────────────────────────────────────────────────────────

// Últimas órdenes del cliente
const getCustomerOrders = async (customerId, { limit = 10 } = {}) => {
  await getCustomerById(customerId);

  const safeLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 50);

  const [rows] = await db.query(
    `SELECT
       o.order_id, o.total, o.subtotal, o.discount,
       o.payment_method, o.status, o.created_at,
       b.name AS branch_name,
       u.username AS seller
     FROM orders o
     LEFT JOIN branches b ON o.branch_id = b.branch_id
     LEFT JOIN users    u ON o.user_id   = u.user_id
     WHERE o.customer_id = ?
     ORDER BY o.created_at DESC
     LIMIT ?`,
    [customerId, safeLimit]
  );
  return rows;
};

// Créditos del cliente
const getCustomerCredits = async (customerId) => {
  await getCustomerById(customerId);

  const [rows] = await db.query(
    `SELECT
       cs.credit_sale_id, cs.total_amount, cs.amount_paid,
       cs.balance, cs.due_date, cs.status, cs.created_at,
       o.total AS order_total,
       b.name  AS branch_name
     FROM credit_sales cs
     JOIN orders   o ON cs.order_id  = o.order_id
     JOIN branches b ON o.branch_id  = b.branch_id
     WHERE cs.customer_id = ?
     ORDER BY cs.created_at DESC`,
    [customerId]
  );
  return rows;
};

// Apartados del cliente
const getCustomerLayaways = async (customerId) => {
  await getCustomerById(customerId);

  const [rows] = await db.query(
    `SELECT
       l.layaway_id, l.total_amount, l.amount_paid,
       l.balance, l.due_date, l.status, l.notes, l.created_at,
       b.name      AS branch_name,
       u.username  AS created_by
     FROM layaways l
     JOIN branches b ON l.branch_id = b.branch_id
     JOIN users    u ON l.user_id   = u.user_id
     WHERE l.customer_id = ?
     ORDER BY l.created_at DESC`,
    [customerId]
  );
  return rows;
};

module.exports = {
  getAllCustomers,
  getCustomerById,
  getGenericCustomerId,
  createCustomer,
  updateCustomer,
  toggleStatus,
  getCustomerOrders,
  getCustomerCredits,
  getCustomerLayaways,
};
