# fix: Costos de venta, costo de apartados, índices de fecha y migraciones

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Borrador** | fix | smallposv2 | smallpos-saas | `deb907d`–`5e756ea` | 2026-10-20 |

## Resumen

Deja confiables los datos de costo y prepara la base para los reportes nuevos (utilidad, tendencia, inventario, rotación). Tiene cuatro partes:

- **Costo de venta en el servidor:** `orderService.createOrder` toma el costo de cada línea de `products.purchase_price` e ignora el que mande el cliente. Las variantes usan el costo del producto base. Si un producto no existe, la venta se rechaza con 400 (antes, 500). El POS deja de llevar y mandar `purchase_price`.
- **Costo de apartados:** `layaway_details` guarda el costo al crear el apartado, y la venta que genera al liquidarse usa ese costo, no el del catálogo de ese día.
- **Índices de fecha:** 7 índices en `orders`, `inventory_movements` y `returns`.
- **Runner de migraciones:** archivos SQL en `backend/migrations/`, registrados en `schema_migrations`, que se aplican al arrancar el backend y con `npm run migrate`. `sql-init/` queda como base fija de una instalación nueva.

Una línea de venta con `purchase_price = 0` cuenta como **"sin costo"**; la marca y el filtro se mostrarán en el reporte de utilidad.

Spec completa: [`specs/03-fix-costos-e-indices.md`](../specs/03-fix-costos-e-indices.md). Guía de migraciones: [`docs/migraciones.md`](../docs/migraciones.md).

## Motivo

- **El costo lo decidía el cliente.** La venta guardaba el `purchase_price` que mandaba el POS, que lo tomaba del catálogo con un respaldo `?? 0`. Cualquier cliente de la API podía mandar el costo que quisiera, y una venta con costo 0 infla la utilidad.
- **Los apartados no guardaban su costo.** Al liquidarse se tomaba el costo del día de la liquidación, así que su utilidad cambiaba si el costo subía o bajaba en medio.
- **Faltaban índices de fecha** en tablas que el Dashboard, Ventas, Devoluciones y el historial de inventario filtran por rango de `created_at`, y que los reportes nuevos van a filtrar por rangos largos.
- **No había forma de cambiar el esquema de una base existente:** `sql-init/` solo corre cuando la base se crea desde cero.

## Historias de usuario

- Como **supervisor**, quiero que la utilidad de cada venta use el costo real del catálogo, para confiar en los reportes de utilidad.
- Como **supervisor**, quiero que un apartado conserve el costo del día en que se apartó, para que su utilidad no cambie si el costo sube o baja antes de liquidarlo.
- Como **administrador**, quiero que los reportes con rangos largos respondan rápido, para consultar meses de historial sin esperar.
- Como **desarrollador**, quiero aplicar los cambios de esquema con migraciones versionadas, para actualizar cualquier base existente sin hacerlo a mano.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/index.js` | Al arrancar: verifica la base, aplica las migraciones pendientes y solo después escucha. Si una migración falla, sale con código 1. |
| `backend/package.json` | Script `migrate` (`node migrate.js`). |
| `backend/src/services/orderService.js` | `createOrder` usa `getCatalogCosts` antes de insertar la cabecera y guarda ese costo en `order_details.purchase_price`. |
| `backend/src/services/layawayService.js` | `createLayaway` guarda el costo del catálogo en `layaway_details.purchase_price` (después de revisar el stock). `convertLayawayToOrder` usa ese costo y ya no hace `JOIN` con `products`. |
| `backend/tests/helpers/database.js` | `resetDatabase` aplica las migraciones después de los seeds; con `{ migrate: false }` deja la base sin migrar. |
| `frontend/src/components/Pos/Pos.jsx` | El carrito ya no lleva `purchase_price`. |
| `frontend/src/components/Pos/modals/PaymentModal.jsx` | Arma las líneas con `toOrderItems`, sin `purchase_price`. |
| `frontend/src/components/Pos/modals/CreditModal.jsx` | Igual que `PaymentModal`. |
| `frontend/src/context/PosContext.jsx`, `frontend/src/components/Pos/modals/OutOfStockModal.jsx` | Comentarios: el carrito ya no lleva costo. |
| `AGENTS.md` | Regla: todo cambio de esquema o de datos va en una migración con su test. |
| `backend/schema_decisions.md` | Costo tomado por el servidor, costo congelado en apartados, regla de "sin costo" y sección de migraciones. |
| `docs/tests.md` | `resetDatabase` con migraciones, helpers de ventas y dónde van los tests de migraciones. |

## Archivos agregados

| Archivo | Qué es |
|---|---|
| `backend/src/utils/migrations.js` | El runner: `listMigrations`, `runMigrations(conn)` y `migrateDatabase()` (conexión propia con `multipleStatements`, desde las variables `DB_*`). Rechaza nombres que no sigan `NNN-descripcion.sql` y enciende el autocommit al empezar. |
| `backend/migrate.js` | Entrada de `npm run migrate`. |
| `backend/migrations/001-add-date-indexes.sql` | Los 7 índices de fecha. |
| `backend/migrations/002-add-layaway-details-purchase-price.sql` | Columna `purchase_price` en `layaway_details`, llenada con el costo actual del producto, sin DEFAULT al final. |
| `backend/src/helpers/catalogCosts.js` | `getCatalogCosts(conn, items)`: costo de catálogo por producto; lanza 400 si alguno no existe. Lo usan ventas y apartados. |
| `frontend/src/components/Pos/orderItems.js` | `toOrderItems(cartItems)`: líneas de la venta sin `purchase_price`. |
| `backend/tests/helpers/sales.js` | Helpers de tests: `openTestRegister`, `createTestProduct`, `paymentMethodId`. |
| `backend/tests/integration/utils/migrations.test.js` | Runner: orden, registro, no repetir, fallo, nombres inválidos, autocommit apagado. |
| `backend/tests/integration/migrations/001-add-date-indexes.test.js` | Los 7 índices y los que ya existían. |
| `backend/tests/integration/migrations/002-add-layaway-details-purchase-price.test.js` | Llenado de apartados existentes y rechazo de una línea sin costo. |
| `backend/tests/integration/orders/create-order-cost.test.js` | Costo del catálogo, variantes, sin costo del cliente, producto inexistente y costo 0. |
| `backend/tests/integration/layaways/layaway-cost.test.js` | Costo guardado al apartar y usado al liquidar. |
| `frontend/src/components/Pos/orderItems.test.js` | Las líneas se mandan sin `purchase_price`. |
| `docs/migraciones.md` | Cómo escribir, aplicar y recuperar una migración. |

## Tareas realizadas

- [x] Runner de migraciones, aplicado al arrancar y con `npm run migrate` (`deb907d`).
- [x] Índices de fecha; el runner fuerza el autocommit porque `02-seeds.sql` lo deja apagado (`c4409bc`).
- [x] Costo de venta desde el catálogo en el servidor; el POS deja de mandarlo (`2446f3f`).
- [x] Costo congelado en apartados y usado al liquidar (`f64b502`).
- [x] Documentación: `docs/migraciones.md`, `AGENTS.md` y `schema_decisions.md` (`5e756ea`).
- [x] Los tests de costo fallaban contra el código anterior y pasan con el nuevo: la venta guardaba el costo del cliente (999, 0, 1, 5), respondía 500 sin costo o con un producto inexistente, y el apartado tomaba el costo del día de liquidación (55 en vez de 40).

## Criterios de aceptación

_Pendiente. Se llenan después de implementar._

## Notas para portar a smallpos-saas

Revisado contra el código de smallpos-saas el 2026-10-20.

- **El mismo problema existe allá.** `orderService.createOrder` guarda `item.purchase_price` tal cual, y `layawayService.convertLayawayToOrder` toma el costo actual de `products`. El POS manda el costo igual que aquí: `Pos.jsx` (respaldo `?? 0`), `PaymentModal.jsx` y `CreditModal.jsx`. En `sql-init/01-schema.sql`, `layaway_details` no tiene `purchase_price` y `orders`, `inventory_movements` y `returns` no tienen índices de fecha.
- **Orden de despliegue, en este orden:**
  - **El backend antes que el frontend.** El backend anterior responde 500 a una venta sin `purchase_price`, así que el POS nuevo con el backend viejo rompe todas las ventas.
  - **La migración 002 junto con el código de apartados.** El código anterior no puede crear apartados con la columna nueva, porque esta no tiene DEFAULT.
- **Migraciones en un sistema multitenant.** Es la parte que más cambia:
  - Cada tenant tiene su propia base, así que **cada migración tiene que correr en la base de cada tenant**. `migrateDatabase()` usa las variables `DB_*` de una sola base; allá hay que recorrer `platform_db.tenants`, como ya hace `scripts/migrate-rbac.js`.
  - **Permisos:** el DDL necesita `ALTER` y `CREATE`. En saas, los scripts de cambios usan `DB_ADMIN_USER` (ver `migrate-rbac.js` y `tenantProvisioningService.js`).
  - **Tenants nuevos:** `tenantProvisioningService` crea la base con `sql-init/01-schema.sql` y `02-seeds.sql`. Después de eso debe aplicar las migraciones, igual que aquí `resetDatabase`.
  - **Autocommit:** si se aplican en la misma conexión que cargó `02-seeds.sql`, aplica lo mismo que aquí. Ese archivo deja el autocommit apagado, y por eso el runner lo enciende al empezar.
  - **Registro:** saas ya tiene una tabla `tenant_migrations` (`id`, `applied_at`) en cada tenant, que crea `migrate-rbac.js` para sus pasos de datos. Hay que decidir si el runner usa esa tabla o una `schema_migrations` aparte.
  - **Al arrancar o por script:** aplicar las migraciones de todos los tenants al arrancar el backend puede tardar con muchos tenants. Un script tipo `migrate-rbac.js`, con `--dry-run` y que siga con los demás si uno falla, puede encajar mejor allá.
- **Conexión:** `getCatalogCosts` recibe la conexión de la transacción, que en saas ya es la del tenant, así que la consulta no cambia.
- **Tests:** los del backend de saas simulan `db` en lugar de usar una base de pruebas. Los tests de integración de aquí no se portan tal cual: se reescriben con esas simulaciones, por ejemplo revisando que el `INSERT` de `order_details` lleve el costo de `products`.
