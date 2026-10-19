// src/context/UserContext.jsx
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import api from '../services/api'
import { refreshSession } from '../services/session'
import * as access from '../helpers/userAccess'

const UserContext = createContext()

export const UserContextProvider = ({ children }) => {
  const [user,      setUser]      = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // ─── Permisos ──────────────────────────────────────────────────────────────
  const hasPermission = useCallback((module, action) => {
    if (!user?.permissions) return false
    return user.permissions.includes(`${module}.${action}`)
  }, [user])

  // Valor derivado — no función. Uso: const { isAdmin } = useUser()
  // Se basa en role_name para que sea consistente con el backend (authService)
  // y no dependa de branch_id, que podría tener otros significados en el futuro.
  const isAdmin = user?.role_name === 'admin' || user?.role_name === 'superadmin'

  // [NUEVO] Distinto de isAdmin: esto es "¿tiene alcance sobre TODAS las
  // sucursales?" — basado en branch_id === null, igual que el backend
  // (branchService.assertAdmin, paymentMethodService.assertAdmin, etc. — la
  // mayoría de los "solo admin central" del backend validan branch_id, NO
  // el rol). Un usuario puede tener role_name = 'admin' Y tener una
  // sucursal asignada (admin de sucursal) — en ese caso isAdmin es true
  // pero isCentralAdmin debe ser false, o la UI muestra controles que el
  // backend va a rechazar. Usa isCentralAdmin para cualquier decisión de
  // alcance de sucursal (ver/editar todas vs. solo la propia).
  const isCentralAdmin = user?.branch_id === null

  // Valor derivado: el superadmin es intocable/inmortal en la UI de usuarios.
  const isSuperadmin = user?.role_name === 'superadmin'

  // ─── Gestión de usuarios (RBAC + alcance + anti-escalada) ──────────────────
  // Versiones ya ligadas al usuario actual de helpers/userAccess.js (espejo
  // de roleHelpers del backend). Los componentes NO deben reimplementar
  // jerarquía: llaman a estas funciones.
  //   canCreateUser({ role_name, branch_id })
  //   canEditUser(target)          — editar datos / cambiar contraseña de otro
  //   canDeactivateUser(target)    — activar / desactivar
  //   canAssignRole(roleName)      — qué roles puede ofrecer en un selector
  const canViewUsers      = useCallback(() => !!user && access.canViewUsers(user), [user])
  const canCreateUser     = useCallback((newUser) => !!user && access.canCreateUser(user, newUser), [user])
  const canEditUser       = useCallback((target)  => !!user && access.canEditUser(user, target), [user])
  const canDeactivateUser = useCallback((target)  => !!user && access.canDeactivateUser(user, target), [user])
  const canAssignRole     = useCallback((roleName) => !!user && access.canAssignRole(user, roleName), [user])

  // ─── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async ({ username, password }) => {
    const { data } = await api.post('auth/login', { username, password })
    console.log('User Data: ', data)
    sessionStorage.setItem('accessToken', data.accessToken)
    setUser(data.user)
    console.log(data.user);
    return data.user
  }, [])

  // ─── Logout ────────────────────────────────────────────────────────────────
  // [FIX] Limpia también el estado de POS guardado en localStorage
  // (pos_register_session / pos_cart_session). Antes solo se borraba al
  // hacer corte de caja (closeRegister), así que si un usuario salía sin
  // cerrar caja y hacía logout, esos datos quedaban vivos en el navegador
  // y el siguiente usuario que iniciara sesión ahí (mismo dispositivo)
  // terminaba "heredando" la sesión de caja del usuario anterior.
  const clearPosLocalState = () => {
    try {
      localStorage.removeItem('pos_register_session')
      localStorage.removeItem('pos_cart_session')
    } catch (_) { /* noop */ }
  }

  const logout = useCallback(async () => {
    try { await api.post('auth/logout') } catch (_) { /* ignorar */ }
    sessionStorage.removeItem('accessToken')
    clearPosLocalState()
    setUser(null)
  }, [])

  // ─── Verificar sesión al montar (refresh silencioso) ───────────────────────
  // [FIX] refreshSession comparte el refresh en curso. En desarrollo,
  // React.StrictMode corre este efecto dos veces; antes salían dos refresh
  // con la misma cookie, el backend tomaba el segundo como reutilización de
  // token y revocaba todas las sesiones (ver services/session.js).
  // refreshSession no pasa por los interceptores de api.js: si el refresh
  // devuelve 401, lo maneja este catch sin que se dispare auth:logout.
  useEffect(() => {
    const verifySession = async () => {
      try {
        // refreshSession deja el token nuevo en sessionStorage, y api.js lo adjuntará
        await refreshSession()
        const me = await api.get('auth/me')
        setUser(me.data.data)
      } catch (_) {
        // No hay sesión válida — limpiar por si quedó algo
        sessionStorage.removeItem('accessToken')
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }
    verifySession()
  }, [])

  // ─── Logout forzado desde interceptor de api.js ────────────────────────────
  useEffect(() => {
    const handleForceLogout = () => {
      sessionStorage.removeItem('accessToken')
      clearPosLocalState()
      setUser(null)
    }
    window.addEventListener('auth:logout', handleForceLogout)
    return () => window.removeEventListener('auth:logout', handleForceLogout)
  }, [])

  return (
    <UserContext.Provider value={{
      user, isLoading, login, logout, hasPermission,
      isAdmin, isCentralAdmin, isSuperadmin,
      canViewUsers, canCreateUser, canEditUser, canDeactivateUser, canAssignRole,
    }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => useContext(UserContext)
export default UserContext