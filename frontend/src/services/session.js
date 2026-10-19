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
    // IMPORTANTE: ruta RELATIVA, no la URL absoluta de VITE_URL_BASE. Con
    // ruta absoluta, el navegador pega directo a esa URL sin pasar por el
    // proxy de Vite: funciona en tu máquina porque VITE_URL_BASE apunta a
    // tu propio localhost, pero se rompe para cualquiera que entre por LAN
    // o túnel (Cloudflare/ngrok), porque esa URL apunta al localhost de
    // CADA quien. La ruta relativa pasa por el proxy (o Nginx) siempre.
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
