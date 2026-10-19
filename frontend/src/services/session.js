// src/services/session.js
// Refresh de sesión compartido: un solo POST /auth/refresh en curso por
// pestaña. El backend rota el refresh token en cada llamada y trata un token
// ya rotado como reutilización (revoca TODAS las sesiones del usuario), así
// que dos refresh simultáneos con la misma cookie cierran la sesión. Pasaba
// al recargar: React.StrictMode monta UserContext dos veces en desarrollo.
// Ver specs/02-fix-sesion-al-recargar.md.
//
// Usa axios DIRECTO, no la instancia de api.js: así el 401 de un refresh
// fallido no pasa por el interceptor que dispara otro refresh.

import axios from 'axios'

let inFlight = null

// Devuelve el access token nuevo y lo guarda en sessionStorage. Si ya hay un
// refresh en curso, devuelve esa misma promesa (mismo token o mismo error).
export const refreshSession = () => {
  if (!inFlight) {
    // Ruta RELATIVA a propósito: pasa por el proxy de Vite (o Nginx) y
    // funciona igual desde LAN o túneles (ver comentario en UserContext).
    inFlight = axios
      .post('/api/auth/refresh', {}, { withCredentials: true })
      .then(({ data }) => {
        sessionStorage.setItem('accessToken', data.accessToken)
        return data.accessToken
      })
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}
