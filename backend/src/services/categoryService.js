// src/services/categoryService.js
const db = require('../config/db');
const { NotFoundError, ConflictError, ValidationError, ForbiddenError } = require('../errors/AppError');
const { isCentralAdminOrAbove, isCentralAdminOrBranchAdmin } = require('../helpers/roleHelpers');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SAFE_COLUMNS = `
  c.category_id,
  c.name,
  c.description,
  c.color,
  c.is_active,
  c.created_at,
  c.updated_at
`;

const validate = {
  name: (v) => {
    if (!v || typeof v !== 'string' || !v.trim())
      throw new ValidationError('El nombre de la categoría es requerido');
    if (v.trim().length > 100)
      throw new ValidationError('El nombre no puede superar los 100 caracteres');
  },
  color: (v) => {
    if (v && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v))
      throw new ValidationError('El color debe ser un valor hexadecimal válido (#fff o #ffffff)');
  },
};

// Solo admin central puede crear/editar/desactivar categorías globales.
// Antes solo miraba branch_id === null; ahora usa el helper compartido.
const assertAdmin = (requestingUser) => {
  if (!isCentralAdminOrAbove(requestingUser))
    throw new ForbiddenError('Solo el administrador central puede gestionar categorías');
};

// Para configurar QUÉ categorías se ven en el POS de una sucursal: el admin
// central puede gestionar cualquier sucursal; el admin de esa sucursal puede
// gestionar la suya.
// FIX: antes no verificaba el rol en absoluto — cualquier usuario autenticado
// de esa sucursal (un cajero, por ejemplo) pasaba este chequeo con solo
// coincidir el branch_id. Ahora exige que sea admin (central o de esa
// sucursal específica).
const assertCanManageBranch = (requestingUser, branchId) => {
  if (!isCentralAdminOrBranchAdmin(requestingUser, branchId)) {
    throw new ForbiddenError('No puedes gestionar las categorías de esta sucursal');
  }
};

// ─── getAll ───────────────────────────────────────────────────────────────────

const getAll = async ({ filters = {} } = {}) => {
  const { is_active, search, page = 1, limit = 50 } = filters;

  const fetchAll  = limit === 'all';

  const safeLimit = fetchAll ? null  : Math.min(Math.max(parseInt(limit) || 50, 1), 200);
  const safePage  = fetchAll ? 1     : Math.max(parseInt(page) || 1, 1);
  const offset    = fetchAll ? 0     : (safePage - 1) * safeLimit;

  const conditions = [];
  const params     = [];

  if (is_active !== undefined && is_active !== '') {
    conditions.push('c.is_active = ?');
    params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
  }

  if (search) {
    conditions.push('(c.name LIKE ? OR c.description LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM categories c ${where}`,
    params
  );

  const limitClause = fetchAll ? '' : 'LIMIT ? OFFSET ?';
  const queryParams  = fetchAll ? params : [...params, safeLimit, offset];

  const [rows] = await db.query(
    `SELECT ${SAFE_COLUMNS},
       (SELECT COUNT(*) FROM products p
        WHERE p.category_id = c.category_id AND p.is_active = 1) AS product_count
     FROM categories c
     ${where}
     ORDER BY c.name ASC
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

// ─── getById ──────────────────────────────────────────────────────────────────

const getById = async (categoryId) => {
  const [rows] = await db.query(
    `SELECT ${SAFE_COLUMNS},
       (SELECT COUNT(*) FROM products p
        WHERE p.category_id = c.category_id AND p.is_active = 1) AS product_count
     FROM categories c
     WHERE c.category_id = ?`,
    [categoryId]
  );

  if (rows.length === 0) throw new NotFoundError('Categoría no encontrada');

  return rows[0];
};

// ─── create ───────────────────────────────────────────────────────────────────

const create = async ({ data, requestingUser }) => {
  assertAdmin(requestingUser);

  const { name, description, color } = data;

  validate.name(name);
  validate.color(color);

  const [[existing]] = await db.query(
    'SELECT category_id FROM categories WHERE name = ?',
    [name.trim()]
  );
  if (existing) throw new ConflictError(`Ya existe una categoría con el nombre "${name.trim()}"`);

  const [result] = await db.query(
    `INSERT INTO categories (name, description, color)
     VALUES (?, ?, ?)`,
    [name.trim(), description ?? null, color ?? null]
  );

  return getById(result.insertId);
};

// ─── update ───────────────────────────────────────────────────────────────────

const update = async ({ categoryId, data, requestingUser }) => {
  assertAdmin(requestingUser);

  await getById(categoryId);

  const { name, description, color } = data;

  if (name !== undefined) {
    validate.name(name);
    const [[conflict]] = await db.query(
      'SELECT category_id FROM categories WHERE name = ? AND category_id != ?',
      [name.trim(), categoryId]
    );
    if (conflict) throw new ConflictError(`Ya existe una categoría con el nombre "${name.trim()}"`);
  }

  if (color !== undefined) validate.color(color);

  const fields = {
    ...(name        !== undefined && { name: name.trim() }),
    ...(description !== undefined && { description }),
    ...(color       !== undefined && { color }),
  };

  if (Object.keys(fields).length === 0)
    throw new ValidationError('No se enviaron campos para actualizar');

  const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  await db.query(
    `UPDATE categories SET ${setClauses} WHERE category_id = ?`,
    [...Object.values(fields), categoryId]
  );

  return getById(categoryId);
};

// ─── toggleStatus ─────────────────────────────────────────────────────────────

const toggleStatus = async ({ categoryId, is_active, requestingUser }) => {
  assertAdmin(requestingUser);

  const category = await getById(categoryId);

  if (category.is_active === (is_active ? 1 : 0))
    throw new ValidationError(`La categoría ya está ${is_active ? 'activa' : 'inactiva'}`);

  await db.query(
    'UPDATE categories SET is_active = ? WHERE category_id = ?',
    [is_active ? 1 : 0, categoryId]
  );

  let warning = null;
  if (!is_active && category.product_count > 0) {
    warning = `La categoría fue desactivada pero ${category.product_count} producto(s) activo(s) aún la tienen asignada.`;
  }

  const updated = await getById(categoryId);
  return { ...updated, ...(warning && { warning }) };
};

// ─── Visibilidad por sucursal (para POS) ───────────────────────────────────────

const getVisibilityForBranch = async (branchId) => {
  const [hiddenRows] = await db.query(
    'SELECT category_id FROM branch_hidden_categories WHERE branch_id = ?',
    [branchId]
  );
  const hiddenIds = new Set(hiddenRows.map(r => r.category_id));

  const [categories] = await db.query(
    'SELECT category_id, name, color FROM categories WHERE is_active = 1 ORDER BY name ASC'
  );

  return categories.map(c => ({ ...c, visible: !hiddenIds.has(c.category_id) }));
};

const getVisibleForBranch = async (branchId) => {
  const [rows] = await db.query(
    `SELECT c.category_id, c.name, c.color
     FROM categories c
     WHERE c.is_active = 1
       AND NOT EXISTS (
         SELECT 1 FROM branch_hidden_categories bhc
         WHERE bhc.branch_id = ? AND bhc.category_id = c.category_id
       )
     ORDER BY c.name ASC`,
    [branchId]
  );
  return rows;
};

const setHiddenForBranch = async ({ branchId, hiddenCategoryIds, requestingUser }) => {
  assertCanManageBranch(requestingUser, branchId);

  if (!Array.isArray(hiddenCategoryIds))
    throw new ValidationError('hiddenCategoryIds debe ser un array');

  if (hiddenCategoryIds.length > 0) {
    const [found] = await db.query(
      'SELECT category_id FROM categories WHERE category_id IN (?)',
      [hiddenCategoryIds]
    );
    if (found.length !== hiddenCategoryIds.length)
      throw new ValidationError('Uno o más category_ids no existen');
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query('DELETE FROM branch_hidden_categories WHERE branch_id = ?', [branchId]);

    if (hiddenCategoryIds.length > 0) {
      const values = hiddenCategoryIds.map(cid => [branchId, cid]);
      await conn.query(
        'INSERT INTO branch_hidden_categories (branch_id, category_id) VALUES ?',
        [values]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return getVisibilityForBranch(branchId);
};

module.exports = {
  getAll, getById, create, update, toggleStatus,
  getVisibilityForBranch, getVisibleForBranch, setHiddenForBranch,
};