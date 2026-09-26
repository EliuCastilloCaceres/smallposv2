// src/helpers/roleHelpers.js
//
// Única fuente de verdad para preguntas de jerarquía de roles y para la
// autorización de la gestión de usuarios.
// Cualquier controller o service que necesite saber "es admin",
// "puede gestionar esta sucursal", "puede editar/borrar a este usuario",
// "puede asignar este rol", etc. debe importar de aquí — nunca reimplementar
// el chequeo a mano.
//
// MODELO DE AUTORIZACIÓN PARA USUARIOS (crear / editar / desactivar):
//
//   1. PERMISO RBAC (interruptor principal). Sin el permiso correspondiente
//      en requestingUser.permissions no se puede hacer la acción, sin
//      importar el rol. El rol NO otorga nada por sí mismo: un admin sin
//      users.update no edita, y un cajero con users.update sí.
//   2. ALCANCE. Superadmin/admin central operan sobre cualquier sucursal.
//      Cualquier otro usuario solo sobre SU sucursal.
//   3. ANTI-ESCALADA (RBAC no puede saltárselo). Tener el permiso no basta
//      para gestionar a alguien de mayor rango, porque si no un cajero con
//      users.update podría cambiar la contraseña de su admin y adueñarse de
//      su cuenta:
//        · superadmin: solo él mismo se edita; nadie lo desactiva.
//        · admin central: solo superadmin / otro admin central.
//        · admin de sucursal: solo superadmin, admin central, o un admin de
//          esa misma sucursal.
//        · asignar rol 'admin' (al crear o cambiar rol): solo superadmin /
//          admin central. Asignar 'superadmin': nunca.
//        · nadie se desactiva/borra a sí mismo.
//
// requestingUser debe traer: user_id, role_name, branch_id y permissions
// (array de strings 'modulo.accion', igual que el que devuelve auth/me).
// Si permissions no existe, TODO se niega (falla cerrado).
//
// Se elimina así la dispersión que existía antes: branchService,
// categoryService, paymentMethodService y userService cada uno tenía
// su propia versión (distinta) de "¿es admin?".

const PROTECTED_ROLES = ['superadmin'];

// Roles que SIEMPRE deben pertenecer a una sucursal (branch_id != null).
const BRANCH_BOUND_ROLES = ['cajero', 'almacenista'];

// Permiso RBAC exigido para cada acción sobre usuarios. Coincide con el
// módulo 'users' de la tabla `permissions`: read/create/update (no existe
// 'delete' — desactivar reusa 'update').
// Si en el futuro agregan 'users.delete', cambiarlo SOLO aquí (y en
// userAccess.js del frontend).
const USER_PERMISSIONS = {
  read:       'users.read',
  create:     'users.create',
  update:     'users.update',
  deactivate: 'users.update',
};

// ─── Permisos RBAC ──────────────────────────────────────────────────────────

const hasPermission = (user, permission) =>
  Array.isArray(user?.permissions) && user.permissions.includes(permission);

// ─── Preguntas básicas ──────────────────────────────────────────────────────

const isSuperadmin = (user) => user.role_name === 'superadmin';

const isCentralAdmin = (user) => user.role_name === 'admin' && user.branch_id === null;

// Sin branchId → "¿es admin de alguna sucursal?"
// Con branchId → "¿es admin de ESA sucursal específica?"
// OJO: se usa `undefined` (no `null`) como valor por default para poder
// distinguir "no me pasaron branchId" de "me pasaron branchId = null"
// (este segundo caso significa "el target es central" y NUNCA debe dar
// true, porque un admin de sucursal, por definición, no tiene branch_id
// null).
// TRAMPA: si un caller pasa `undefined` por accidente (p. ej. un objeto sin
// la propiedad branch_id) esta función responde "es admin de alguna
// sucursal". Los callers deben normalizar con `?? null`.
const isBranchAdmin = (user, branchId = undefined) => {
  if (user.role_name !== 'admin' || user.branch_id === null) return false;
  if (branchId === undefined) return true;
  if (branchId === null) return false;
  return Number(user.branch_id) === Number(branchId);
};

// El nivel que puede gestionar recursos globales (sucursales, categorías,
// métodos de pago, roles): superadmin o admin central.
const isCentralAdminOrAbove = (user) => isSuperadmin(user) || isCentralAdmin(user);

// El nivel que puede gestionar recursos de UNA sucursal específica:
// superadmin, admin central, o el admin de esa misma sucursal.
const isCentralAdminOrBranchAdmin = (user, branchId) =>
  isCentralAdminOrAbove(user) || isBranchAdmin(user, branchId);

// ─── Alcance por sucursal ───────────────────────────────────────────────────
// ¿Puede `user` actuar sobre la sucursal `branchId` (null = central)?
// A diferencia de isCentralAdminOrBranchAdmin, NO exige ser admin: cualquier
// usuario con branch_id propio alcanza su propia sucursal (el permiso RBAC
// se evalúa aparte). Nunca alcanza "central" (null) ni otra sucursal, salvo
// superadmin/admin central que alcanzan todo.
const canActOnBranch = (user, branchId) => {
  if (isCentralAdminOrAbove(user)) return true;
  if (user.branch_id === null || user.branch_id === undefined) return false;
  if (branchId === null || branchId === undefined) return false;
  return Number(user.branch_id) === Number(branchId);
};

// ─── Asignación de roles ────────────────────────────────────────────────────
// ¿Puede requestingUser ASIGNAR `roleName` a alguien (al crear o al cambiar
// de rol)? Solo responde por el rol en sí; permiso y alcance se validan aparte.
//  - roles protegidos (superadmin): nunca se asignan.
//  - admin: solo superadmin o admin central.
//  - cualquier otro: sin restricción adicional por rol.
// LIMITE CONOCIDO: no compara los permisos del rol asignado contra los de
// quien lo asigna; un rol personalizado con más permisos que el suyo sí
// podría asignarse (ver notas de entrega).
const canAssignRole = (requestingUser, roleName) => {
  if (PROTECTED_ROLES.includes(roleName)) return false;
  if (roleName === 'admin') return isCentralAdminOrAbove(requestingUser);
  return true;
};

// ─── Gestión de usuarios ────────────────────────────────────────────────────
// OJO: "editar" y "desactivar/borrar" NO son la misma pregunta para
// superadmin ni para admin central — por eso hay dos funciones públicas
// (canEditUser / canDeleteOrDeactivateUser) en vez de una sola.
//
// requestingUser y targetUser deben traer: user_id, role_name, branch_id.

// Anti-escalada + alcance sobre el target (todo menos el caso superadmin,
// que cada función pública resuelve por separado).
const _hierarchyAllows = (requestingUser, targetUser) => {
  const targetBranchId = targetUser.branch_id ?? null;

  if (isCentralAdmin(targetUser)) return isCentralAdminOrAbove(requestingUser);
  if (isBranchAdmin(targetUser))  return isCentralAdminOrBranchAdmin(requestingUser, targetBranchId);
  return canActOnBranch(requestingUser, targetBranchId);
};

// ¿Puede requestingUser LISTAR/VER usuarios, en general? El alcance real
// (a cuáles ve) sigue resuelto por el service con scoping de sucursal, igual
// que antes — esta función solo cubre el interruptor de permiso, que faltaba.
const canViewUsers = (requestingUser) =>
  hasPermission(requestingUser, USER_PERMISSIONS.read);

// ¿Puede requestingUser CREAR un usuario con ese rol en esa sucursal?
// newUser = { role_name, branch_id } (branch_id null = central).
const canCreateUser = (requestingUser, { role_name, branch_id }) =>
  hasPermission(requestingUser, USER_PERMISSIONS.create)
  && canAssignRole(requestingUser, role_name)
  && canActOnBranch(requestingUser, branch_id ?? null);

// ¿Puede requestingUser EDITAR (datos, password de otro, etc.) a targetUser?
// El superadmin es la única excepción total: solo él mismo puede editarse.
// El admin central SÍ puede editar su propio perfil (no hay restricción
// especial aquí, solo aplica en la desactivación/borrado).
// Cualquiera con users.update puede editarse a sí mismo dentro de su alcance
// (el service igual impide que cambie su propio rol o sucursal).
const canEditUser = (requestingUser, targetUser) => {
  if (!hasPermission(requestingUser, USER_PERMISSIONS.update)) return false;
  if (isSuperadmin(targetUser)) return requestingUser.user_id === targetUser.user_id;
  return _hierarchyAllows(requestingUser, targetUser);
};

// ¿Puede requestingUser DESACTIVAR o BORRAR a targetUser?
// - superadmin: inmortal, sin excepción — nadie lo desactiva/borra, ni él mismo.
// - nadie se desactiva/borra a sí mismo.
// - el resto: anti-escalada + alcance.
const canDeleteOrDeactivateUser = (requestingUser, targetUser) => {
  if (!hasPermission(requestingUser, USER_PERMISSIONS.deactivate)) return false;
  if (isSuperadmin(targetUser)) return false;
  if (requestingUser.user_id === targetUser.user_id) return false;
  return _hierarchyAllows(requestingUser, targetUser);
};

// Alias retrocompatible por si algo del código viejo aún importa
// canManageUser directamente. Mapea al comportamiento de edición
// (el más permisivo de los dos), pero se marca deprecated: cualquier
// llamada nueva debe usar canEditUser o canDeleteOrDeactivateUser
// explícitamente para no repetir la ambigüedad que causó el bug original.
// TODO: correr `grep -rn canManageUser src/` y eliminar si no hay usos.
/** @deprecated usa canEditUser o canDeleteOrDeactivateUser */
const canManageUser = canEditUser;

module.exports = {
  PROTECTED_ROLES,
  BRANCH_BOUND_ROLES,
  USER_PERMISSIONS,
  hasPermission,
  isSuperadmin,
  isCentralAdmin,
  isBranchAdmin,
  isCentralAdminOrAbove,
  isCentralAdminOrBranchAdmin,
  canActOnBranch,
  canAssignRole,
  canViewUsers,
  canCreateUser,
  canEditUser,
  canDeleteOrDeactivateUser,
  canManageUser, // deprecated, ver nota arriba
};