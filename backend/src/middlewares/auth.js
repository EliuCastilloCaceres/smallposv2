// src/middlewares/auth.js
// - verifyToken: valida el JWT y adjunta req.user
// - hasPermission: query reutilizable module.action contra la BD
// - requirePermission(module, action): middleware que usa hasPermission
// - requireBranchAccess: restricción de sucursal

const jwt = require('jsonwebtoken');
const db  = require('../config/db');
const { getPermissionsForRole } = require('../helpers/permissions');
const { UnauthorizedError, ForbiddenError } = require('../errors/AppError');

// ─── 1. Verifica que el access token sea válido ───────────────────────────────
// [FIX] Antes req.user quedaba con { user_id, username, role_id, role_name,
// branch_id } tal cual del JWT — SIN permissions. Cualquier código que
// dependiera de req.user.permissions (p. ej. roleHelpers.hasPermission) veía
// siempre `undefined`, y como esas funciones fallan CERRADO ante un valor
// que no es array, todo daba 403 aunque el rol sí tuviera el permiso en
// role_permissions. Ahora, ya validado el token, se consulta una vez el
// listado de permisos del rol y se adjunta a req.user. Es una query extra
// por request autenticado; si en el futuro pesa, se puede cachear por
// role_id con una TTL corta (los permisos cambian poco).
const verifyToken = async (req, res, next) => {
  const header = req.headers['authorization'];
  if (!header) return next(new UnauthorizedError('Token no proporcionado'));

  const token = header.split(' ')[1];
  if (!token) return next(new UnauthorizedError('Formato de token inválido'));

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Token expirado'));
    }
    return next(new UnauthorizedError('Token inválido'));
  }

  // Consulta a BD FUERA del catch de arriba: un error de conexión/BD aquí
  // no es un problema del token y no debe reportarse como "Token inválido"
  // (antes un solo try/catch hubiera confundido ambos casos).
  try {
    const permissions = await getPermissionsForRole(decoded.role_id);
    req.user = { ...decoded, permissions }; // { user_id, username, role_id, role_name, branch_id, permissions }
    next();
  } catch (err) {
    next(err);
  }
};

// ─── 1b. Permisos de un rol, como array 'modulo.accion' ───────────────────────
// Se importa de helpers/permissions.js (fuente única, ver ese archivo). Antes
// vivía una copia local acá y otra en authService.js con SQL distinto.


// ─── 2. hasPermission — query reutilizable ────────────────────────────────────
// Antes esta query vivía embebida (duplicada) dentro de customersController.
// Sigue siendo la fuente de verdad para un chequeo PUNTUAL contra la BD
// (fuera del ciclo request/response, o si necesitas el estado más fresco
// posible sin esperar al próximo request). Para el caso normal — dentro de
// una ruta o un service, con el usuario ya autenticado — usa req.user.permissions
// (poblado por verifyToken) en vez de llamar esta función de nuevo: ya es la
// misma consulta, repetirla por request es trabajo de más.
//
// NOTA: no incluye el bypass de superadmin — ese vive en requirePermission,
// que es el punto de entrada normal. Si se llama hasPermission directamente
// para un superadmin, igualmente devuelve true porque el seed le asigna
// TODOS los permission_id en role_permissions. Por la misma razón,
// req.user.permissions de un superadmin (o de un admin, que también recibe
// todos por defecto) ya viene completo — no hace falta un caso especial en
// roleHelpers.hasPermission.
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

module.exports = { verifyToken, getPermissionsForRole, hasPermission, requirePermission };