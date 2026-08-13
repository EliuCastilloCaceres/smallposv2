const { ValidationError } = require('../errors/AppError');

const resolveBranchId = (req) => {
  if (req.user.branch_id !== null) return req.user.branch_id;
  const id = req.body?.branch_id ?? req.query?.branch_id;
  if (!id) throw new ValidationError('branch_id es requerido para el administrador central');
  return parseInt(id);
};

// FIX: para endpoints de LECTURA donde "sin sucursal" es un estado válido
// (= vista consolidada de todas las sucursales, admin central). A
// diferencia de resolveBranchId, nunca lanza — si el admin central no
// manda branch_id, devuelve null en vez de exigirlo. Un usuario con
// sucursal asignada se comporta idéntico a resolveBranchId (forzada).
// NO usar en creación/cancelación de órdenes ni en cualquier acción que
// necesite una sucursal concreta — para eso sigue siendo resolveBranchId.
const resolveOptionalBranchId = (req) => {
  if (req.user.branch_id !== null) return req.user.branch_id;
  const id = req.body?.branch_id ?? req.query?.branch_id;
  return id ? parseInt(id) : null;
};

// FIX: para módulos donde CUALQUIER usuario con el permiso puede operar
// sobre CUALQUIER sucursal, sin importar la suya — no solo el admin
// central. Caso: créditos, donde un cliente puede abonar en una sucursal
// distinta a donde compró (ver comentario al inicio de creditService.js:
// "Los abonos pueden registrarse en cualquier sucursal"). A diferencia de
// resolveBranchId y resolveOptionalBranchId, esta función NUNCA lee
// req.user.branch_id — solo lo que venga en query/body. Sin valor → null
// (todas las sucursales). OJO: esto NO aplica control de acceso alguno
// por sucursal; el permiso (ej. credit:read) es el único gate.
const resolveUnrestrictedBranchId = (req) => {
  const id = req.body?.branch_id ?? req.query?.branch_id;
  return id ? parseInt(id) : null;
};

module.exports = { resolveBranchId, resolveOptionalBranchId, resolveUnrestrictedBranchId };