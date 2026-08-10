// src/Context/UserContext.jsx
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import axios from 'axios'
import api from '../services/api'

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
  const isAdmin = user?.role_name === 'admin'

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

  // ─── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async ({ username, password }) => {
    const { data } = await api.post('auth/login', { username, password })
    sessionStorage.setItem('accessToken', data.accessToken)
    setUser(data.user)
    return data.user
  }, [])

  // ─── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try { await api.post('auth/logout') } catch (_) { /* ignorar */ }
    sessionStorage.removeItem('accessToken')
    setUser(null)
  }, [])

  // ─── Verificar sesión al montar (refresh silencioso) ───────────────────────
  useEffect(() => {
    const verifySession = async () => {
      try {
        // Usar axios DIRECTO — no la instancia api con interceptores.
        // Si usamos api.js y el refresh devuelve 401, el interceptor de
        // respuesta intenta otro refresh, falla y dispara auth:logout,
        // limpiando el usuario antes de que este try/catch pueda manejarlo.
        //
        // IMPORTANTE: usar ruta RELATIVA ('/api/auth/refresh'), no la URL
        // absoluta de VITE_URL_BASE. Con ruta absoluta, el navegador pega
        // directo a esa URL sin pasar por el proxy de Vite — funciona en tu
        // máquina porque VITE_URL_BASE apunta a tu propio localhost, pero
        // se rompe para cualquiera que acceda por LAN o túnel (Cloudflare/
        // ngrok), porque esa URL absoluta apunta al localhost de CADA
        // quien la ejecuta, no al servidor real. La ruta relativa sí pasa
        // por el proxy configurado en vite.config.js y funciona igual
        // sin importar desde dónde se acceda al frontend.
        const { data } = await axios.post(
          '/api/auth/refresh',
          {},
          { withCredentials: true }
        )
        sessionStorage.setItem('accessToken', data.accessToken)

        // Con el nuevo token ya en sessionStorage, api.js lo adjuntará
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
      setUser(null)
    }
    window.addEventListener('auth:logout', handleForceLogout)
    return () => window.removeEventListener('auth:logout', handleForceLogout)
  }, [])

  return (
    <UserContext.Provider value={{ user, isLoading, login, logout, hasPermission, isAdmin, isCentralAdmin }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => useContext(UserContext)
export default UserContext