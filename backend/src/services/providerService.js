// src/services/providerService.js

const db = require('../config/db');
const { NotFoundError, ConflictError, ValidationError } = require('../errors/AppError');

const GENERIC_PROVIDER_ID = 1;

// ─── Columnas seguras (una sola fuente de verdad) ─────────────────────────────
const SAFE_COLUMNS = `
  provider_id, name, rfc, zip_code, address,
  state, city, phone_number, email, is_active, created_at, updated_at
`;

// ─── Validaciones reutilizables ───────────────────────────────────────────────
const validate = {
  name: (v) => {
    if (!v?.trim()) throw new ValidationError('El nombre del proveedor es requerido');
    if (v.trim().length < 2) throw new ValidationError('El nombre debe tener al menos 2 caracteres');
  },
  rfc: (v) => {
    if (v && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(v.trim()))
      throw new ValidationError('El RFC no tiene un formato válido');
  },
  email: (v) => {
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()))
      throw new ValidationError('El email no tiene un formato válido');
  },
  phone: (v) => {
    if (v && !/^\+?[\d\s\-().]{7,15}$/.test(v.trim()))
      throw new ValidationError('El número de teléfono no tiene un formato válido');
  },
};

// ─── getAllProviders ───────────────────────────────────────────────────────────
// Con paginación, búsqueda por nombre/RFC y filtro de estado.

const getAllProviders = async ({ filters = {} } = {}) => {
  const {
    search,
    is_active,
    page  = 1,
    limit = 20,
  } = filters;

  // limit=all — para selects/dropdowns que necesitan el catálogo completo,
  // sin paginación. El resto de la función (listado administrativo paginado)
  // no cambia.
  const fetchAll  = limit === 'all';
  const safeLimit = fetchAll ? null : Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safePage  = fetchAll ? 1    : Math.max(parseInt(page) || 1, 1);
  const offset    = fetchAll ? 0    : (safePage - 1) * safeLimit;

  const conditions = [];
  const params     = [];

  if (is_active !== undefined && is_active !== '') {
    conditions.push('is_active = ?');
    params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
  }

  if (search) {
    conditions.push('(name LIKE ? OR rfc LIKE ? OR email LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM providers ${where}`,
    params
  );

  const limitClause = fetchAll ? '' : 'LIMIT ? OFFSET ?';
  const queryParams  = fetchAll ? params : [...params, safeLimit, offset];

  const [rows] = await db.query(
    `SELECT ${SAFE_COLUMNS}
     FROM providers
     ${where}
     ORDER BY provider_id DESC
     ${limitClause}`,
    queryParams
  );

  return {
    data: rows,
    pagination: {
      total,
      page:       safePage,
      limit:      fetchAll ? total : safeLimit,
      totalPages: fetchAll ? 1 : Math.ceil(total / safeLimit),
    },
  };
};

// ─── getProviderById ──────────────────────────────────────────────────────────
// Sin filtro de is_active — permite acceder a proveedores inactivos
// para reactivarlos o ver su historial.

const getProviderById = async (providerId) => {
  const [rows] = await db.query(
    `SELECT ${SAFE_COLUMNS} FROM providers WHERE provider_id = ?`,
    [providerId]
  );
  if (rows.length === 0) throw new NotFoundError('Proveedor no encontrado');
  return rows[0];
};

// ─── createProvider ───────────────────────────────────────────────────────────

const createProvider = async ({ name, rfc, zipCode, address, state, city, phoneNumber, email }) => {
  validate.name(name);
  validate.rfc(rfc);
  validate.email(email);
  validate.phone(phoneNumber);

  const [result] = await db.query(
    `INSERT INTO providers (name, rfc, zip_code, address, state, city, phone_number, email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name.trim(),
      rfc?.trim()         ?? null,
      zipCode?.trim()     ?? null,
      address?.trim()     ?? null,
      state?.trim()       ?? null,
      city?.trim()        ?? null,
      phoneNumber?.trim() ?? null,
      email?.trim()       ?? null,
    ]
  );

  return getProviderById(result.insertId);
};

// ─── updateProvider ───────────────────────────────────────────────────────────

const updateProvider = async (providerId, updates) => {
  await getProviderById(providerId);

  if (updates.name       !== undefined) validate.name(updates.name);
  if (updates.rfc        !== undefined) validate.rfc(updates.rfc);
  if (updates.email      !== undefined) validate.email(updates.email);
  if (updates.phoneNumber !== undefined) validate.phone(updates.phoneNumber);

  const allowed = {
    name:         updates.name?.trim(),
    rfc:          updates.rfc?.trim(),
    zip_code:     updates.zipCode?.trim(),
    address:      updates.address?.trim(),
    state:        updates.state?.trim(),
    city:         updates.city?.trim(),
    phone_number: updates.phoneNumber?.trim(),
    email:        updates.email?.trim(),
  };

  const setClauses = [];
  const values     = [];
  for (const [col, val] of Object.entries(allowed)) {
    if (val !== undefined) { setClauses.push(`${col} = ?`); values.push(val); }
  }

  if (setClauses.length === 0)
    throw new ValidationError('No se enviaron campos para actualizar');

  values.push(providerId);
  await db.query(
    `UPDATE providers SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE provider_id = ?`,
    values
  );

  // Devolver el registro actualizado — una sola fuente de verdad
  return getProviderById(providerId);
};

// ─── toggleStatus ─────────────────────────────────────────────────────────────
// Reemplaza deactivateProvider — ahora también permite reactivar.
// Al desactivar, reasigna los productos al proveedor genérico (transacción).

const toggleStatus = async (providerId, is_active) => {
  if (providerId === GENERIC_PROVIDER_ID)
    throw new ConflictError('No se puede modificar el proveedor genérico');

  await getProviderById(providerId);

  // Al desactivar: reasignar productos en la misma transacción
  if (!is_active) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `UPDATE products SET provider_id = ? WHERE provider_id = ?`,
        [GENERIC_PROVIDER_ID, providerId]
      );

      await conn.query(
        `UPDATE providers SET is_active = 0, updated_at = NOW() WHERE provider_id = ?`,
        [providerId]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } else {
    // Reactivar — sin necesidad de transacción
    await db.query(
      `UPDATE providers SET is_active = 1, updated_at = NOW() WHERE provider_id = ?`,
      [providerId]
    );
  }

  return getProviderById(providerId);
};

// ─── getProviderProducts ──────────────────────────────────────────────────────
// Productos asignados a este proveedor — solo catálogo, sin stock
// (products es global, ya no aplica filtrar/mostrar por sucursal aquí).

const getProviderProducts = async (providerId) => {
  await getProviderById(providerId);

  const [rows] = await db.query(
    `SELECT product_id, name, sku, sale_price, purchase_price, is_active, is_variable
     FROM products
     WHERE provider_id = ?
     ORDER BY name ASC`,
    [providerId]
  );

  return rows;
};

module.exports = {
  getAllProviders,
  getProviderById,
  createProvider,
  updateProvider,
  toggleStatus,
  getProviderProducts,
};