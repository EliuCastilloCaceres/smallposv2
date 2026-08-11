// src/middlewares/auth.js
// - verifyToken: valida el JWT y adjunta req.user
// - hasPermission: query reutilizable module.action contra la BD
// - requirePermission(module, action): middleware que usa hasPermission
// - requireBranchAccess: restricción de sucursal

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
    req.user = decoded; // { user_id, username, role_id, role_name, branch_id }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Token expirado'));
    }
    return next(new UnauthorizedError('Token inválido'));
  }
};

// ─── 2. hasPermission — query reutilizable ────────────────────────────────────
// Antes esta query vivía embebida (duplicada) dentro de customersController.
// Ahora es la única fuente de verdad: cualquier controller/service que
// necesite chequear un permiso puntual (fuera del middleware de ruta) la
// importa de aquí en vez de escribir su propio SQL.
//
// NOTA: no incluye el bypass de superadmin — ese vive en requirePermission,
// que es el punto de entrada normal. Si se llama hasPermission directamente
// para un superadmin, igualmente devuelve true porque el seed le asigna
// TODOS los permission_id en role_permissions.
const hasPermission = async (roleId, module, action) => {
  const [rows] = await db.query(
    `SELECT 1
     FROM role_permissions rp
     JOIN permissions p ON rp.permission_id = p.permission_id
     WHERE rp.role_id = ? AND p.module = ? AND p.action = ?
     LIMIT 1`,
    [roleId, module, action]
  );
  return rows.length > 0;
};

// ─── 3. Verifica permiso RBAC (module + action) ───────────────────────────────
// Bypass total para superadmin — tiene todos los permisos habidos y por haber.
const requirePermission = (module, action) => {
  return async (req, res, next) => {
    try {
      if (req.user?.role_name === 'superadmin') {
        return next();
      }

      const allowed = await hasPermission(req.user.role_id, module, action);
      if (!allowed) {
        return next(new ForbiddenError(`Sin permiso para ${module}.${action}`));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { verifyToken, hasPermission, requirePermission };