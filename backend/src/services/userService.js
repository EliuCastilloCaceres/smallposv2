// src/services/userService.js
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db     = require('../config/db');
const { NotFoundError, ConflictError, ValidationError, ForbiddenError } = require('../errors/AppError');

const SALT_ROUNDS = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Columnas seguras para devolver — nunca password_hash
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

// Genera una contraseña temporal legible: 3 palabras + número
const generateTempPassword = () => {
  const words = ['Mango', 'Limon', 'Fresa', 'Melon', 'Uva', 'Pera', 'Kiwi', 'Mora'];
  const word1  = words[Math.floor(Math.random() * words.length)];
  const word2  = words[Math.floor(Math.random() * words.length)];
  const num    = crypto.randomInt(100, 999);
  return `${word1}${word2}${num}!`;
};

// Validaciones reutilizables
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
// Admin central (branch_id = null en token) ve todos los usuarios.
// Cualquier otro rol solo ve usuarios de su propia sucursal.
// Soporta filtros: branch_id, role_id, is_active, search (username / nombre)
// Paginación: page (default 1), limit (default 20, máx 100)

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

  // Restricción de sucursal según el rol del solicitante
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

  // Total para paginación
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

  // Un usuario no-admin no puede ver usuarios de otra sucursal
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

  // Validaciones
  validate.username(username?.trim());
  validate.roleId(role_id);

  let tempPassword      = null;
  let plainPassword     = password;

  // Si no se envía contraseña, generar una temporal
  if (!plainPassword) {
    tempPassword  = generateTempPassword();
    plainPassword = tempPassword;
  } else {
    validate.password(plainPassword);
  }

  // Un usuario no-admin solo puede crear usuarios en su propia sucursal
  const effectiveBranchId = requestingUser.branch_id !== null
    ? requestingUser.branch_id
    : (branch_id ?? null);

  // Verificar que el rol existe y está activo
  const [[role]] = await db.query(
    'SELECT role_id, name FROM roles WHERE role_id = ? AND is_active = 1',
    [role_id]
  );
  if (!role) throw new ValidationError('El rol especificado no existe o está inactivo');

  // Solo admin central puede crear usuarios con rol admin
  if (role.name === 'admin' && requestingUser.branch_id !== null)
    throw new ForbiddenError('Solo el administrador central puede crear usuarios con rol admin');

  // Verificar que la sucursal existe si se provee
  if (effectiveBranchId !== null) {
    const [[branch]] = await db.query(
      'SELECT branch_id FROM branches WHERE branch_id = ? AND is_active = 1',
      [effectiveBranchId]
    );
    if (!branch) throw new ValidationError('La sucursal especificada no existe o está inactiva');
  }

  // Username único
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

  // Si se generó contraseña temporal, devolverla una sola vez
  return tempPassword
    ? { ...newUser, temp_password: tempPassword }
    : newUser;
};

// ─── update ───────────────────────────────────────────────────────────────────
// Actualiza datos del perfil. No toca la contraseña (ver changePassword).

const update = async ({ userId, data, requestingUser }) => {
  // Verificar que el usuario existe y que el solicitante tiene acceso
  await getById({ userId, requestingUser });

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

  if (username !== undefined) {
    validate.username(username.trim());

    // Verificar que el nuevo username no esté tomado por OTRO usuario
    const [[conflict]] = await db.query(
      'SELECT user_id FROM users WHERE username = ? AND user_id != ?',
      [username.trim(), userId]
    );
    if (conflict) throw new ConflictError(`El username "${username.trim()}" ya está en uso`);
  }

  if (role_id !== undefined) {
    validate.roleId(role_id);
    const [[role]] = await db.query(
      'SELECT role_id FROM roles WHERE role_id = ? AND is_active = 1',
      [role_id]
    );
    if (!role) throw new ValidationError('El rol especificado no existe o está inactivo');
  }

  // Un no-admin no puede cambiar el branch_id
  const effectiveBranchId = requestingUser.branch_id !== null
    ? undefined   // no se toca
    : branch_id;

  // Construir UPDATE dinámico — solo los campos que llegaron
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

  if (Object.keys(fields).length === 0) {
    throw new ValidationError('No se enviaron campos para actualizar');
  }

  const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  const values     = [...Object.values(fields), userId];

  await db.query(`UPDATE users SET ${setClauses} WHERE user_id = ?`, values);

  return getById({ userId, requestingUser: { branch_id: null } });
};

// ─── changePassword ───────────────────────────────────────────────────────────
// PATCH /users/:id/password
// Si el solicitante es el propio usuario, requiere current_password.
// Si es admin/supervisor editando a otro, no requiere current_password.

const changePassword = async ({ userId, data, requestingUser }) => {
  const { current_password, new_password } = data;

  validate.password(new_password);

  const isSelf = requestingUser.user_id === parseInt(userId);

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

  // Verificar que la nueva contraseña no sea igual a la actual
  const sameAsOld = await bcrypt.compare(new_password, user.password_hash);
  if (sameAsOld) throw new ValidationError('La nueva contraseña no puede ser igual a la actual');

  const newHash = await bcrypt.hash(new_password, SALT_ROUNDS);

  await db.query(
    'UPDATE users SET password_hash = ? WHERE user_id = ?',
    [newHash, userId]
  );

  // Revocar todos los refresh tokens — forzar nuevo login en todos los dispositivos
  await db.query(
    'UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW() WHERE user_id = ? AND revoked = 0',
    [userId]
  );

  return { message: 'Contraseña actualizada correctamente. Se cerraron todas las sesiones activas.' };
};

// ─── toggleStatus ─────────────────────────────────────────────────────────────
// PATCH /users/:id/status  { is_active: true | false }
// Soft-delete — nunca se borra un usuario de la BD.

const toggleStatus = async ({ userId, is_active, requestingUser }) => {
  await getById({ userId, requestingUser });

  // Evitar que un usuario se desactive a sí mismo
  if (requestingUser.user_id === parseInt(userId) && !is_active) {
    throw new ValidationError('No puedes desactivar tu propia cuenta');
  }

  await db.query(
    'UPDATE users SET is_active = ? WHERE user_id = ?',
    [is_active ? 1 : 0, userId]
  );

  // Si se desactiva, revocar sus tokens activos
  if (!is_active) {
    await db.query(
      'UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW() WHERE user_id = ? AND revoked = 0',
      [userId]
    );
  }

  return getById({ userId, requestingUser: { branch_id: null } });
};

module.exports = { getAll, getById, create, update, changePassword, toggleStatus };
