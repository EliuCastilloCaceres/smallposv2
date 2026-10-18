# 01 — Infraestructura de tests

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Lista** | 2026-10-17 | 2026-10-17 |

## Objetivo

La constitución (§7) exige que cada tarea termine con sus tests escritos y en verde, pero hoy el proyecto no tiene tests: ni framework, ni script `test`, ni base de datos de pruebas. Esta spec monta esa infraestructura en el backend y en el frontend, para que las specs siguientes (empezando por el fix de costos e índices de `docs/reportes-borrador.md`) puedan cerrar sus tareas.

Es para quien desarrolla el proyecto, sea persona o agente. No cambia nada visible para los usuarios del POS.

## Historias de usuario

- Como **desarrollador**, quiero correr los tests del backend y del frontend con un solo comando en cada lado, para confirmar que una tarea no rompe nada antes de darla por terminada.
- Como **desarrollador**, quiero que los tests del backend corran contra una base MySQL propia y desechable, para no tocar nunca los datos de desarrollo ni de producción.
- Como **desarrollador**, quiero helpers para iniciar sesión y partir de datos conocidos, para escribir tests de la API sin repetir la preparación en cada uno.
- Como **dueño del proyecto**, quiero que los tests sigan la misma estructura en todas las specs, para revisarlos con facilidad.

## Alcance

**Incluye**
- Jest y supertest en el backend.
- Vitest, React Testing Library y jsdom en el frontend.
- Una base MySQL de pruebas en un servicio aparte de Docker Compose, creada desde `backend/sql-init/`.
- Separar la creación de la app Express del arranque del servidor, para probar la API sin abrir un puerto.
- Helpers de pruebas: inicio de sesión, usuarios de prueba y reinicio de datos.
- Scripts `npm test` en `backend/` y en `frontend/`.
- Tests de humo que demuestran que todo lo anterior funciona.
- Documentación en `docs/tests.md` y los comandos exactos en `AGENTS.md`.

**No incluye**
- Tests de los módulos existentes más allá de los de humo. Cada spec futura escribe los tests de lo que toca.
- Tests de punta a punta en navegador (Playwright, Cypress).
- Umbral mínimo de cobertura.
- Runner de migraciones de base de datos: va en la spec del fix de costos, que es la primera que cambia el esquema.
- Integración continua (GitHub Actions): puede ser una spec posterior.
- Actualizar Vite: queda para su propia spec.
- Documentación en `shared-features/`: el usuario decidió no portar esta spec a smallpos-saas.

## Requisitos

### Herramientas
1. **Backend:** Jest como runner y supertest para probar la API HTTP. Se elige Jest porque el backend es CommonJS y el `vi.mock` de Vitest no intercepta `require`.
2. **Frontend:** Vitest 0.34.x, la última versión compatible con Vite 4, con React Testing Library, los matchers de `@testing-library/jest-dom` y jsdom. Esta versión ya no recibe mantenimiento; se actualizará junto con Vite, en su propia spec.
3. Los tests del frontend usan el mismo plugin de React que `vite.config.js`, así que el JSX y los imports se resuelven igual que en la app.

### Comandos
4. `npm test` en `backend/` corre todos los tests del backend, y `npm test` en `frontend/` corre todos los del frontend.
5. Los dos terminan con código de salida 0 si todo pasa y con un código distinto de 0 si falla algún test.
6. Las dependencias de pruebas van en `devDependencies`. `docker-compose.prod.yml` y los Dockerfiles no cambian, y el comportamiento en producción tampoco. Como `backend/dockerfile` usa un `npm install` simple, la imagen de producción incluye las `devDependencies` (igual que hoy con nodemon); quitarlas requiere un Dockerfile de producción aparte y queda para otra spec.

### Base de datos de pruebas
7. La base de pruebas vive en un servicio `mysql_test` aparte en `docker-compose.yml`:
   - con el perfil `test`, así que no se levanta con el `docker compose up` normal, solo cuando se van a correr los tests;
   - con los datos en memoria (tmpfs), así que se borran al apagar el servicio;
   - expuesta en el puerto 3308 del host.
8. `mysql_test` corre con la zona horaria `-04:00`, la misma del MySQL de producción según `utils/timezone.js`, para que los tests de fechas detecten errores de zona horaria.
9. Los tests de integración del backend usan solo esa base, nunca la de desarrollo ni la de producción.
10. **Candado de seguridad:** si el nombre de la base configurada no termina en `_test`, los tests se niegan a correr y muestran un mensaje claro.
11. La base de pruebas se crea con `backend/sql-init/01-schema.sql` y `02-seeds.sql`, los mismos de una instalación nueva, para probar contra el esquema real.
12. Antes de cada archivo de tests, la base vuelve al estado de los seeds. Los datos que crea un archivo no los ve otro.
13. Los archivos de tests de integración corren en serie. No se aísla cada test con un rollback, porque los services abren sus propias conexiones y transacciones (11 de ellos usan `getConnection` o `beginTransaction`).
14. Los tests no leen `backend/.env`. Usan su propia configuración versionada, sin secretos reales. Como `.gitignore` ya ignora `.env.test`, esa configuración necesita otro nombre de archivo o vivir en el código de los tests.

### Cambios en el backend
15. `backend/app.js` crea y exporta la app Express: middlewares, rutas, la respuesta 404 y el manejador de errores. `backend/index.js` solo la importa y arranca el servidor.
16. `backend/src/config/db.js` deja de terminar el proceso al importarse cuando no hay conexión. La verificación de conexión al arrancar pasa a `index.js` y se comporta igual que hoy: si no conecta, muestra el error y sale.
17. `npm run dev` y `npm start` se comportan igual que hoy.

### Helpers
18. Un helper obtiene un token de acceso iniciando sesión con un usuario; por defecto, el `superadmin` de los seeds.
19. Un helper crea un usuario de prueba con el rol y la sucursal indicados, para los tests de permisos de las specs siguientes.
20. Un helper reinicia la base al estado de los seeds. Es el que se usa para cumplir el requisito 12.

### Convenciones
21. **Backend:** los tests unitarios van en `backend/tests/unit/`, los de integración en `backend/tests/integration/` y los helpers en `backend/tests/helpers/`. Los archivos de test se llaman `*.test.js`.
22. **Frontend:** el test va junto al archivo que prueba y se llama `<archivo>.test.js` o `<archivo>.test.jsx`.
23. Los nombres de `describe` e `it` van en inglés, como el resto del código (constitución §6).

### Documentación
24. `docs/tests.md` explica cómo levantar la base de pruebas, cómo correr los tests de cada lado, cómo escribir un test nuevo y qué helpers hay.
25. En `AGENTS.md`, la sección "Al terminar cualquier tarea" lista los comandos exactos para correr los tests.

## Tareas

- [x] **T1. Runner del backend** (requisitos 1 y 4–6). Instalar Jest y supertest, y agregar `npm test`.
  — tests: unitario de `todayInMexico` (`src/utils/timezone.js`) con el reloj fijado poco después de la medianoche UTC; debe devolver el día de México, no el de UTC.
- [x] **T2. Separar la app del arranque** (requisitos 15–17).
  — tests: `GET /` responde 200 con `status: 'ok'`; una ruta inexistente responde 404 con el mensaje "Ruta no encontrada".
- [ ] **T3. Base de pruebas** (requisitos 7–14).
  — tests: el candado rechaza una base cuyo nombre no termina en `_test`; tras crear la base existe el usuario `superadmin` de los seeds; un registro creado en un archivo de tests no aparece en el siguiente; con la base en `-04:00`, `toServerDayStart` devuelve el límite esperado.
- [ ] **T4. Helpers del backend** (requisitos 18–20).
  — tests: el inicio de sesión del `superadmin` devuelve un token; una ruta protegida responde 401 sin token y 200 con token; un usuario de prueba con rol cajero recibe 403 en una ruta que pide un permiso que ese rol no tiene.
- [ ] **T5. Runner del frontend** (requisitos 2–6).
  — tests: `fmtDate` (`src/utils/dateFormatter.js`) devuelve el valor por defecto con fechas nulas o inválidas y formatea en hora de México; `hasUserPermission` (`src/helpers/userAccess.js`) responde según la lista de permisos; `ConfirmDialog` (`components/Common`) muestra su título y mensaje, y llama a `onConfirm` y `onClose` con sus botones.
- [ ] **T6. Documentación** (requisitos 21–25).
  — tests: no lleva tests de código; se verifica con el criterio 7.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | `npm test` en `backend/` pasa con la base de pruebas levantada. | _(se llena al cerrar)_ |
| 2 | `npm test` en `frontend/` pasa. | _(se llena al cerrar)_ |
| 3 | Un test que falla a propósito hace que `npm test` salga con un código distinto de 0. El test se quita después. | _(se llena al cerrar)_ |
| 4 | Correr los tests del backend no cambia la base de desarrollo: los conteos de `orders`, `products` y `users` son iguales antes y después. | _(se llena al cerrar)_ |
| 5 | Con una base cuyo nombre no termina en `_test`, los tests se niegan a correr. | _(se llena al cerrar)_ |
| 6 | `docker compose up` levanta los mismos tres servicios de hoy y el POS funciona igual. `docker-compose.prod.yml` no cambia. | _(se llena al cerrar)_ |
| 7 | Siguiendo solo `docs/tests.md` se levanta la base de pruebas y se corren los tests de los dos lados. | _(se llena al cerrar)_ |
| 8 | Si MySQL no está disponible, `npm start` muestra el error y sale, igual que hoy. | _(se llena al cerrar)_ |

## Dudas abiertas

- _Ninguna._

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-17 | Creación de la spec. | — |
| 2026-10-17 | Se resuelven las 7 dudas: Jest en el backend; Vitest 0.34 en el frontend sin actualizar Vite; servicio `mysql_test` con perfil `test`, datos en memoria y puerto 3308; zona horaria `-04:00`; el runner de migraciones va en la spec del fix de costos; sin integración continua; sin documentación en `shared-features/`. | Usuario |
| 2026-10-17 | Pasa a **Lista**. | Usuario |
| 2026-10-17 | Requisito 6: la imagen de producción incluye las `devDependencies` porque `backend/dockerfile` usa `npm install` simple; se acepta y se aclara el texto. T1 terminada. | Usuario |
| 2026-10-17 | T2 terminada. | Usuario |
