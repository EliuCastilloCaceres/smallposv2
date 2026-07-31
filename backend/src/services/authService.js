// src/services/authService.js
const jwt    = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db     = require('../config/db');
const { UnauthorizedError } = require('../errors/AppError');

const ACCESS_TOKEN_EXPIRY     = '15m';
const REFRESH_TOKEN_EXPIRY    = '7d';
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateAccessToken = (user) =>
  jwt.sign(
    { user_id: user.user_id, username: user.username, role_id: user.role_id, branch_id: user.branch_id },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

const generateRefreshToken = () => crypto.randomBytes(64).toString('hex');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// ─── Query de permisos reutilizable ───────────────────────────────────────────

const getPermissionsByRole = async (roleId) => {
  const [rows] = await db.query(
    `SELECT CONCAT(p.module, '.', p.action) AS permission
     FROM role_permissions rp
     JOIN permissions p ON rp.permission_id = p.permission_id
     WHERE rp.role_id = ?`,
    [roleId]
  );
  return rows.map(r => r.permission);
};

// ─── login ────────────────────────────────────────────────────────────────────

const login = async ({ username, password, userAgent, ipAddress }) => {
  const [users] = await db.query(
    `SELECT u.user_id, u.username, u.password_hash, u.role_id, u.branch_id, u.is_active,
            r.name AS role_name
     FROM users u
     JOIN roles r ON u.role_id = r.role_id
     WHERE u.username = ?`,
    [username]
  );

  if (users.length === 0) throw new UnauthorizedError('Credenciales incorrectas', 'INVALID_CREDENTIALS');

  const user = users[0];
  if (!user.is_active) throw new UnauthorizedError('Usuario desactivado','INVALID_CREDENTIALS');

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) throw new UnauthorizedError('Credenciales incorrectas', 'INVALID_CREDENTIALS');

  const accessToken   = generateAccessToken(user);
  const refreshToken  = generateRefreshToken();
  const tokenHash     = hashToken(refreshToken);
  const expiresAt     = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?)`,
    [user.user_id, tokenHash, expiresAt, userAgent ?? null, ipAddress ?? null]
  );

  const permissions = await getPermissionsByRole(user.role_id);

  return {
    accessToken,
    refreshToken,
    user: {
      user_id:     user.user_id,
      username:    user.username,
      role_id:     user.role_id,
      role_name:   user.role_name,
      branch_id:   user.branch_id,
      permissions,
    },
  };
};

// ─── refresh ──────────────────────────────────────────────────────────────────
// FIX: usa db.getConnection() para garantizar atomicidad real de la transacción.

const refresh = async ({ refreshToken, userAgent, ipAddress }) => {
  if (!refreshToken) throw new UnauthorizedError('Refresh token no proporcionado');

  const tokenHash = hashToken(refreshToken);

  const [tokens] = await db.query(
    `SELECT rt.*, u.user_id, u.username, u.role_id, u.branch_id, u.is_active
     FROM refresh_tokens rt
     JOIN users u ON rt.user_id = u.user_id
     WHERE rt.token_hash = ?`,
    [tokenHash]
  );

  if (tokens.length === 0) throw new UnauthorizedError('Refresh token inválido o expirado');

  const stored    = tokens[0];
  const isExpired = new Date(stored.expires_at) <= new Date();

  if (stored.revoked === 1 || isExpired) {
    // Solo revocar todas las sesiones si detectamos reutilización (revoked),
    // no si simplemente expiró normalmente.
    if (stored.revoked === 1) {
      await db.query(
        `UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW() WHERE user_id = ?`,
        [stored.user_id]
      );
      throw new UnauthorizedError('Alerta de seguridad: Intento de reutilización de token. Sesión cerrada.');
    }
    throw new UnauthorizedError('Refresh token expirado');
  }

  if (!stored.is_active) throw new UnauthorizedError('Usuario desactivado');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW() WHERE token_hash = ?`,
      [tokenHash]
    );

    const newAccessToken  = generateAccessToken(stored);
    const newRefreshToken = generateRefreshToken();
    const newTokenHash    = hashToken(newRefreshToken);
    const expiresAt       = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

    await conn.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES (?, ?, ?, ?, ?)`,
      [stored.user_id, newTokenHash, expiresAt, userAgent ?? null, ipAddress ?? null]
    );

    await conn.commit();
    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

// ─── getMe ────────────────────────────────────────────────────────────────────

const getMe = async (userId) => {
  const [users] = await db.query(
    `SELECT u.user_id, u.username, u.role_id, u.branch_id,
            r.name AS role_name
     FROM users u
     JOIN roles r ON u.role_id = r.role_id
     WHERE u.user_id = ? AND u.is_active = 1`,
    [userId]
  );

  if (users.length === 0) throw new UnauthorizedError('Usuario no encontrado', 'INVALID_CREDENTIALS');

  const user        = users[0];
  const permissions = await getPermissionsByRole(user.role_id);

  return {
    user_id:     user.user_id,
    username:    user.username,
    role_id:     user.role_id,
    role_name:   user.role_name,
    branch_id:   user.branch_id,
    permissions,
  };
};

// ─── logout ───────────────────────────────────────────────────────────────────

const logout = async (refreshToken) => {
  if (!refreshToken) return;
  const tokenHash = hashToken(refreshToken);
  await db.query(
    `UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW() WHERE token_hash = ?`,
    [tokenHash]
  );
};

const logoutAll = async (userId) => {
  await db.query(
    `UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW()
     WHERE user_id = ? AND revoked = 0`,
    [userId]
  );
};

module.exports = { login, refresh, logout, logoutAll, getMe };