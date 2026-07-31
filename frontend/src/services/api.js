// src/services/api.js
// Cliente HTTP centralizado con:
//  · Access token en Authorization header
//  · Refresh token automático cuando el servidor devuelve 401
//  · Cola de requests pendientes durante el refresh para no perder llamadas
//  · Logout automático si el refresh falla

import axios from 'axios'

const api = axios.create({
  baseURL:         import.meta.env.VITE_URL_BASE,
  withCredentials: true, // necesario para que el browser envíe la cookie del refreshToken
})

// ─── Cola de requests que llegaron mientras se hacía el refresh ───────────────
let isRefreshing  = false
let failedQueue   = []

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(token)
  )
  failedQueue = []
}

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

    // Si ya se está haciendo refresh, encolar este request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then((token) => {
        original.headers['Authorization'] = `Bearer ${token}`
        return api(original)
      })
    }

    original._retry = true
    isRefreshing    = true

    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_URL_BASE}auth/refresh`,
        {},
        { withCredentials: true }
      )
      const newToken = data.accessToken
      sessionStorage.setItem('accessToken', newToken)
      processQueue(null, newToken)
      original.headers['Authorization'] = `Bearer ${newToken}`
      return api(original)
    } catch (refreshError) {
      processQueue(refreshError, null)
      // El refresh falló → limpiar sesión y redirigir al login
      sessionStorage.removeItem('accessToken')
      window.dispatchEvent(new CustomEvent('auth:logout'))
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

export default api
