
## Proyecto
smallposv2 es un sistema de punto de venta (POS) web para comercios con varias sucursales y cajas. Cubre:
- **Ventas:** venta en mostrador, incluidos pagos mixtos, ventas a crédito y apartados.
- **Cobranza y devoluciones:** créditos con abonos y devoluciones.
- **Catálogo:** clientes, productos e inventario (con carga masiva CSV y códigos de barras) y proveedores.
- **Caja y reportes:** cortes de caja, reportes y dashboard.
- **Acceso:** usuarios con permisos por rol (RBAC) y una vista consolidada para el administrador central.

Opera en pesos mexicanos y hora de México. Es la base del proyecto derivado **smallpos-saas** (multitenant); las mejoras que se deban portar a ese proyecto se documentan en `shared-features/`.

Stack:
- **Backend** (`backend/`): Node.js + Express, en capas routes → controllers → services, sobre MySQL 8 con SQL directo vía `mysql2`. Esquema y seeds en `backend/sql-init/`; autenticación con JWT.
- **Frontend** (`frontend/`): React 18 + Vite con React Router, Context API, Bootstrap y un CSS por módulo. Consume la API bajo `/api` a través del proxy de Vite.
- **Entornos:** desarrollo con Docker Compose (`docker-compose.yml`, con hot reload); producción con `docker-compose.prod.yml` y Nginx.


## Estilo y convenciones
- Identificadores en inglés; mensajes de usuario en español.

## Reglas
- Lee docs/constitution.md y la spec en progreso antes de tocar código.
- No modifiques archivos dentro de `specs/` salvo petición explícita.
- Todo cambio de esquema o de datos de la base va en una migración de `backend/migrations/`, con su test. `backend/sql-init/` no se edita para eso (detalles en `docs/migraciones.md`).
- **`shared-features/` solo con confirmación del usuario.** No toda feat/fix se porta a smallpos-saas:
  - Al redactar la spec de cada feat/fix, pregunta al usuario si se documenta en `shared-features/` y registra la respuesta en el alcance de la spec.
  - Si no lo preguntaste o no hubo respuesta, pregunta antes de cerrar la tarea. Nunca lo documentes por tu cuenta.
  - Si la respuesta es sí, créalo como `feat-<tema>.md` o `fix-<tema>.md`, siguiendo la estructura de `shared-features/sf-index.md`, y agrégalo a la tabla del índice.

## Al terminar cualquier tarea
- Ejecuta los tests de los dos lados y confirma en tu respuesta que todo pasa (detalles en `docs/tests.md`):
  - **Backend:** `docker compose --profile test up -d --wait mysql_test` y después `npm test` en `backend/`.
  - **Frontend:** `npm test` en `frontend/`.