// src/services/roleService.js
const db = require('../config/db');
const { NotFoundError, ConflictError, ValidationError, ForbiddenError } = require('../errors/AppError');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const assertAdmin = (requestingUser) => {
  if (requestingUser.branch_id !== null)
    throw new ForbiddenError('Solo el administrador central puede gestionar roles');
};

const validate = {
  name: (v) => {
    if (!v || typeof v !== 'string' || !v.trim())
      throw new ValidationError('El nombre del rol es requerido');
    if (v.trim().length > 50)
      throw new ValidationError('El nombre no puede superar los 50 caracteres');
    if (!/^[a-zA-Z0-9_\- ]+$/.test(v.trim()))
      throw new ValidationError('El nombre solo puede contener letras, números, espacios, guiones y guiones bajos');
  },
};

// Carga los permisos asignados a un rol como array de strings "module.action"
const getPermissionsByRoleId = async (roleId) => {
  const [rows] = await db.query(
    `SELECT p.permission_id, p.module, p.action, p.description
     FROM role_permissions rp
     JOIN permissions p ON rp.permission_id = p.permission_id
     WHERE rp.role_id = ?
     ORDER BY p.module, p.action`,
    [roleId]
  );
  return rows;
};

// ─── Roles ────────────────────────────────────────────────────────────────────

// GET /roles
// Todos los autenticados pueden leer — el frontend lo usa para poblar selects.
// Incluye los permisos de cada rol y el conteo de usuarios activos.

const getAllRoles = async ({ filters = {} } = {}) => {
  const { is_active } = filters;

  const conditions = [];
  const params     = [];

  if (is_active !== undefined && is_active !== '') {
    conditions.push('r.is_active = ?');
    params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await db.query(
    `SELECT
       r.role_id,
       r.name,
       r.description,
       r.is_active,
       COUNT(DISTINCT u.user_id) AS user_count
     FROM roles r
     LEFT JOIN users u ON u.role_id = r.role_id AND u.is_active = 1
     ${where}
     GROUP BY r.role_id
     ORDER BY r.role_id ASC`,
    params
  );

  // Cargar permisos de todos los roles en una sola query
  const roleIds = rows.map(r => r.role_id);
  let permissionsMap = {};

  if (roleIds.length > 0) {
    const [permRows] = await db.query(
      `SELECT rp.role_id, p.permission_id, p.module, p.action, p.description
       FROM role_permissions rp
       JOIN permissions p ON rp.permission_id = p.permission_id
       WHERE rp.role_id IN (?)
       ORDER BY p.module, p.action`,
      [roleIds]
    );
    // Agrupar por role_id
    permissionsMap = permRows.reduce((acc, row) => {
      if (!acc[row.role_id]) acc[row.role_id] = [];
      acc[row.role_id].push({
        permission_id: row.permission_id,
        module:        row.module,
        action:        row.action,
        description:   row.description,
      });
      return acc;
    }, {});
  }

  return rows.map(role => ({
    ...role,
    permissions: permissionsMap[role.role_id] ?? [],
  }));
};

// GET /roles/:id
const getRoleById = async (roleId) => {
  const [[role]] = await db.query(
    `SELECT
       r.role_id, r.name, r.description, r.is_active,
       COUNT(DISTINCT u.user_id) AS user_count
     FROM roles r
     LEFT JOIN users u ON u.role_id = r.role_id AND u.is_active = 1
     WHERE r.role_id = ?
     GROUP BY r.role_id`,
    [roleId]
  );

  if (!role) throw new NotFoundError('Rol no encontrado');

  const permissions = await getPermissionsByRoleId(roleId);
  return { ...role, permissions };
};

// POST /roles
const createRole = async ({ data, requestingUser }) => {
  assertAdmin(requestingUser);

  const { name, description } = data;
  validate.name(name);

  const [[existing]] = await db.query(
    'SELECT role_id FROM roles WHERE name = ?',
    [name.trim()]
  );
  if (existing) throw new ConflictError(`Ya existe un rol con el nombre "${name.trim()}"`);

  const [result] = await db.query(
    'INSERT INTO roles (name, description) VALUES (?, ?)',
    [name.trim(), description ?? null]
  );

  return getRoleById(result.insertId);
};

// PUT /roles/:id
const updateRole = async ({ roleId, data, requestingUser }) => {
  assertAdmin(requestingUser);

  await getRoleById(roleId); // verifica que existe

  const { name, description } = data;

  if (name !== undefined) {
    validate.name(name);
    const [[conflict]] = await db.query(
      'SELECT role_id FROM roles WHERE name = ? AND role_id != ?',
      [name.trim(), roleId]
    );
    if (conflict) throw new ConflictError(`Ya existe un rol con el nombre "${name.trim()}"`);
  }

  const fields = {
    ...(name        !== undefined && { name: name.trim() }),
    ...(description !== undefined && { description }),
  };

  if (Object.keys(fields).length === 0)
    throw new ValidationError('No se enviaron campos para actualizar');

  const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  await db.query(
    `UPDATE roles SET ${setClauses} WHERE role_id = ?`,
    [...Object.values(fields), roleId]
  );

  return getRoleById(roleId);
};

// PATCH /roles/:id/status
const toggleRoleStatus = async ({ roleId, is_active, requestingUser }) => {
  assertAdmin(requestingUser);

  const role = await getRoleById(roleId);

  if (role.is_active === (is_active ? 1 : 0))
    throw new ValidationError(`El rol ya está ${is_active ? 'activo' : 'inactivo'}`);

  await db.query(
    'UPDATE roles SET is_active = ? WHERE role_id = ?',
    [is_active ? 1 : 0, roleId]
  );

  // Advertir si hay usuarios activos con este rol
  let warning = null;
  if (!is_active && role.user_count > 0) {
    warning = `El rol fue desactivado pero ${role.user_count} usuario(s) activo(s) lo tienen asignado.`;
  }

  const updated = await getRoleById(roleId);
  return { ...updated, ...(warning && { warning }) };
};

// ─── Permisos ─────────────────────────────────────────────────────────────────

// GET /permissions
// Lista completa de permisos agrupados por módulo.
// Solo lectura — los permisos son un catálogo fijo definido en el schema.
// Para agregar permisos nuevos usar scripts de migración, no la UI.

const getAllPermissions = async () => {
  const [rows] = await db.query(
    `SELECT permission_id, module, action, description
     FROM permissions
     ORDER BY module, action`
  );

  // Agrupar por módulo para facilitar el render en el frontend
  const grouped = rows.reduce((acc, perm) => {
    if (!acc[perm.module]) acc[perm.module] = [];
    acc[perm.module].push(perm);
    return acc;
  }, {});

  return {
    flat:    rows,     // array plano — útil para checkboxes
    grouped,           // agrupado por módulo — útil para secciones en la UI
  };
};

// ─── Asignación de permisos ───────────────────────────────────────────────────

// PUT /roles/:id/permissions
// Reemplaza TODOS los permisos del rol en una sola transacción.
// El frontend manda el array completo de permission_ids que deben quedar asignados.
// Es más seguro que agregar/quitar uno por uno — no hay estados intermedios.

// REEMPLAZAR syncRolePermissions en roleService.js
// Solo esta función cambia — el resto del service queda igual.
// El problema: db.query('START TRANSACTION') y db.query('ROLLBACK') pueden
// ejecutarse en conexiones distintas del pool. Con getConnection() se garantiza
// que todas las queries van por la misma conexión física.

const syncRolePermissions = async ({ roleId, permissionIds, requestingUser }) => {
  assertAdmin(requestingUser);

  await getRoleById(roleId);

  if (!Array.isArray(permissionIds))
    throw new ValidationError('permissionIds debe ser un array');

  if (permissionIds.length > 0) {
    const [found] = await db.query(
      'SELECT permission_id FROM permissions WHERE permission_id IN (?)',
      [permissionIds]
    );
    if (found.length !== permissionIds.length)
      throw new ValidationError('Uno o más permission_ids no existen');
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      'DELETE FROM role_permissions WHERE role_id = ?',
      [roleId]
    );

    if (permissionIds.length > 0) {
      const values = permissionIds.map(pid => [roleId, pid]);
      await conn.query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ?',
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

  return getRoleById(roleId);
};

module.exports = {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  toggleRoleStatus,
  getAllPermissions,
  syncRolePermissions,
};
