# fix: La sesión se cierra al recargar la página

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Borrador** | fix | smallposv2 | smallpos-saas | `c4c34d5`–`265e89f` | 2026-10-19 |

## Resumen

Recargar la página ya no cierra la sesión. El fix tiene dos partes:

- **Frontend:** un solo `POST /api/auth/refresh` en curso por pestaña. La función `refreshSession()` (nuevo `frontend/src/services/session.js`) reutiliza la petición que ya esté en curso, y todos los que la llamen reciben el mismo resultado: el token nuevo o el mismo error. La usan la verificación de sesión de `UserContext` y el interceptor de `api.js`.
- **Backend:** la detección de reutilización sigue igual de estricta. Al revocar todas las sesiones del usuario, ahora solo toca las que siguen activas (`AND revoked = 0`). Las que ya estaban revocadas conservan su `revoked_at` original.

Spec completa: [`specs/02-fix-sesion-al-recargar.md`](../specs/02-fix-sesion-al-recargar.md).

## Motivo

La causa se confirmó el 2026-10-18:

1. `React.StrictMode`, en desarrollo, ejecuta dos veces el efecto que verifica la sesión al montar `UserContext`. Salen dos refresh con la misma cookie.
2. El primero rota el token: revoca el actual, crea uno nuevo y responde 200.
3. El segundo llega con el token ya revocado. `authService.refresh` lo trata como **reutilización**, revoca **todas** las sesiones del usuario (incluida la del token nuevo) y responde 401.

En producción no hay `StrictMode`, pero el mismo choque puede darse porque la verificación de `UserContext` y el interceptor de `api.js` no compartían el refresh en curso.

La revocación masiva además reescribía `revoked_at` de los tokens que ya estaban revocados. Así se perdía cuándo se rotó o cerró cada sesión.

## Historias de usuario

- Como **usuario**, quiero recargar la página sin perder la sesión, para no tener que iniciar sesión otra vez.
- Como **usuario con la app abierta en varios dispositivos**, quiero que una recarga en uno no me saque de los demás.
- Como **administrador**, quiero que la detección de tokens reutilizados siga cerrando las sesiones cuando un token robado se usa, para que el fix no abra un hueco de seguridad.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `frontend/src/context/UserContext.jsx` | `verifySession` usa `refreshSession()` en vez de su propio `axios.post`, y después pide `auth/me`. Si falla, deja `user` en `null` como antes. |
| `frontend/src/services/api.js` | El interceptor de 401 usa `refreshSession()`. Se quitan `isRefreshing`, `failedQueue` y `processQueue`: compartir la promesa en curso hace lo mismo. Si el refresh falla, borra el token y dispara `auth:logout`, como antes. |
| `backend/src/services/authService.js` | `refresh`: la revocación masiva por reutilización agrega `AND revoked = 0`. |

## Archivos agregados

| Archivo | Qué es |
|---|---|
| `frontend/src/services/session.js` | `refreshSession()`: el refresh compartido. Usa la ruta relativa `/api/auth/refresh` y `axios` directo (sin los interceptores de `api.js`), y guarda el token nuevo en `sessionStorage`. |
| `frontend/src/services/session.test.js` | Usa la ruta relativa; dos llamadas simultáneas hacen una sola petición; si falla, las dos reciben el error; al terminar, bien o mal, la siguiente hace otra petición. |
| `frontend/src/context/UserContext.test.jsx` | Dentro de `React.StrictMode`, montar `UserContextProvider` hace un solo refresh y carga al usuario; si falla el refresh o `auth/me`, `user` queda en `null`. |
| `frontend/src/services/api.test.js` | El interceptor: reintento con el token nuevo, un solo refresh para varios 401, reutilizar el refresh de `UserContext`, logout si falla, `INVALID_CREDENTIALS` y un solo reintento. |
| `backend/tests/integration/auth/refresh.test.js` | Rotación del token, reutilización (revoca todo, incluida la sesión nueva y la de otro dispositivo), no toca a otros usuarios, y los ya revocados conservan su `revoked_at`. |

## Tareas realizadas

- [x] Refresh compartido en `services/session.js` (`c4c34d5`).
- [x] `UserContext` usa el refresh compartido; con `StrictMode` sale un solo refresh (`c990a02`).
- [x] El interceptor de `api.js` usa el refresh compartido (`54cb7fa`).
- [x] Backend: la revocación masiva solo toca tokens activos; tests de la detección de reutilización (`265e89f`).
- [x] Los tests que reproducen el error fallaban contra el código anterior y pasan con el nuevo.

## Criterios de aceptación

_Pendiente. Se llenan después de implementar._

## Notas para portar a smallpos-saas

Revisado contra el código de smallpos-saas el 2026-10-19.

- **`api.js` ya tiene su refresh compartido.** saas tiene un `refreshSession()` propio, interno de `frontend/src/services/api.js` (variable `refreshing`). Lo comparten el interceptor de 401 y el de `AUTH_PASSWORD_CHANGE_REQUIRED`. Esta parte (la T3 de la spec) ya está hecha allá.
- **Falta `UserContext`: el error existe en saas.** `verifySession` sigue haciendo su propio `axios.post('/api/auth/refresh')`, y `main.jsx` usa `React.StrictMode`. Hay que hacer que use el mismo refresh compartido de `api.js`, exportándolo o moviéndolo a `services/session.js` como aquí.
- **El refresh de saas hace más cosas que el de aquí.** Revisarlas antes de que `UserContext` lo use:
  - Devuelve `data` completo, con `profile` (Spec 09, RF-9), no solo el token. `verifySession` lo necesita para `setProfile(data.profile)`.
  - Si tiene éxito, dispara `auth:session`, que también hace `setProfile`. Es redundante con `verifySession`, pero no estorba.
  - Si falla, dispara `auth:logout`. Al cargar sin sesión, eso ejecutaría `handleForceLogout`, que llama a `clearPosLocalState()`, además del `catch` de `verifySession`. Si no se quiere ese efecto al cargar, conviene separarlo como aquí: una función base que solo hace la petición y guarda el token, y los eventos en el interceptor.
- **Backend:** `authService.refresh` de saas tiene la misma revocación masiva sin `AND revoked = 0`, en el bloque `stored.revoked === 1`. Se porta tal cual. `db` es tenant-aware y `refresh_tokens` vive en la base de cada tenant, así que la query no cambia. Las demás revocaciones de saas (`userService.js`, `scripts/reset-owner-password.js`) ya usan `AND revoked = 0`.
- **Tests:** los del backend de saas simulan `db` (por ejemplo, `tests/authSession.test.js` reconoce el SQL con `sql.includes(...)`) en lugar de usar una base de pruebas. `tests/integration/auth/refresh.test.js` no se porta tal cual: se reescribe con esas simulaciones, por ejemplo revisando que el SQL de la revocación masiva lleve `AND revoked = 0`. Ningún test actual de saas revisa ese SQL, así que el cambio no rompe los existentes. En el frontend, saas ya tiene `api.test.js`; falta un test de `UserContext` con `StrictMode` como el de aquí.
