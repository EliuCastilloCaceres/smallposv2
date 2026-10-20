# 02 — Fix: la sesión se cierra al recargar la página

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Terminada** | 2026-10-18 | 2026-10-20 |

## Objetivo

Al recargar la página en desarrollo, la sesión se cierra y la app manda al login. Esta spec corrige la causa en el frontend para que recargar no cierre la sesión, sin debilitar la protección contra tokens robados del backend.

**Causa, confirmada el 2026-10-18:**
1. `React.StrictMode` (en desarrollo) ejecuta dos veces el efecto que verifica la sesión al montar `UserContext`, así que salen dos `POST /api/auth/refresh` con la misma cookie.
2. El primero rota el token: revoca el actual, crea uno nuevo y responde 200.
3. El segundo llega con el token que ya se revocó. `authService.refresh` lo trata como **reutilización**: revoca **todas** las sesiones del usuario, incluido el token nuevo del primero, y responde 401.

**Evidencia:**
- En DevTools se ven dos refresh desde `UserContext` al recargar: uno responde 200 y el otro 401.
- En `refresh_tokens` hay revocaciones masivas a las 06:07:02, 06:07:28, 06:28:08 y 06:29:41 (UTC), cada una 2–3 segundos después de una rotación del mismo token.
- Contra la base de pruebas, dos refresh simultáneos con la misma cookie cerraron la sesión en 1 de 20 intentos; reenviar la cookie vieja la cerró siempre.

**Por qué antes no pasaba:** el código es igual desde julio (backend) y septiembre (frontend), y smallpos-saas tiene el mismo. El resultado depende de cuánto tarda el segundo refresh. Si llega antes de que el primero termine, los dos responden 200. En el entorno actual de Docker, el segundo llega 2–3 segundos tarde y pierde siempre.

**Riesgo en producción:** el build de producción no ejecuta dos veces los efectos, pero el mismo choque puede darse por otras vías:
- la verificación de `UserContext` y el interceptor de `api.js` no comparten el refresh en curso;
- dos pestañas que renuevan al mismo tiempo;
- recargar mientras un refresh sigue en curso.

## Historias de usuario

- Como **usuario**, quiero recargar la página sin perder la sesión, para no tener que iniciar sesión otra vez.
- Como **usuario con la app abierta en varios dispositivos**, quiero que una recarga en uno no me saque de los demás.
- Como **administrador**, quiero que la detección de tokens reutilizados siga cerrando las sesiones cuando un token robado se usa, para que el fix no abra un hueco de seguridad.

## Alcance

**Incluye**
- Frontend: un solo refresh en curso por pestaña, compartido por la verificación de sesión de `UserContext` y el interceptor de `api.js`.
- Tests de frontend que reproducen el error con `React.StrictMode`.
- Tests de backend que fijan el comportamiento actual de la detección de reutilización, para que no se debilite.
- Backend: la revocación masiva deja de sobrescribir `revoked_at` de los tokens ya revocados.
- **Documentación en `shared-features/`:** sí, como `fix-sesion-al-recargar.md` (decisión del usuario, 2026-10-18). smallpos-saas tiene el mismo código en `UserContext`, `api.js` y `authService.refresh`.

**No incluye**
- Quitar `React.StrictMode`.
- Cambiar la duración de los tokens (15 min el de acceso, 7 días el de refresh) ni dónde se guarda el token de acceso (`sessionStorage`).
- Coordinar el refresh entre pestañas.
- Un margen en el backend para refresh casi simultáneos (dos pestañas a la vez, recargar con un refresh en curso). La detección de reutilización queda tan estricta como hoy; si esos casos aparecen, puede ser otra spec.
- Una pantalla para ver o cerrar sesiones.
- Portar el fix a smallpos-saas: aquí solo se documenta.

## Requisitos

### Frontend
1. **Un solo refresh en curso por pestaña.** Si se pide un refresh mientras otro sigue en curso, se reutiliza la misma petición y todos reciben su mismo resultado (el token nuevo o el error). Al terminar, el siguiente refresh hace una petición nueva.
2. La verificación de sesión de `UserContext` y el interceptor de `api.js` usan ese mismo refresh compartido.
3. Con `React.StrictMode`, recargar la página manda **un solo** `POST /api/auth/refresh`.
4. El refresh usa la ruta relativa `/api/auth/refresh`, como hoy en `UserContext` (su comentario explica por qué: LAN y túneles). Con la configuración actual (`VITE_URL_BASE=/api/`) es la misma URL que usa hoy el interceptor.
5. Se mantiene el comportamiento actual en todo lo demás:
   - La verificación al cargar sigue sin pasar por los interceptores: si el refresh falla, deja `user` en `null` y la app manda al login.
   - En el interceptor, los requests que reciben 401 mientras hay un refresh en curso esperan a que termine y se reintentan con el token nuevo.
   - Si el refresh del interceptor falla, se borra el token de acceso y se dispara `auth:logout`.
   - Un 401 con código `INVALID_CREDENTIALS` no dispara refresh.

### Backend
6. La detección de reutilización sigue igual: presentar un refresh token ya revocado responde 401 y revoca todas las sesiones del usuario.
7. Esa revocación masiva solo toca los tokens que siguen activos (`AND revoked = 0`). Los que ya estaban revocados conservan su `revoked_at` original.

## Tareas

- [x] **T1. Refresh compartido** (requisitos 1 y 4).
  — tests: dos llamadas simultáneas hacen una sola petición y reciben el mismo token; si la petición falla, las dos reciben el error; terminada la primera, una llamada nueva hace otra petición.
- [x] **T2. `UserContext` usa el refresh compartido** (requisitos 2, 3 y 5).
  — tests: montar `UserContextProvider` dentro de `React.StrictMode` hace un solo `POST /api/auth/refresh` y deja al usuario cargado; si el refresh falla, `user` queda en `null`.
- [x] **T3. El interceptor de `api.js` usa el refresh compartido** (requisitos 2 y 5).
  — tests: un request con 401 provoca un refresh y se reintenta con el token nuevo; dos requests con 401 al mismo tiempo provocan un solo refresh y los dos se reintentan; si el refresh falla, se dispara `auth:logout` y los requests fallan; un 401 con `INVALID_CREDENTIALS` no dispara refresh.
- [x] **T4. Detección de reutilización en el backend** (requisitos 6 y 7).
  — tests: refresh con un token válido responde 200 y rota el token; reenviar el token ya rotado responde 401 y revoca todas las sesiones del usuario, incluida la nueva; los tokens que ya estaban revocados conservan su `revoked_at`.
- [x] **T5. Documentación en `shared-features/`.** Crear `fix-sesion-al-recargar.md` con la estructura de `sf-index.md` y agregarlo al índice.
  — tests: no lleva tests de código.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | En desarrollo, recargar la página 10 veces seguidas no cierra la sesión, y DevTools muestra un solo `POST /api/auth/refresh` por recarga. | Prueba manual del usuario (2026-10-20): un solo `POST /api/auth/refresh` por recarga y la sesión no se cierra. Test `sends a single refresh under StrictMode and loads the user` (`UserContext.test.jsx`). |
| 2 | Reenviar a propósito un refresh token ya rotado responde 401 y revoca las sesiones del usuario. | Contra el backend de desarrollo (2026-10-20), con un usuario temporal que después se borró: se inicia sesión en A y B y se rota el token de A. Reenviar el token viejo de A → 401 "Alerta de seguridad: Intento de reutilización de token. Sesión cerrada."; después, el token nuevo de A y el de B → 401. Las 3 sesiones quedan revocadas; el token rotado conserva su `revoked_at` (16:17:22) y las otras dos se revocan al reenviar (16:17:24). Tests en `backend/tests/integration/auth/refresh.test.js`. |
| 3 | Con una cookie de refresh inválida, cargar la app manda al login, igual que hoy. | Contra el backend de desarrollo (2026-10-20): refresh con cookie inválida → 401 "Refresh token inválido o expirado"; sin cookie → 401 "Refresh token no proporcionado". Con el refresh fallido, `UserContext` deja `user` en `null` (test `leaves no user when the refresh fails`) y `App.jsx` manda a `/login`. No se probó en el navegador. |
| 4 | Con el token de acceso vencido, la app lo renueva sola al hacer cualquier petición y sigue funcionando. | Prueba manual del usuario (2026-10-20), con el token de acceso a 1 minuto de forma temporal (sin commit; se regresó a 15 min): las peticiones responden 401, sale un refresh y se repiten con éxito (304, por caché). La pantalla carga sin mandar al login. Test `refreshes on 401 and retries the request with the new token` (`api.test.js`). |
| 5 | `shared-features/fix-sesion-al-recargar.md` existe y está en el índice. | Commit `90036b8`. |
| 6 | Los tests del backend y del frontend pasan. | 2026-10-20: backend 33/33 (8 suites), frontend 28/28 (6 archivos). |

## Dudas abiertas

- _Ninguna._

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-18 | Creación de la spec. | — |
| 2026-10-18 | Se resuelven las 2 dudas: sin margen en el backend para refresh casi simultáneos (la detección de reutilización queda tan estricta como hoy); la revocación masiva agrega `AND revoked = 0` para no sobrescribir `revoked_at`. | Usuario |
| 2026-10-18 | Pasa a **Lista**. | Usuario |
| 2026-10-18 | T1 terminada: `refreshSession()` en `frontend/src/services/session.js`; también guarda el token nuevo en `sessionStorage`. | Usuario |
| 2026-10-18 | T2 terminada. El test con `React.StrictMode` falla contra el `UserContext` anterior (2 refresh) y pasa con el nuevo (1). | Usuario |
| 2026-10-19 | T3 terminada: el interceptor de `api.js` usa `refreshSession()` y se quita su cola propia. El test de un 401 durante la verificación de `UserContext` falla contra el interceptor anterior (2 refresh) y pasa con el nuevo (1). Si el refresh falla, ahora cada request en espera dispara `auth:logout` (antes, uno solo); el manejador es idempotente. | Usuario |
| 2026-10-19 | T4 terminada: la revocación masiva de `authService.refresh` agrega `AND revoked = 0`. Tests en `backend/tests/integration/auth/refresh.test.js`; el de `revoked_at` falla contra el código anterior y pasa con el nuevo. Se agrega un test que no pedía la spec: la revocación no toca las sesiones de otros usuarios. | Usuario |
| 2026-10-19 | T5 terminada: `shared-features/fix-sesion-al-recargar.md`, agregado al índice. Sus notas para portar se revisaron contra el código de smallpos-saas. | Usuario |
| 2026-10-20 | Evidencia de los 6 criterios de aceptación: 1 y 4 los probó el usuario en el navegador; 2 y 3, contra el backend de desarrollo. | Usuario |
| 2026-10-20 | Pasa a **Terminada**. | Usuario |
