// src/services/api.js
// Cliente HTTP centralizado con:
//  · Access token en Authorization header
//  · Refresh token automático cuando el servidor devuelve 401
//  · Requests que reciben 401 durante un refresh esperan ese mismo refresh
//  · Logout automático si el refresh falla

import axios from 'axios'
import { refreshSession } from './session'

const api = axios.create({
  baseURL:         import.meta.env.VITE_URL_BASE,
  withCredentials: true, // necesario para que el browser envíe la cookie del refreshToken
})

// ─── Interceptor de request: añade el access token ───────────────────────────
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('accessToken')
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

// ─── Interceptor de response: maneja 401 con refresh automático ───────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    // Captura el código que tu middleware ahora sí enviará de forma segura
    const errorCode = error.response?.data?.code

    // Si no es 401, o ya reintentamos, propagar el error
    if (error.response?.status !== 401 || original._retry || errorCode === 'INVALID_CREDENTIALS' ) {
      return Promise.reject(error)
    }

    original._retry = true

    // [FIX] refreshSession comparte el refresh en curso: los requests que
    // reciben 401 al mismo tiempo, o mientras UserContext verifica la sesión,
    // esperan ese MISMO refresh en vez de mandar el suyo. Antes este
    // interceptor hacía su propio refresh aparte del de UserContext, y dos
    // refresh con la misma cookie cierran la sesión (ver services/session.js).
    // También deja el token nuevo en sessionStorage.
    let newToken
    try {
      newToken = await refreshSession()
    } catch (refreshError) {
      // El refresh falló → limpiar sesión y redirigir al login
      sessionStorage.removeItem('accessToken')
      window.dispatchEvent(new CustomEvent('auth:logout'))
      return Promise.reject(refreshError)
    }

    original.headers['Authorization'] = `Bearer ${newToken}`
    return api(original)
  }
)

export default api
