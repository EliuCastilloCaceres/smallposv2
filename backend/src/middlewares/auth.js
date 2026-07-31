// src/middlewares/auth.js
// Reemplaza ensureToken.js.
// - verifyToken: valida el JWT y adjunta req.user
// - requirePermission(module, action): verifica RBAC contra la BD

const jwt = require('jsonwebtoken');
const db  = require('../config/db');
const { UnauthorizedError, ForbiddenError } = require('../errors/AppError');

// ─── 1. Verifica que el access token sea válido ───────────────────────────────
const verifyToken = (req, res, next) => {
  const header = req.headers['authorization'];
  if (!header) return next(new UnauthorizedError('Token no proporcionado'));

  const token = header.split(' ')[1];
  if (!token) return next(new UnauthorizedError('Formato de token inválido'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { user_id, username, role_id, branch_id }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Token expirado'));
    }
    return next(new UnauthorizedError('Token inválido'));
  }
};

// ─── 2. Verifica permiso RBAC (module + action) ───────────────────────────────
// Uso en rutas: router.post('/', verifyToken, requirePermission('orders','create'), controller)
const requirePermission = (module, action) => {
  return async (req, res, next) => {
    try {
      const [rows] = await db.query(
        `SELECT 1
         FROM role_permissions rp
         JOIN permissions p ON rp.permission_id = p.permission_id
         WHERE rp.role_id = ? AND p.module = ? AND p.action = ?
         LIMIT 1`,
        [req.user.role_id, module, action]
      );

      if (rows.length === 0) {
        return next(new ForbiddenError(`Sin permiso para ${module}.${action}`));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

// ─── 3. Restricción de sucursal ───────────────────────────────────────────────
// Asegura que el usuario solo acceda a datos de su sucursal,
// a menos que sea admin central (branch_id = null en el token).
const requireBranchAccess = (req, res, next) => {
  const paramBranchId = parseInt(req.params.branchId ?? req.body.branchId);

  // Admin central (branch_id null en token) puede ver todo
  if (req.user.branch_id === null) return next();

  if (req.user.branch_id !== paramBranchId) {
    return next(new ForbiddenError('Sin acceso a esta sucursal'));
  }
  next();
};

module.exports = { verifyToken, requirePermission, requireBranchAccess };
