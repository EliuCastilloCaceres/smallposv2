// src/services/userService.js
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db     = require('../config/db');
const { NotFoundError, ConflictError, ValidationError, ForbiddenError } = require('../errors/AppError');
const {
  PROTECTED_ROLES,
  BRANCH_BOUND_ROLES,
  isSuperadmin,
  isCentralAdminOrAbove,
  canAssignRole,
  canViewUsers,
  canCreateUser,
  canEditUser,
  canDeleteOrDeactivateUser,
} = require('../helpers/roleHelpers');

const SALT_ROUNDS = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Ninguna decisión de jerarquía/permisos vive aquí: todo eso se delega a
// roleHelpers. Lo de abajo es solo acceso a datos y validación de formato.

const SAFE_COLUMNS = `
  u.user_id,
  u.first_name,
  u.last_name,
  u.username,
  u.position,
  u.address,
  u.zip_code,
  u.state,
  u.city,
  u.phone_number,
  u.profile_image,
  u.is_active,
  u.created_at,
  u.updated_at,
  u.role_id,
  r.name  AS role_name,
  u.branch_id,
  b.name  AS branch_name
`;

const BASE_JOIN = `
  FROM users u
  JOIN roles    r ON u.role_id   = r.role_id
  LEFT JOIN branches b ON u.branch_id = b.branch_id
`;

// Uso INTERNO para decisiones de autorización. Nunca devolver este objeto
// al cliente (con includeHash trae password_hash).
const getUserWithRole = async (userId, { includeHash = false } = {}) => {
  const [[user]] = await db.query(
    `SELECT u.user_id, u.role_id, u.branch_id, u.is_active,
            ${includeHash ? 'u.password_hash,' : ''}
            r.name AS role_name
     FROM users u
     JOIN roles r ON u.role_id = r.role_id
     WHERE u.user_id = ?`,
    [userId]
  );
  return user || null;
};

// Lectura sin scoping de sucursal. Reemplaza el patrón anterior de llamar
// getById con un requestingUser falso `{ branch_id: null }` para saltarse
// el scoping.
const fetchUser = async (userId) => {
  const [rows] = await db.query(
    `SELECT ${SAFE_COLUMNS} ${BASE_JOIN} WHERE u.user_id = ?`,
    [userId]
  );
  return rows[0] || null;
};

// Antes duplicado en create() y update().
const getActiveRole = async (roleId) => {
  const [[role]] = await db.query(
    'SELECT role_id, name FROM roles WHERE role_id = ? AND is_active = 1',
    [roleId]
  );
  if (!role) throw new ValidationError('El rol especificado no existe o está inactivo');
  return role;
};

// Antes solo existía en create(); update() no validaba la sucursal destino.
const assertBranchActive = async (branchId) => {
  const [[branch]] = await db.query(
    'SELECT branch_id FROM branches WHERE branch_id = ? AND is_active = 1',
    [branchId]
  );
  if (!branch) throw new ValidationError('La sucursal especificada no existe o está inactiva');
};

// undefined/null → null (central). Cualquier otro valor debe ser entero > 0.
// Normaliza también "3" vs 3, que antes hacía fallar comparaciones con !==.
const parseBranchId = (v) => {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError('El branch_id debe ser un entero positivo o null');
  return n;
};

const clean = (v) => (typeof v === 'string' ? v.trim() : v);

const generateTempPassword = () => {
  const words = ['Mango', 'Limon', 'Fresa', 'Melon', 'Uva', 'Pera', 'Kiwi', 'Mora'];
  const word1 = words[crypto.randomInt(0, words.length)];
  const word2 = words[crypto.randomInt(0, words.length)];
  const num   = crypto.randomInt(100, 999);
  return `${word1}${word2}${num}!`;
};

const validate = {
  username: (v) => {
    if (!v || typeof v !== 'string') throw new ValidationError('El username es requerido');
    if (v.length < 3 || v.length > 45) throw new ValidationError('El username debe tener entre 3 y 45 caracteres');
    if (!/^[a-zA-Z0-9_.-]+$/.test(v)) throw new ValidationError('El username solo puede contener letras, números, puntos, guiones y guiones bajos');
  },
  password: (v) => {
    if (!v || typeof v !== 'string') throw new ValidationError('La contraseña es requerida');
    if (v.length < 8) throw new ValidationError('La contraseña debe tener al menos 8 caracteres');
    if (!/[A-Z]/.test(v)) throw new ValidationError('La contraseña debe tener al menos una mayúscula');
    if (!/[0-9]/.test(v)) throw new ValidationError('La contraseña debe tener al menos un número');
  },
  roleId: (v) => {
    if (!v || !Number.isInteger(Number(v))) throw new ValidationError('El role_id es requerido y debe ser un número');
  },
};

// ─── getAll ───────────────────────────────────────────────────────────────────
// canViewUsers exige el permiso users.read. El ALCANCE (a cuáles ve) sigue
// basado en branch_id, no en roleHelpers: cualquier rol con el permiso ve su
// propia sucursal; solo quien tiene branch_id null (central/superadmin) puede
// pedir otra sucursal o el listado completo.

const getAll = async ({ requestingUser, filters = {} }) => {
  if (!canViewUsers(requestingUser)) {
    throw new ForbiddenError('No tienes permiso para ver usuarios');
  }

  const {
    branch_id,
    role_id,
    is_active,
    search,
    page  = 1,
    limit = 20,
  } = filters;

  const safeLimit  = Math.min(Math.max(parseInt(limit, 10)  || 20,  1), 100);
  const safePage   = Math.max(parseInt(page, 10) || 1, 1);
  const offset     = (safePage - 1) * safeLimit;

  const conditions = [];
  const params     = [];

  if (requestingUser.branch_id !== null) {
    conditions.push('u.branch_id = ?');
    params.push(requestingUser.branch_id);
  } else if (branch_id) {
    conditions.push('u.branch_id = ?');
    params.push(branch_id);
  }

  if (role_id)    { conditions.push('u.role_id = ?');   params.push(role_id); }
  if (is_active !== undefined && is_active !== '') {
    conditions.push('u.is_active = ?');
    params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
  }
  if (search) {
    conditions.push('(u.username LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total ${BASE_JOIN} ${where}`,
    params
  );

  const [rows] = await db.query(
    `SELECT ${SAFE_COLUMNS} ${BASE_JOIN} ${where}
     ORDER BY u.created_at DESC
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

// ─── getById ──────────────────────────────────────────────────────────────────

const getById = async ({ userId, requestingUser }) => {
  if (!canViewUsers(requestingUser)) {
    throw new ForbiddenError('No tienes permiso para ver usuarios');
  }

  const user = await fetchUser(userId);
  if (!user) throw new NotFoundError('Usuario no encontrado');

  if (
    requestingUser.branch_id !== null &&
    user.branch_id !== requestingUser.branch_id
  ) {
    throw new ForbiddenError('Sin acceso a este usuario');
  }

  return user;
};

// ─── create ───────────────────────────────────────────────────────────────────
// canCreateUser (roleHelpers) decide TODO en una sola llamada:
//  · permiso RBAC users.create (el rol por sí solo no autoriza nada);
//  · canAssignRole: superadmin nunca; admin solo superadmin/admin central;
//  · alcance: superadmin/admin central en cualquier sucursal (o central);
//    cualquier otro con el permiso, solo en SU sucursal.
// Cambio de comportamiento: quien manda un branch_id fuera de su alcance
// ahora recibe 403 (antes se le ignoraba en silencio).

const create = async ({ data, requestingUser }) => {
  const {
    first_name,
    last_name,
    username,
    password,
    role_id,
    branch_id,
    position,
    address,
    zip_code,
    state,
    city,
    phone_number,
  } = data;

  const cleanUsername = clean(username);
  validate.username(cleanUsername);
  validate.roleId(role_id);

  let tempPassword  = null;
  let plainPassword = password;

  if (!plainPassword) {
    tempPassword  = generateTempPassword();
    plainPassword = tempPassword;
  } else {
    validate.password(plainPassword);
  }

  const role = await getActiveRole(role_id);

  // Sucursal destino: superadmin/admin central eligen libremente (null =
  // central); los demás heredan la suya si no mandan ninguna.
  const targetBranchId = parseBranchId(
    isCentralAdminOrAbove(requestingUser)
      ? branch_id
      : (branch_id ?? requestingUser.branch_id)
  );

  if (!canCreateUser(requestingUser, { role_name: role.name, branch_id: targetBranchId })) {
    throw new ForbiddenError('No tienes permiso para crear este tipo de usuario en esa sucursal');
  }

  if (BRANCH_BOUND_ROLES.includes(role.name) && targetBranchId === null) {
    throw new ValidationError(`El rol ${role.name} requiere una sucursal asignada`);
  }

  if (targetBranchId !== null) await assertBranchActive(targetBranchId);

  const [[existing]] = await db.query(
    'SELECT user_id FROM users WHERE username = ?',
    [cleanUsername]
  );
  if (existing) throw new ConflictError(`El username "${cleanUsername}" ya está en uso`);

  const passwordHash = await bcrypt.hash(plainPassword, SALT_ROUNDS);

  const [result] = await db.query(
    `INSERT INTO users
       (first_name, last_name, username, password_hash, role_id, branch_id,
        position, address, zip_code, state, city, phone_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      first_name   ?? null,
      last_name    ?? null,
      cleanUsername,
      passwordHash,
      role.role_id,
      targetBranchId,
      position     ?? null,
      address      ?? null,
      zip_code     ?? null,
      state        ?? null,
      city         ?? null,
      phone_number ?? null,
    ]
  );

  const newUser = await fetchUser(result.insertId);

  return tempPassword
    ? { ...newUser, temp_password: tempPassword }
    : newUser;
};

// ─── update ───────────────────────────────────────────────────────────────────
// Reglas (todas vienen de roleHelpers):
//  · canEditUser: permiso RBAC users.update + alcance + anti-escalada
//    (un rol no-admin con users.update NO puede editar a un admin).
//  · canAssignRole: al cambiar de rol (superadmin nunca; admin solo central).
//  · Cambiar sucursal: solo superadmin/admin central, y nunca la del
//    superadmin. Quien no tenga alcance global y mande un branch_id distinto
//    al actual recibe 403.
//  · Nadie cambia su propio rol.
//  · Roles ligados a sucursal (cajero/almacenista) nunca quedan con
//    branch_id null: se valida UNA vez con el rol y la sucursal finales.

const update = async ({ userId, data, requestingUser }) => {
  const targetUser = await getUserWithRole(userId);
  if (!targetUser) throw new NotFoundError('Usuario no encontrado');

  if (!canEditUser(requestingUser, targetUser)) {
    throw new ForbiddenError('No tienes permiso para editar a este usuario');
  }

  const {
    username,
    role_id,
    branch_id,
    first_name,
    last_name,
    position,
    address,
    zip_code,
    state,
    city,
    phone_number,
    profile_image,
  } = data;

  const isSelf = requestingUser.user_id === targetUser.user_id;
  const fields = {};

  // ── username ──
  if (username !== undefined) {
    const cleanUsername = clean(username);
    validate.username(cleanUsername);

    const [[conflict]] = await db.query(
      'SELECT user_id FROM users WHERE username = ? AND user_id != ?',
      [cleanUsername, targetUser.user_id]
    );
    if (conflict) throw new ConflictError(`El username "${cleanUsername}" ya está en uso`);

    fields.username = cleanUsername;
  }

  // ── rol ──
  let finalRoleName = targetUser.role_name;

  if (role_id !== undefined) {
    validate.roleId(role_id);

    if (Number(role_id) !== targetUser.role_id) {
      if (isSelf) {
        throw new ForbiddenError('No puedes cambiar tu propio rol');
      }
      // Defensa en profundidad: hoy el superadmin solo es editable por sí
      // mismo (y ya cayó arriba), pero PROTECTED_ROLES puede crecer.
      if (PROTECTED_ROLES.includes(targetUser.role_name)) {
        throw new ForbiddenError(`No se puede cambiar el rol de un usuario ${targetUser.role_name}`);
      }

      const newRole = await getActiveRole(role_id);
      if (!canAssignRole(requestingUser, newRole.name)) {
        throw new ForbiddenError(`No tienes permiso para asignar el rol ${newRole.name}`);
      }

      finalRoleName = newRole.name;
      fields.role_id = newRole.role_id;
    }
  }

  // ── sucursal ──
  let finalBranchId = targetUser.branch_id;

  if (branch_id !== undefined) {
    const newBranchId = parseBranchId(branch_id);

    if (newBranchId !== targetUser.branch_id) {
      if (isSuperadmin(targetUser)) {
        throw new ForbiddenError('No se puede cambiar la sucursal del superadmin');
      }
      if (!isCentralAdminOrAbove(requestingUser)) {
        throw new ForbiddenError('Solo el superadmin o un admin central puede cambiar la sucursal de un usuario');
      }
      if (newBranchId !== null) await assertBranchActive(newBranchId);

      finalBranchId = newBranchId;
      fields.branch_id = newBranchId;
    }
  }

  if (BRANCH_BOUND_ROLES.includes(finalRoleName) && finalBranchId === null) {
    throw new ValidationError(`El rol ${finalRoleName} requiere una sucursal asignada`);
  }

  // ── campos simples ──
  const simple = { first_name, last_name, position, address, zip_code, state, city, phone_number, profile_image };
  for (const [key, value] of Object.entries(simple)) {
    if (value !== undefined) fields[key] = value;
  }

  if (Object.keys(fields).length === 0) {
    throw new ValidationError('No se enviaron campos para actualizar');
  }

  const setClauses = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  const values     = [...Object.values(fields), targetUser.user_id];

  await db.query(`UPDATE users SET ${setClauses} WHERE user_id = ?`, values);

  return fetchUser(targetUser.user_id);
};

// ─── changePassword ───────────────────────────────────────────────────────────
// Si no es el propio usuario, se exige lo mismo que en update() (canEditUser:
// permiso users.update + alcance + anti-escalada). El propio usuario SIEMPRE
// puede cambiar su contraseña sin necesitar users.update, pero debe dar su
// contraseña actual (por eso el bypass explícito por isSelf).

const changePassword = async ({ userId, data, requestingUser }) => {
  const { current_password, new_password } = data;

  validate.password(new_password);

  // Una sola query (antes eran dos: getUserWithRole + SELECT password_hash).
  const targetUser = await getUserWithRole(userId, { includeHash: true });
  if (!targetUser || !targetUser.is_active) throw new NotFoundError('Usuario no encontrado');

  const isSelf = requestingUser.user_id === targetUser.user_id;

  if (!isSelf && !canEditUser(requestingUser, targetUser)) {
    throw new ForbiddenError('No tienes permiso para cambiar la contraseña de este usuario');
  }

  if (isSelf) {
    if (!current_password) throw new ValidationError('La contraseña actual es requerida');
    const valid = await bcrypt.compare(current_password, targetUser.password_hash);
    if (!valid) throw new ValidationError('La contraseña actual es incorrecta');
  }

  const sameAsOld = await bcrypt.compare(new_password, targetUser.password_hash);
  if (sameAsOld) throw new ValidationError('La nueva contraseña no puede ser igual a la actual');

  const newHash = await bcrypt.hash(new_password, SALT_ROUNDS);

  await db.query(
    'UPDATE users SET password_hash = ? WHERE user_id = ?',
    [newHash, targetUser.user_id]
  );

  await db.query(
    'UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW() WHERE user_id = ? AND revoked = 0',
    [targetUser.user_id]
  );

  return { message: 'Contraseña actualizada correctamente. Se cerraron todas las sesiones activas.' };
};

// ─── toggleStatus ─────────────────────────────────────────────────────────────
// canDeleteOrDeactivateUser ya cubre: superadmin inmortal, nadie se
// desactiva a sí mismo, y la jerarquía completa para el resto. Aquí solo se
// conserva el mensaje específico de auto-desactivación (mejor UX); se
// eliminó el chequeo propio de superadmin, que duplicaba al helper.

const toggleStatus = async ({ userId, is_active, requestingUser }) => {
  const targetUser = await getUserWithRole(userId);
  if (!targetUser) throw new NotFoundError('Usuario no encontrado');

  if (requestingUser.user_id === targetUser.user_id && !is_active) {
    throw new ValidationError('No puedes desactivar tu propia cuenta');
  }

  if (!canDeleteOrDeactivateUser(requestingUser, targetUser)) {
    throw new ForbiddenError('No tienes permiso para cambiar el estado de este usuario');
  }

  await db.query(
    'UPDATE users SET is_active = ? WHERE user_id = ?',
    [is_active ? 1 : 0, targetUser.user_id]
  );

  if (!is_active) {
    await db.query(
      'UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW() WHERE user_id = ? AND revoked = 0',
      [targetUser.user_id]
    );
  }

  return fetchUser(targetUser.user_id);
};

module.exports = { getAll, getById, create, update, changePassword, toggleStatus };