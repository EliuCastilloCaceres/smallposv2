// src/helpers/roleHelpers.js
//
// Única fuente de verdad para preguntas de jerarquía de roles.
// Cualquier controller o service que necesite saber "es admin",
// "puede gestionar esta sucursal", "puede editar/borrar a este usuario", etc.
// debe importar de aquí — nunca reimplementar el chequeo a mano.
//
// Se elimina así la dispersión que existía antes: branchService,
// categoryService, paymentMethodService y userService cada uno tenía
// su propia versión (distinta) de "¿es admin?".

const PROTECTED_ROLES = ['superadmin', 'admin'];

// ─── Preguntas básicas ──────────────────────────────────────────────────────

const isSuperadmin = (user) => user.role_name === 'superadmin';

const isCentralAdmin = (user) => user.role_name === 'admin' && user.branch_id === null;

// Sin branchId → "¿es admin de alguna sucursal?"
// Con branchId → "¿es admin de ESA sucursal específica?"
const isBranchAdmin = (user, branchId = null) => {
  if (user.role_name !== 'admin' || user.branch_id === null) return false;
  if (branchId === null) return true;
  return Number(user.branch_id) === Number(branchId);
};

// El nivel que puede gestionar recursos globales (sucursales, categorías,
// métodos de pago, roles): superadmin o admin central.
const isCentralAdminOrAbove = (user) => isSuperadmin(user) || isCentralAdmin(user);

// El nivel que puede gestionar recursos de UNA sucursal específica:
// superadmin, admin central, o el admin de esa misma sucursal.
const isCentralAdminOrBranchAdmin = (user, branchId) =>
  isCentralAdminOrAbove(user) || isBranchAdmin(user, branchId);

// ─── Jerarquía de gestión de usuarios ───────────────────────────────────────
// Implementa la regla de negocio completa. OJO: "editar" y "desactivar/borrar"
// NO son la misma pregunta para superadmin ni para admin central — por eso
// hay dos funciones públicas (canEditUser / canDeleteOrDeactivateUser) en vez
// de una sola.
//
// requestingUser y targetUser deben traer: user_id, role_name, branch_id.

// Regla base compartida por edición y borrado para todos los roles EXCEPTO
// los casos especiales de superadmin y admin central como target, que cada
// función pública resuelve por separado.
const _baseHierarchyCheck = (requestingUser, targetUser) => {
  if (isCentralAdmin(targetUser)) {
    return isSuperadmin(requestingUser) || isCentralAdmin(requestingUser);
  }

  // Admin de sucursal, o cualquier otro rol: superadmin, admin central,
  // o el admin de esa sucursal en particular.
  return isSuperadmin(requestingUser)
    || isCentralAdmin(requestingUser)
    || isBranchAdmin(requestingUser, targetUser.branch_id);
};

// ¿Puede requestingUser EDITAR (datos, password, etc.) a targetUser?
// El superadmin es la única excepción total: solo él mismo puede editarse.
// El admin central SÍ puede editar su propio perfil (no hay restricción
// especial aquí, solo aplica en la desactivación/borrado).
const canEditUser = (requestingUser, targetUser) => {
  if (isSuperadmin(targetUser)) {
    return requestingUser.user_id === targetUser.user_id;
  }
  return _baseHierarchyCheck(requestingUser, targetUser);
};

// ¿Puede requestingUser DESACTIVAR o BORRAR a targetUser?
// - superadmin: inmortal, sin excepción — nadie lo desactiva/borra, ni él mismo.
// - admin central: tampoco puede desactivarse/borrarse a sí mismo — solo
//   otro admin central o el superadmin pueden hacerlo.
const canDeleteOrDeactivateUser = (requestingUser, targetUser) => {
  if (isSuperadmin(targetUser)) return false;

  if (isCentralAdmin(targetUser)) {
    if (requestingUser.user_id === targetUser.user_id) return false;
    return isSuperadmin(requestingUser) || isCentralAdmin(requestingUser);
  }

  return _baseHierarchyCheck(requestingUser, targetUser);
};

// Alias retrocompatible por si algo del código viejo aún importa
// canManageUser directamente. Mapea al comportamiento de edición
// (el más permisivo de los dos), pero se marca deprecated: cualquier
// llamada nueva debe usar canEditUser o canDeleteOrDeactivateUser
// explícitamente para no repetir la ambigüedad que causó el bug original.
/** @deprecated usa canEditUser o canDeleteOrDeactivateUser */
const canManageUser = canEditUser;

module.exports = {
  PROTECTED_ROLES,
  isSuperadmin,
  isCentralAdmin,
  isBranchAdmin,
  isCentralAdminOrAbove,
  isCentralAdminOrBranchAdmin,
  canEditUser,
  canDeleteOrDeactivateUser,
  canManageUser, // deprecated, ver nota arriba
};