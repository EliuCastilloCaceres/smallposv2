// src/helpers/userAccess.js
//
// ESPEJO FRONTEND de backend/src/helpers/roleHelpers.js para la gestión de
// usuarios. Solo decide qué mostrar/habilitar en la UI; el backend sigue
// siendo quien autoriza de verdad. Mantener sincronizado con roleHelpers
// (mismos nombres, mismas reglas). Modelo:
//
//   1. PERMISO RBAC: sin users.create / users.update en user.permissions no
//      se puede la acción, sin importar el rol.
//   2. ALCANCE: superadmin/admin central → cualquier sucursal; el resto →
//      solo la suya.
//   3. ANTI-ESCALADA: aunque tenga el permiso, no se gestiona a alguien de
//      mayor rango (superadmin solo él mismo; admin central solo
//      superadmin/admin central; admin de sucursal solo superadmin, admin
//      central o admin de esa sucursal; asignar 'admin' solo superadmin /
//      admin central; 'superadmin' nunca; nadie se desactiva a sí mismo).
//
// Todas las funciones reciben el usuario actual (`me`) como primer
// argumento. Desde componentes NO se importa este archivo directo: se usan
// las versiones ya ligadas al usuario que expone useUser().

export const PROTECTED_ROLES = ['superadmin']

// Debe coincidir con USER_PERMISSIONS del backend.
export const USER_PERMISSIONS = {
  read:       'users.read',
  create:     'users.create',
  update:     'users.update',
  deactivate: 'users.update',
}

export const hasUserPermission = (me, permission) =>
  Array.isArray(me?.permissions) && me.permissions.includes(permission)

export const isSuperadmin = (u) => u.role_name === 'superadmin'
export const isCentralAdmin = (u) => u.role_name === 'admin' && u.branch_id === null

export const isBranchAdmin = (u, branchId = undefined) => {
  if (u.role_name !== 'admin' || u.branch_id === null) return false
  if (branchId === undefined) return true
  if (branchId === null) return false
  return Number(u.branch_id) === Number(branchId)
}

export const isCentralAdminOrAbove = (u) => isSuperadmin(u) || isCentralAdmin(u)

export const isCentralAdminOrBranchAdmin = (u, branchId) =>
  isCentralAdminOrAbove(u) || isBranchAdmin(u, branchId)

export const canActOnBranch = (u, branchId) => {
  if (isCentralAdminOrAbove(u)) return true
  if (u.branch_id === null || u.branch_id === undefined) return false
  if (branchId === null || branchId === undefined) return false
  return Number(u.branch_id) === Number(branchId)
}

export const canViewUsers = (me) =>
  hasUserPermission(me, USER_PERMISSIONS.read)

export const canAssignRole = (me, roleName) => {
  if (PROTECTED_ROLES.includes(roleName)) return false
  if (roleName === 'admin') return isCentralAdminOrAbove(me)
  return true
}

const hierarchyAllows = (me, target) => {
  const targetBranchId = target.branch_id ?? null
  if (isCentralAdmin(target)) return isCentralAdminOrAbove(me)
  if (isBranchAdmin(target))  return isCentralAdminOrBranchAdmin(me, targetBranchId)
  return canActOnBranch(me, targetBranchId)
}

// newUser = { role_name, branch_id } (branch_id null = central)
export const canCreateUser = (me, { role_name, branch_id }) =>
  hasUserPermission(me, USER_PERMISSIONS.create)
  && canAssignRole(me, role_name)
  && canActOnBranch(me, branch_id ?? null)

export const canEditUser = (me, target) => {
  if (!hasUserPermission(me, USER_PERMISSIONS.update)) return false
  if (isSuperadmin(target)) return me.user_id === target.user_id
  return hierarchyAllows(me, target)
}

export const canDeactivateUser = (me, target) => {
  if (!hasUserPermission(me, USER_PERMISSIONS.deactivate)) return false
  if (isSuperadmin(target)) return false
  if (me.user_id === target.user_id) return false
  return hierarchyAllows(me, target)
}
