// src/services/userService.js
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db     = require('../config/db');
const { NotFoundError, ConflictError, ValidationError, ForbiddenError } = require('../errors/AppError');
const {
  PROTECTED_ROLES,
  canEditUser,
  canDeleteOrDeactivateUser,
} = require('../helpers/roleHelpers');

const SALT_ROUNDS = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const getUserWithRole = async (userId) => {
  const [[user]] = await db.query(
    `SELECT u.user_id, u.role_id, u.branch_id, r.name AS role_name, r.is_system
     FROM users u
     JOIN roles r ON u.role_id = r.role_id
     WHERE u.user_id = ?`,
    [userId]
  );
  return user || null;
};

// Concepto genérico "opera desde central" (branch_id null), independiente
// del rol — se usa para decidir defaults de sucursal al crear/editar, no
// para chequeos de jerarquía de gestión (eso vive en roleHelpers).
const isCentral = (user) => user.branch_id === null;

const generateTempPassword = () => {
  const words = ['Mango', 'Limon', 'Fresa', 'Melon', 'Uva', 'Pera', 'Kiwi', 'Mora'];
  const word1  = words[Math.floor(Math.random() * words.length)];
  const word2  = words[Math.floor(Math.random() * words.length)];
  const num    = crypto.randomInt(100, 999);
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

const getAll = async ({ requestingUser, filters = {} }) => {
  const {
    branch_id,
    role_id,
    is_active,
    search,
    page  = 1,
    limit = 20,
  } = filters;

  const safeLimit  = Math.min(Math.max(parseInt(limit)  || 20,  1), 100);
  const safePage   = Math.max(parseInt(page) || 1, 1);
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
  const [rows] = await db.query(
    `SELECT ${SAFE_COLUMNS} ${BASE_JOIN} WHERE u.user_id = ?`,
    [userId]
  );

  if (rows.length === 0) throw new NotFoundError('Usuario no encontrado');

  const user = rows[0];

  if (
    requestingUser.branch_id !== null &&
    user.branch_id !== requestingUser.branch_id
  ) {
    throw new ForbiddenError('Sin acceso a este usuario');
  }

  return user;
};

// ─── create ───────────────────────────────────────────────────────────────────

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

  validate.username(username?.trim());
  validate.roleId(role_id);

  let tempPassword      = null;
  let plainPassword     = password;

  if (!plainPassword) {
    tempPassword  = generateTempPassword();
    plainPassword = tempPassword;
  } else {
    validate.password(plainPassword);
  }

  const [[role]] = await db.query(
    'SELECT role_id, name FROM roles WHERE role_id = ? AND is_active = 1',
    [role_id]
  );
  if (!role) throw new ValidationError('El rol especificado no existe o está inactivo');

  if (role.name === 'superadmin') {
    throw new ForbiddenError('El rol superadmin no puede asignarse a nuevos usuarios');
  }

  if (role.name === 'admin' && !isCentral(requestingUser)) {
    throw new ForbiddenError('Solo el administrador central puede crear usuarios con rol admin');
  }

  const effectiveBranchId = isCentral(requestingUser)
    ? (branch_id ?? null)
    : requestingUser.branch_id;

  if (['cajero', 'almacenista'].includes(role.name) && effectiveBranchId === null) {
    throw new ValidationError(`El rol ${role.name} requiere una sucursal asignada`);
  }

  if (!isCentral(requestingUser) && effectiveBranchId === null) {
    throw new ForbiddenError('No puedes crear usuarios sin sucursal');
  }

  if (effectiveBranchId !== null) {
    const [[branch]] = await db.query(
      'SELECT branch_id FROM branches WHERE branch_id = ? AND is_active = 1',
      [effectiveBranchId]
    );
    if (!branch) throw new ValidationError('La sucursal especificada no existe o está inactiva');
  }

  const [[existing]] = await db.query(
    'SELECT user_id FROM users WHERE username = ?',
    [username.trim()]
  );
  if (existing) throw new ConflictError(`El username "${username.trim()}" ya está en uso`);

  const passwordHash = await bcrypt.hash(plainPassword, SALT_ROUNDS);

  const [result] = await db.query(
    `INSERT INTO users
       (first_name, last_name, username, password_hash, role_id, branch_id,
        position, address, zip_code, state, city, phone_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      first_name   ?? null,
      last_name    ?? null,
      username.trim(),
      passwordHash,
      role_id,
      effectiveBranchId,
      position     ?? null,
      address      ?? null,
      zip_code     ?? null,
      state        ?? null,
      city         ?? null,
      phone_number ?? null,
    ]
  );

  const newUser = await getById({ userId: result.insertId, requestingUser: { branch_id: null } });

  return tempPassword
    ? { ...newUser, temp_password: tempPassword }
    : newUser;
};

// ─── update ───────────────────────────────────────────────────────────────────
// FIX: antes solo se protegía al superadmin de forma ad-hoc y se aplicaba
// scoping de sucursal genérico (sin verificar que quien edita sea admin).
// Ahora se usa canEditUser, que implementa la jerarquía completa:
//  · superadmin: solo él mismo se edita.
//  · admin central: solo otro admin central o superadmin.
//  · admin de sucursal / demás roles: superadmin, admin central, o el
//    admin de esa misma sucursal.

const update = async ({ userId, data, requestingUser }) => {
  const targetUser = await getUserWithRole(userId);
  if (!targetUser) throw new NotFoundError('Usuario no encontrado');

  if (!canEditUser(requestingUser, targetUser)) {
    throw new ForbiddenError('No tienes permiso para editar a este usuario');
  }

  const {
    first_name,
    last_name,
    username,
    role_id,
    branch_id,
    position,
    address,
    zip_code,
    state,
    city,
    phone_number,
    profile_image,
  } = data;
  
  // nadie puede cambiar su propio rol
  if (
    requestingUser.user_id === parseInt(userId) &&
    role_id !== undefined &&
    Number(role_id) !== targetUser.role_id
  ) {
    throw new ForbiddenError('No puedes cambiar tu propio rol');
  }

  if (username !== undefined) {
    validate.username(username.trim());

    const [[conflict]] = await db.query(
      'SELECT user_id FROM users WHERE username = ? AND user_id != ?',
      [username.trim(), userId]
    );
    if (conflict) throw new ConflictError(`El username "${username.trim()}" ya está en uso`);
  }

  // No se puede cambiar el rol de un superadmin o admin (roles protegidos)
  if (role_id !== undefined && Number(role_id) !== targetUser.role_id) {
    if (PROTECTED_ROLES.includes(targetUser.role_name)) {
      throw new ForbiddenError('No se puede cambiar el rol de un superadmin o admin');
    }

    validate.roleId(role_id);
    const [[newRole]] = await db.query(
      'SELECT name FROM roles WHERE role_id = ? AND is_active = 1',
      [role_id]
    );
    if (!newRole) throw new ValidationError('El rol especificado no existe o está inactivo');

    if (newRole.name === 'superadmin') {
      throw new ForbiddenError('El rol superadmin no puede asignarse');
    }

    if (newRole.name === 'admin' && !isCentral(requestingUser)) {
      throw new ForbiddenError('Solo el administrador central puede asignar el rol admin');
    }

    const effectiveBranchId = isCentral(requestingUser)
      ? (branch_id ?? targetUser.branch_id)
      : requestingUser.branch_id;

    if (['cajero', 'almacenista'].includes(newRole.name) && effectiveBranchId === null) {
      throw new ValidationError(`El rol ${newRole.name} requiere una sucursal asignada`);
    }
  }

  // Nadie puede cambiar la sucursal del superadmin
  if (branch_id !== undefined && targetUser.role_name === 'superadmin') {
    throw new ForbiddenError('No se puede cambiar la sucursal del superadmin');
  }

  // Solo superadmin y admin central puede cambiar la sucursal de un admin
  if (branch_id !== undefined && targetUser.role_name === 'admin') {
    if (requestingUser.role_name !== 'superadmin' && requestingUser.role_name !== 'admin') {
      throw new ForbiddenError('Solo el superadmin o admin central puede cambiar la sucursal de un admin');
    }
  }

  // No-central no puede cambiar branch_id a null (central)
  if (branch_id !== undefined && !isCentral(requestingUser) && branch_id === null) {
    throw new ForbiddenError('No puedes asignar un usuario como central');
  }

  // Un no-central no puede cambiar el branch_id
  const effectiveBranchId = requestingUser.branch_id !== null
    ? undefined
    : branch_id;

  const fields = {
    ...(first_name       !== undefined && { first_name }),
    ...(last_name        !== undefined && { last_name }),
    ...(username         !== undefined && { username: username.trim() }),
    ...(role_id          !== undefined && { role_id }),
    ...(effectiveBranchId !== undefined && { branch_id: effectiveBranchId }),
    ...(position         !== undefined && { position }),
    ...(address          !== undefined && { address }),
    ...(zip_code         !== undefined && { zip_code }),
    ...(state            !== undefined && { state }),
    ...(city             !== undefined && { city }),
    ...(phone_number     !== undefined && { phone_number }),
    ...(profile_image    !== undefined && { profile_image }),
  };

  // Cajero/Almacenista no pueden quedar sin sucursal
  if (fields.branch_id === null) {
    if (['cajero', 'almacenista'].includes(targetUser.role_name)) {
      throw new ValidationError(`El rol ${targetUser.role_name} requiere una sucursal asignada`);
    }
  }

  if (Object.keys(fields).length === 0) {
    throw new ValidationError('No se enviaron campos para actualizar');
  }

  const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  const values     = [...Object.values(fields), userId];

  await db.query(`UPDATE users SET ${setClauses} WHERE user_id = ?`, values);

  return getById({ userId, requestingUser: { branch_id: null } });
};

// ─── changePassword ───────────────────────────────────────────────────────────
// 🔴 FIX crítico: antes, si el target NO era superadmin, no había NINGÚN
// chequeo de jerarquía — cualquier usuario autenticado podía cambiar la
// contraseña de cualquier otro usuario no-superadmin (incluyendo un admin),
// sin current_password, sin permiso RBAC, sin scoping de sucursal.
// Ahora: si no es el propio usuario, se exige la misma jerarquía de edición
// que en update() (canEditUser), que ya cubre correctamente al superadmin
// (solo él mismo) y a los demás niveles.

const changePassword = async ({ userId, data, requestingUser }) => {
  const { current_password, new_password } = data;

  validate.password(new_password);

  const targetUser = await getUserWithRole(userId);
  if (!targetUser) throw new NotFoundError('Usuario no encontrado');

  const isSelf = requestingUser.user_id === parseInt(userId);

  if (!isSelf && !canEditUser(requestingUser, targetUser)) {
    throw new ForbiddenError('No tienes permiso para cambiar la contraseña de este usuario');
  }

  const [[user]] = await db.query(
    'SELECT user_id, password_hash FROM users WHERE user_id = ? AND is_active = 1',
    [userId]
  );
  if (!user) throw new NotFoundError('Usuario no encontrado');

  if (isSelf) {
    if (!current_password) throw new ValidationError('La contraseña actual es requerida');
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) throw new ValidationError('La contraseña actual es incorrecta');
  }

  const sameAsOld = await bcrypt.compare(new_password, user.password_hash);
  if (sameAsOld) throw new ValidationError('La nueva contraseña no puede ser igual a la actual');

  const newHash = await bcrypt.hash(new_password, SALT_ROUNDS);

  await db.query(
    'UPDATE users SET password_hash = ? WHERE user_id = ?',
    [newHash, userId]
  );

  await db.query(
    'UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW() WHERE user_id = ? AND revoked = 0',
    [userId]
  );

  return { message: 'Contraseña actualizada correctamente. Se cerraron todas las sesiones activas.' };
};

// ─── toggleStatus ─────────────────────────────────────────────────────────────
// FIX: antes la jerarquía de 3 niveles (superadmin/admin central/admin de
// sucursal) solo se aplicaba cuando el target era 'admin', y el scoping de
// sucursal genérico (sin verificar rol) era la única barrera para los demás
// roles. Ahora canDeleteOrDeactivateUser aplica la jerarquía completa a
// CUALQUIER rol de destino, y ya no hace falta la query extra a
// getUserWithRole(requestingUser.user_id) — requestingUser ya trae
// role_name/branch_id del JWT.

const toggleStatus = async ({ userId, is_active, requestingUser }) => {
  const targetUser = await getUserWithRole(userId);
  if (!targetUser) throw new NotFoundError('Usuario no encontrado');

  // Nadie puede desactivar su propia cuenta desde este endpoint (aplica a
  // cualquier rol, incluido superadmin y admin central).
  if (requestingUser.user_id === parseInt(userId) && !is_active) {
    throw new ValidationError('No puedes desactivar tu propia cuenta');
  }

  // Mensaje explícito y claro para el caso más importante: el superadmin
  // nunca puede ser desactivado/reactivado por nadie (inmortal).
  if (targetUser.role_name === 'superadmin') {
    throw new ForbiddenError('El superadmin no puede ser desactivado');
  }

  // Jerarquía completa para el resto: admin central (nadie se autogestiona,
  // solo otro admin central/superadmin), admin de sucursal y demás roles
  // (superadmin, admin central, o admin de esa misma sucursal).
  if (!canDeleteOrDeactivateUser(requestingUser, targetUser)) {
    throw new ForbiddenError('No tienes permiso para cambiar el estado de este usuario');
  }

  await db.query(
    'UPDATE users SET is_active = ? WHERE user_id = ?',
    [is_active ? 1 : 0, userId]
  );

  if (!is_active) {
    await db.query(
      'UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW() WHERE user_id = ? AND revoked = 0',
      [userId]
    );
  }

  return getById({ userId, requestingUser: { branch_id: null } });
};

module.exports = { getAll, getById, create, update, changePassword, toggleStatus };