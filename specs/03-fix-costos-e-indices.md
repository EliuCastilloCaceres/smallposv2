# 03 — Fix: costos de venta, costo de apartados e índices de fecha

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Terminada** | 2026-10-20 | 2026-10-20 |

## Objetivo

Es la **spec 0** del orden de [`docs/reportes-borrador.md`](../docs/reportes-borrador.md) (§6): deja confiables los datos de costo y prepara la base de datos antes de construir los reportes nuevos. Es para quien use esos reportes (supervisores, administradores) y para quien desarrolla el proyecto.

Corrige tres problemas del borrador (§3.3 y §4):

1. **El costo de venta lo decide el cliente.** `orderService.createOrder` guarda en `order_details.purchase_price` el `purchase_price` que manda el POS, sin validarlo. El POS lo toma del catálogo con un respaldo `?? 0` (`frontend/src/components/Pos/Pos.jsx:114`). Cualquier cliente de la API puede mandar el costo que quiera. Una venta con costo 0 infla la utilidad.
2. **Los apartados no guardan su costo.** `layaway_details` no tiene `purchase_price`. `layawayService.convertLayawayToOrder` toma el costo **actual** del producto al liquidar, no el del día en que se apartó.
3. **Faltan índices de fecha.** `orders`, `inventory_movements` y `returns` se filtran por `created_at` (Dashboard, Ventas, Devoluciones, historial de inventario y cortes de caja), pero no tienen índice en esa columna. Los reportes nuevos van a filtrar por rangos largos.

Además, es la primera spec que cambia el esquema de una base que ya existe. `backend/sql-init/` solo corre cuando se crea la base desde cero, así que hoy no hay forma de aplicar un cambio a la base de desarrollo ni a una instalación existente. La spec 01 dejó para esta spec el **runner de migraciones**.

**Situación en la base de desarrollo** (2026-10-20): 81 líneas de venta, ninguna con costo 0; 151 productos, ninguno con costo 0; ningún apartado. El riesgo existe en el código, aunque hoy no se vea en los datos.

## Historias de usuario

- Como **supervisor**, quiero que la utilidad de cada venta use el costo real del catálogo, para confiar en los reportes de utilidad.
- Como **supervisor**, quiero que un apartado conserve el costo del día en que se apartó, para que su utilidad no cambie si el costo sube o baja antes de liquidarlo.
- Como **administrador**, quiero que los reportes con rangos largos respondan rápido, para consultar meses de historial sin esperar.
- Como **desarrollador**, quiero aplicar los cambios de esquema con migraciones versionadas, para actualizar cualquier base existente sin hacerlo a mano.

## Alcance

**Incluye**
- Runner de migraciones en SQL: carpeta de migraciones, registro de las aplicadas, aplicación al arrancar y por comando, y uso en los tests.
- El servidor toma el costo de venta del catálogo y deja de confiar en el del cliente; el POS deja de mandarlo.
- Los apartados guardan el costo al crearse y lo usan al liquidarse.
- La regla de qué es una venta "sin costo".
- Índices de fecha en `orders`, `inventory_movements` y `returns`.
- Tests de todo lo anterior y documentación de las migraciones.
- **Documentación en `shared-features/`:** sí, como `fix-costos-e-indices.md`, incluido el runner de migraciones (decisión del usuario, 2026-10-20). smallpos-saas tiene el mismo código de costos en `orderService` y `layawayService`, y no tiene runner de migraciones.

**No incluye**
- El reporte de Ventas y utilidad, con su marca y filtro de "sin costo": va en la spec siguiente (spec 1 del borrador).
- Validar en el servidor el precio de venta (`unit_price`): el POS permite cambiar el precio de una línea a propósito.
- Corregir el costo de ventas históricas: se conservan tal como se guardaron.
- Costo propio por variante: las variantes siguen usando el costo del producto base.
- Costo promedio ponderado: llega con el módulo de compras (spec 6 del borrador).
- Índices en `cash_movements`: hoy ninguna consulta la filtra por fecha, y el módulo de gastos (spec 5 del borrador) la va a cambiar; sus índices se definen ahí.
- Migraciones en JavaScript, revertir migraciones (*down*) y bloqueo para varias instancias del backend arrancando al mismo tiempo.
- Portar el fix a smallpos-saas: aquí solo se documenta.

## Requisitos

### Migraciones
1. Los cambios de esquema y de datos se escriben como archivos **SQL** en `backend/migrations/`, con nombre `NNN-descripcion.sql` en inglés (por ejemplo, `001-add-layaway-details-purchase-price.sql`). El runner ejecuta cada archivo tal cual.
2. Una tabla `schema_migrations` registra cada migración aplicada (nombre y fecha). Cada migración se aplica **una sola vez**, en orden por nombre.
3. Las migraciones pendientes se aplican **al arrancar el backend, antes de aceptar peticiones**, y también con `npm run migrate`.
4. Si una migración falla, el backend muestra el error y sale, como hoy cuando no hay conexión a la base. La migración que falló no se registra y las siguientes no se aplican.
5. `01-schema.sql` y `02-seeds.sql` no cambian: son la base fija de una instalación nueva, y las migraciones corren encima. En una instalación nueva, Docker carga `sql-init/` y el backend aplica todas las migraciones al arrancar.
6. Los tests de integración usan el esquema final: `resetDatabase` aplica las migraciones después de los seeds. Así, cada corrida de tests también prueba las migraciones.
7. MySQL hace commit implícito con cada cambio de esquema, así que una migración que falla a la mitad puede dejar cambios parciales. Por eso cada migración hace un cambio acotado, y `docs/migraciones.md` explica qué hacer si una falla.

### Costo de venta
8. `orderService.createOrder` toma el costo de cada línea de `products.purchase_price`, dentro de la misma transacción de la venta, e **ignora** el `purchase_price` que mande el cliente. Una variante usa el costo de su producto base.
9. Si una línea trae un `product_id` que no existe, la venta se rechaza con un error de validación (400) y no se crea nada. Hoy la base rechaza el `INSERT` por la llave foránea y la API responde 500.
10. El POS deja de llevar `purchase_price` en el carrito (`Pos.jsx`) y de mandarlo al crear la venta (`PaymentModal.jsx` y `CreditModal.jsx`). El POS no lo muestra en ningún lado.
11. Si el producto tiene costo 0 en el catálogo, la venta se permite, igual que hoy, y la línea queda con costo 0.

### Costo de apartados
12. `layaway_details` agrega la columna `purchase_price`, por migración. Queda siempre llena.
13. `layawayService.createLayaway` guarda en cada detalle el costo del producto (`products.purchase_price`) al crear el apartado.
14. `convertLayawayToOrder` usa el costo guardado en el detalle, no el costo actual del producto.
15. Los detalles de apartados que ya existen se llenan, en la misma migración, con el costo actual del producto.

### Ventas "sin costo"
16. Una línea de venta es **"sin costo"** cuando `order_details.purchase_price = 0`. Esta spec solo fija la regla, sin cambiar el esquema; la marca y el filtro se muestran en el reporte de Ventas y utilidad.

### Índices
17. Una migración agrega estos índices, sin quitar ninguno de los existentes:

    | Tabla | Índice | Columnas | Lo usan hoy |
    |---|---|---|---|
    | `orders` | `idx_orders_created` | `(created_at)` | Dashboard y Ventas en vista consolidada |
    | `orders` | `idx_orders_branch_created` | `(branch_id, created_at)` | Dashboard, Ventas y productos vendidos por sucursal |
    | `orders` | `idx_orders_register_created` | `(cash_register_id, created_at)` | Corte de caja y reporte de sesiones |
    | `inventory_movements` | `idx_invmov_branch_created` | `(branch_id, created_at)` | Historial de movimientos de inventario |
    | `inventory_movements` | `idx_invmov_branch_product_created` | `(branch_id, product_id, created_at)` | Rotación (última venta por producto y sucursal) |
    | `returns` | `idx_returns_created` | `(created_at)` | Devoluciones en vista consolidada |
    | `returns` | `idx_returns_branch_created` | `(branch_id, created_at)` | Devoluciones por sucursal |

18. Las consultas existentes no cambian.

### Documentación
19. `docs/migraciones.md` explica cómo escribir una migración, cómo se aplica y qué hacer si una falla.
20. `AGENTS.md` agrega la regla de que todo cambio de esquema o de datos va en una migración, sin borrar nada de lo que ya tiene.
21. `backend/schema_decisions.md`, en "order_details — snapshot de precio", aclara que el servidor toma el costo del catálogo y que los apartados lo congelan al crearse.
22. `shared-features/fix-costos-e-indices.md` documenta el fix con la estructura de `sf-index.md` y se agrega al índice. Sus notas para portar señalan que en smallpos-saas, por ser multitenant, cada migración tiene que correr en la base de cada tenant.

## Tareas

- [x] **T1. Runner de migraciones** (requisitos 1–7).
  — tests: aplica las migraciones pendientes en orden y las registra; no vuelve a aplicar las ya registradas; si una falla, se detiene, no la registra y no aplica las siguientes; después de `resetDatabase`, `schema_migrations` lista todas las migraciones.
- [x] **T2. Índices de fecha** (requisitos 17–18).
  — tests: después de migrar, los 7 índices existen en `information_schema.STATISTICS` con sus columnas en el orden indicado.
- [x] **T3. Costo de venta en el servidor y en el POS** (requisitos 8–11).
  — tests: una venta con un `purchase_price` falso del cliente guarda el costo del catálogo; una venta de una variante guarda el costo del producto base; un `product_id` inexistente responde 400 y no crea la orden; un producto con costo 0 se vende y la línea queda en 0; en el frontend, las ventas de contado y a crédito se mandan sin `purchase_price`. Incluye helpers de tests para preparar una venta (caja abierta, producto con stock).
- [x] **T4. Costo de apartados** (requisitos 12–15).
  — tests: crear un apartado guarda el costo del catálogo en sus detalles; si el costo del producto cambia antes de liquidar, la venta generada usa el costo guardado; con la base sin migrar, el detalle de un apartado existente queda con el costo actual del producto después de migrar.
- [x] **T5. Documentación** (requisitos 16 y 19–21).
  — tests: no lleva tests de código; se verifica con el criterio 7.
- [x] **T6. Documentación en `shared-features/`** (requisito 22).
  — tests: no lleva tests de código.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | En la base de desarrollo, el primer arranque del backend aplica todas las migraciones, `schema_migrations` las lista, y un segundo arranque no aplica nada. | 2026-10-20: las dos migraciones se crearon en momentos distintos, y cada una se aplicó en el primer arranque después de crearse (`001` a las 16:59:31, `002` a las 17:19:28). Los otros 14 arranques, y un reinicio hecho al cerrar, dicen "Migraciones al día". `schema_migrations` lista las dos. |
| 2 | Una base creada desde cero (`sql-init/` más las migraciones) tiene las mismas columnas e índices, en las tablas que toca esta spec, que la base de desarrollo migrada. | 2026-10-20: la base de pruebas recreada desde cero y la de desarrollo migrada tienen idénticas las 78 líneas de columnas, índices y migraciones de `orders`, `inventory_movements`, `returns`, `layaway_details` y `schema_migrations`. |
| 3 | Una venta que manda un costo falso por la API queda guardada con el costo del catálogo. | Test `stores the catalog cost and ignores the cost sent by the client` (`create-order-cost.test.js`): el cliente manda 999 y se guarda 12.5. En la prueba del usuario, las ventas #129, #130 y #131 guardaron 18, el costo de Mandarina en ese momento. |
| 4 | Un apartado creado con un costo, cuyo producto cambia de costo antes de liquidarse, genera una venta con el costo original. | Prueba del usuario (2026-10-20): el apartado #12 guardó costo 18; el costo de Mandarina pasó a 25 y la venta #132 quedó con 18. Otra prueba con Pitahaya quedó igual: 45 guardado, costo cambiado a 65, venta #128 con 45. Test `uses the stored cost, not the current one, when the layaway is paid off`. |
| 5 | Los 7 índices existen en la base de desarrollo, y `EXPLAIN` de las consultas de rango de fechas del Dashboard y de Ventas los muestra en `possible_keys`. | 2026-10-20: los 7 índices existen. En 4 consultas de rango de fechas (Dashboard y Ventas, consolidadas y por sucursal), `EXPLAIN` los muestra en `possible_keys`. Con 31 ventas, MySQL usa `idx_orders_branch_created` en una y lee la tabla completa en las otras tres, lo normal en una tabla tan chica. |
| 6 | En el POS se puede vender (contado, mixto y crédito), apartar y liquidar un apartado igual que hoy. | Prueba del usuario (2026-10-20): contado (#129), mixta con efectivo y tarjeta (#130), crédito (#131, crédito activo de $300) y apartado #12 liquidado como venta #132. Sin errores en el backend; stock de 91 a 57, sin descontar de nuevo al liquidar. |
| 7 | `docs/migraciones.md` existe, y siguiéndolo se escribe y aplica una migración de prueba (que se borra después). | 2026-10-20 (T5): se aplicó `003-add-docs-check-table.sql` con `docker compose exec backend npm run migrate`; la segunda corrida dijo "al día". La tabla, su registro y el archivo se borraron después. |
| 8 | `shared-features/fix-costos-e-indices.md` existe y está en el índice. | Commit `01e7778`. |
| 9 | Los tests del backend y del frontend pasan. | 2026-10-20: backend 51/51 (13 archivos), frontend 30/30 (7 archivos). |

## Dudas abiertas

- _Ninguna._

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-20 | Creación de la spec. | — |
| 2026-10-20 | Se resuelven las 9 dudas: migraciones en SQL; se aplican al arrancar el backend y con `npm run migrate`; `sql-init/` queda como base fija y las migraciones corren encima; el POS deja de mandar `purchase_price`; los detalles de apartados existentes se llenan con el costo actual; "sin costo" es solo la regla `purchase_price = 0`; se puede vender un producto con costo 0; se aprueban los 7 índices, sin `cash_movements`; se documenta en `shared-features/`, incluido el runner. | Usuario |
| 2026-10-20 | Pasa a **Lista**. | Usuario |
| 2026-10-20 | T1 terminada: runner en `backend/src/utils/migrations.js`, `npm run migrate` en `backend/migrate.js`, y `index.js` aplica las migraciones antes de escuchar. Además de lo pedido, el runner rechaza nombres que no sigan `NNN-descripcion.sql` antes de aplicar nada. | Usuario |
| 2026-10-20 | T2 terminada: `backend/migrations/001-add-date-indexes.sql`. Se corrige un error de T1: `02-seeds.sql` deja el autocommit apagado y `resetDatabase` aplicaba las migraciones en esa conexión, así que su registro en `schema_migrations` se perdía; el runner ahora enciende el autocommit al empezar. Solo afectaba a los tests. | Usuario |
| 2026-10-20 | T3 terminada. Los 5 tests del backend fallan contra el código anterior (guardaba el costo del cliente y respondía 500 sin costo o con un producto inexistente) y pasan con el nuevo. En el frontend, `PaymentModal` y `CreditModal` arman las líneas con `components/Pos/orderItems.js`, y el test de "se mandan sin `purchase_price`" se hace sobre esa función. Helpers nuevos en `backend/tests/helpers/sales.js`. Hallazgo para portar: el POS nuevo no puede llegar antes que el backend nuevo, porque el anterior responde 500 a una venta sin costo. | Usuario |
| 2026-10-20 | T4 terminada: `backend/migrations/002-add-layaway-details-purchase-price.sql`, que al final quita el DEFAULT para que una línea sin costo falle en vez de guardar 0. La consulta de costos de T3 pasa a `backend/src/helpers/catalogCosts.js` y la usan ventas y apartados. Con la forma anterior de liquidar, la venta quedaba con el costo del día de liquidación (55 en vez de 40). `resetDatabase({ migrate: false })` deja la base sin migrar. Hallazgo para portar: el código anterior no puede crear apartados con la columna nueva, así que la migración y el código van juntos. | Usuario |
| 2026-10-20 | T5 terminada: `docs/migraciones.md`, la regla de migraciones en `AGENTS.md` y la sección de costos en `backend/schema_decisions.md`, que también fija la regla de "sin costo" (requisito 16). Además, `docs/tests.md` dice dónde van los tests de cada migración. | Usuario |
| 2026-10-20 | T6 terminada: `shared-features/fix-costos-e-indices.md`, agregado al índice. Sus notas para portar se revisaron contra el código de smallpos-saas (mismo problema de costos, orden de despliegue y migraciones por tenant). | Usuario |
| 2026-10-20 | Evidencia de los 9 criterios de aceptación: 4 y 6 con la prueba del usuario en el POS; 1, 2, 5 y 7 contra la base de desarrollo y una base nueva; 3 con su test y las ventas de la prueba. | Usuario |
| 2026-10-20 | Pasa a **Terminada**. | Usuario |
