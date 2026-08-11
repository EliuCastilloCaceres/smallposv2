// src/services/branchService.js
const db = require('../config/db');
const { NotFoundError, ConflictError, ValidationError, ForbiddenError } = require('../errors/AppError');
const { isCentralAdminOrAbove } = require('../helpers/roleHelpers');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRANCH_COLUMNS = `
  b.branch_id,
  b.name,
  b.address,
  b.state,
  b.city,
  b.zip_code,
  b.phone_number,
  b.is_active,
  b.created_at,
  b.updated_at
`;

const RECEIPT_COLUMNS = `
  br.receipt_id,
  br.store_name,
  br.address    AS receipt_address,
  br.rfc,
  br.phone      AS receipt_phone,
  br.logo_image,
  br.footer_text,
  br.is_active  AS receipt_is_active
`;

const withReceipt = (row) => {
  const { receipt_id, store_name, receipt_address, rfc,
          receipt_phone, logo_image, footer_text, receipt_is_active, ...branch } = row;

  return {
    ...branch,
    receipt: receipt_id
      ? { receipt_id, store_name, address: receipt_address, rfc,
          phone: receipt_phone, logo_image, footer_text, is_active: receipt_is_active }
      : null,
  };
};

const validate = {
  name: (v) => {
    if (!v || typeof v !== 'string' || !v.trim())
      throw new ValidationError('El nombre de la sucursal es requerido');
    if (v.trim().length > 100)
      throw new ValidationError('El nombre no puede superar los 100 caracteres');
  },
  phone: (v) => {
    if (v && !/^\+?[\d\s\-().]{7,15}$/.test(v))
      throw new ValidationError('El número de teléfono no tiene un formato válido');
  },
  zipCode: (v) => {
    if (v && !/^\d{4,10}$/.test(v))
      throw new ValidationError('El código postal no tiene un formato válido');
  },
  rfc: (v) => {
    if (v && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(v))
      throw new ValidationError('El RFC no tiene un formato válido');
  },
};

// Antes solo miraba branch_id === null (asumía que "central" == "admin").
// Ahora usa el helper compartido: exige rol admin/superadmin Y ser central.
const assertAdmin = (requestingUser) => {
  if (!isCentralAdminOrAbove(requestingUser))
    throw new ForbiddenError('Solo el administrador central puede gestionar sucursales');
};

// ─── getAll ───────────────────────────────────────────────────────────────────

const getAll = async ({ requestingUser, filters = {} }) => {
  const { is_active, search, page = 1, limit = 20 } = filters;

  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safePage  = Math.max(parseInt(page) || 1, 1);
  const offset    = (safePage - 1) * safeLimit;

  const conditions = [];
  const params     = [];

  if (requestingUser.branch_id !== null) {
    conditions.push('b.branch_id = ?');
    params.push(requestingUser.branch_id);
  }

  if (is_active !== undefined && is_active !== '') {
    conditions.push('b.is_active = ?');
    params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
  }

  if (search) {
    conditions.push('(b.name LIKE ? OR b.city LIKE ? OR b.state LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM branches b ${where}`,
    params
  );

  const [rows] = await db.query(
    `SELECT ${BRANCH_COLUMNS}, ${RECEIPT_COLUMNS}
     FROM branches b
     LEFT JOIN branch_receipts br ON b.branch_id = br.branch_id
     ${where}
     ORDER BY b.created_at ASC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  return {
    data: rows.map(withReceipt),
    pagination: {
      total,
      page:       safePage,
      limit:      safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
};

// ─── getById ──────────────────────────────────────────────────────────────────

const getById = async ({ branchId, requestingUser }) => {
  if (
    requestingUser.branch_id !== null &&
    parseInt(branchId) !== requestingUser.branch_id
  ) {
    throw new ForbiddenError('Sin acceso a esta sucursal');
  }

  const [rows] = await db.query(
    `SELECT ${BRANCH_COLUMNS}, ${RECEIPT_COLUMNS}
     FROM branches b
     LEFT JOIN branch_receipts br ON b.branch_id = br.branch_id
     WHERE b.branch_id = ?`,
    [branchId]
  );

  if (rows.length === 0) throw new NotFoundError('Sucursal no encontrada');

  return withReceipt(rows[0]);
};

// ─── create ───────────────────────────────────────────────────────────────────

const create = async ({ data, requestingUser }) => {
  assertAdmin(requestingUser);

  const { name, address, state, city, zip_code, phone_number, receipt } = data;

  validate.name(name);
  validate.phone(phone_number);
  validate.zipCode(zip_code);

  const [[existing]] = await db.query(
    'SELECT branch_id FROM branches WHERE name = ?',
    [name.trim()]
  );
  if (existing) throw new ConflictError(`Ya existe una sucursal con el nombre "${name.trim()}"`);

  await db.query('START TRANSACTION');
  try {
    const [result] = await db.query(
      `INSERT INTO branches (name, address, state, city, zip_code, phone_number)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name.trim(), address ?? null, state ?? null, city ?? null, zip_code ?? null, phone_number ?? null]
    );

    const newBranchId = result.insertId;

    if (receipt) {
      await _upsertReceipt({ branchId: newBranchId, data: receipt });
    }

    await db.query('COMMIT');
    return getById({ branchId: newBranchId, requestingUser: { branch_id: null } });
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
};

// ─── update ───────────────────────────────────────────────────────────────────

const update = async ({ branchId, data, requestingUser }) => {
  assertAdmin(requestingUser);

  await getById({ branchId, requestingUser: { branch_id: null } });

  const { name, address, state, city, zip_code, phone_number } = data;

  if (name !== undefined) {
    validate.name(name);
    const [[conflict]] = await db.query(
      'SELECT branch_id FROM branches WHERE name = ? AND branch_id != ?',
      [name.trim(), branchId]
    );
    if (conflict) throw new ConflictError(`Ya existe una sucursal con el nombre "${name.trim()}"`);
  }

  if (phone_number !== undefined) validate.phone(phone_number);
  if (zip_code     !== undefined) validate.zipCode(zip_code);

  const fields = {
    ...(name         !== undefined && { name: name.trim() }),
    ...(address      !== undefined && { address }),
    ...(state        !== undefined && { state }),
    ...(city         !== undefined && { city }),
    ...(zip_code     !== undefined && { zip_code }),
    ...(phone_number !== undefined && { phone_number }),
  };

  if (Object.keys(fields).length === 0)
    throw new ValidationError('No se enviaron campos para actualizar');

  const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  await db.query(
    `UPDATE branches SET ${setClauses} WHERE branch_id = ?`,
    [...Object.values(fields), branchId]
  );

  return getById({ branchId, requestingUser: { branch_id: null } });
};

// ─── toggleStatus ─────────────────────────────────────────────────────────────

const toggleStatus = async ({ branchId, is_active, requestingUser }) => {
  assertAdmin(requestingUser);

  const branch = await getById({ branchId, requestingUser: { branch_id: null } });

  if (branch.is_active === (is_active ? 1 : 0))
    throw new ValidationError(`La sucursal ya está ${is_active ? 'activa' : 'inactiva'}`);

  await db.query(
    'UPDATE branches SET is_active = ? WHERE branch_id = ?',
    [is_active ? 1 : 0, branchId]
  );

  let warning = null;
  if (!is_active) {
    const [[{ activeUsers }]] = await db.query(
      'SELECT COUNT(*) AS activeUsers FROM users WHERE branch_id = ? AND is_active = 1',
      [branchId]
    );
    if (activeUsers > 0) {
      warning = `La sucursal fue desactivada pero aún tiene ${activeUsers} usuario(s) activo(s) asignado(s).`;
    }
  }

  const updated = await getById({ branchId, requestingUser: { branch_id: null } });
  return { ...updated, ...(warning && { warning }) };
};

// ─── upsertReceipt ────────────────────────────────────────────────────────────

const _upsertReceipt = async ({ branchId, data }) => {
  const { store_name, address, rfc, phone, logo_image, footer_text } = data;

  if (!store_name || !store_name.trim())
    throw new ValidationError('El nombre del negocio (store_name) es requerido para el recibo');

  validate.rfc(rfc);
  validate.phone(phone);

  await db.query(
    `INSERT INTO branch_receipts
       (branch_id, store_name, address, rfc, phone, logo_image, footer_text)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       store_name  = VALUES(store_name),
       address     = VALUES(address),
       rfc         = VALUES(rfc),
       phone       = VALUES(phone),
       logo_image  = VALUES(logo_image),
       footer_text = VALUES(footer_text)`,
    [
      branchId,
      store_name.trim(),
      address    ?? null,
      rfc        ?? null,
      phone      ?? null,
      logo_image ?? null,
      footer_text ?? null,
    ]
  );
};

const upsertReceipt = async ({ branchId, data, requestingUser }) => {
  assertAdmin(requestingUser);
  await getById({ branchId, requestingUser: { branch_id: null } });
  await _upsertReceipt({ branchId, data });
  return getById({ branchId, requestingUser: { branch_id: null } });
};

module.exports = { getAll, getById, create, update, toggleStatus, upsertReceipt };