# feat: Valuación de inventario

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Borrador** | feat | smallposv2 | smallpos-saas | Commit de la spec 07 (un solo commit) | 2026-10-23 |

## Resumen

Agrega al módulo de Reportes la pestaña **Valuación de inventario**, con el permiso `reports.inventory`. Responde "¿cuántos productos tengo, cuánto valen y cuánto ganaría si los vendo?" con las existencias y los precios del momento.

- **Artículo:** un producto simple o una variante. Las variantes usan el costo y el precio de su producto.
- **Pantalla,** de arriba abajo: filtros, resumen, "Revisar captura" y desglose. Cada dato aparece una sola vez.
- **Resumen del disponible:** el valor al costo como cifra principal, con artículos y unidades por unidad de medida ("17,989 pza · 600 par"), y junto a él el valor a precio de venta y la utilidad estimada con su margen.
- **Qué cuenta:** artículos activos con stock > 0, con las reglas de `getStockByBranch`: en un producto variable, sus variantes activas; en uno simple, la fila sin variante. A diferencia de Inventario, **sí cuentan las categorías ocultas** para la sucursal.
- **Apartado y total en tienda,** al pie del resumen: las líneas de apartados activos (cuyo stock ya se descontó) y disponible + apartado. Lo apartado se valora con el costo y el precio de hoy, no con los del apartado. Sin apartados dice "Sin apartados activos".
- **Desglose:** "Ver por" producto (las variantes se suman en su producto), categoría, proveedor y sucursal (solo el admin central), ordenable con un clic en los encabezados (en móvil, con un selector) y paginado.
- **Filtros,** arriba: búsqueda por nombre o SKU (también de variante), sucursal, categoría, proveedor y "Excluir del cálculo": **categorías** (por ejemplo, Recargas; solo con "Todas las categorías") y **productos sin costo**, apagado por defecto. El aviso de sin costo va junto a la utilidad, con "Excluirlos" o "Incluirlos". En móvil, los filtros se abren con un botón que dice cuántos hay activos.
- **Revisar captura:** accesos de sin costo, precio menor al costo e inactivos con stock. Al darles clic, el desglose muestra solo esos artículos, con un aviso y "Ver todos"; el de sin costo vuelve a incluirlos si estaban excluidos. Los inactivos no entran en el resumen.
- **Editar productos:** al ver por producto (también en las vistas de "Revisar captura"), cada fila tiene un botón Editar que abre el mismo formulario de Productos. Solo lo ve quien tiene `products.update`. Al guardar, la valuación se vuelve a pedir con los mismos filtros, orden y página.

Spec completa: [`specs/07-valuacion-de-inventario.md`](../specs/07-valuacion-de-inventario.md).

## Motivo

- No había forma de saber cuánto dinero hay en mercancía ni su utilidad estimada (petición #5 de `docs/reportes-borrador.md`).
- En la base de producción, 940 de los 2,177 artículos con stock no tienen costo. Con ellos, la utilidad estimada da 45.1%; sin ellos, 8.3%. Además, Recargas es el 54% del valor al costo. Por eso el filtro de sin costo y la exclusión de categorías.

## Historias de usuario

- Como **supervisor**, quiero saber cuántos productos y unidades tengo y cuánto valen al costo y a precio de venta, para conocer el dinero que tengo en mercancía.
- Como **supervisor**, quiero ver la utilidad estimada del inventario por categoría, proveedor y producto, para saber dónde está el dinero y qué deja más.
- Como **administrador central**, quiero ver el inventario consolidado y el de cada sucursal, para comparar cuánto tiene cada una.
- Como **almacenista**, quiero encontrar los productos con stock sin costo, con precio menor al costo o inactivos, para corregirlos.
- Como **supervisor**, quiero ver la utilidad estimada sin los productos sin costo y sin categorías que no son mercancía, para no confiar en una cifra inflada.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/services/reportService.js` | `getInventoryReport`: disponible, apartado y total, alertas y tabla agrupable sobre `inventory_stock` y `layaway_details`. |
| `backend/src/controllers/reportController.js` | `getInventoryReport`, con `resolveOptionalBranchId` y `isCentral` (solo el admin central agrupa por sucursal). |
| `backend/src/routes/report_routes.js` | `GET /reports/inventory` con `reports.inventory`. |
| `frontend/src/components/Reports/reportTabs.js` | Pestaña Valuación de inventario después de Tendencia de ventas. |
| `frontend/src/components/Reports/Reports.jsx` | Contenido de la pestaña nueva. |
| `frontend/src/components/Reports/reports.css` | Estilos `rpt-inv-*` de los filtros, el resumen, "Revisar captura" y el desglose; encabezados ordenables (`rpt-sort`), botón Editar de cada fila (`rpt-row-edit`), costo 0 en naranja y margen negativo en rojo. |
| `frontend/src/components/Settings/modals/PermissionsModal.jsx` | La acción `inventory` se muestra como "Inventario". |
| `frontend/src/components/Reports/Reports.test.jsx` | La pestaña aparece con `reports.inventory`, también para un almacenista que solo tiene ese permiso de reportes. |
| `frontend/src/components/App.test.jsx` | Reportes aparece en el menú con solo `reports.inventory`. |

## Archivos agregados

| Archivo | Qué es |
|---|---|
| `backend/migrations/005-add-reports-inventory-permission.sql` | Crea `reports.inventory` y lo asigna a superadmin, admin, supervisor y almacenista. |
| `backend/tests/integration/migrations/005-add-reports-inventory-permission.test.js` | Los roles que reciben el permiso. |
| `backend/tests/integration/reports/inventory.test.js` | KPIs, consolidado, apartado y total, sin costo, filtros, las cuatro agrupaciones, orden, paginación, alertas, alcance por sucursal y respuestas 400/403. |
| `frontend/src/components/Reports/tabs/InventoryTab.jsx` | La pestaña. |
| `frontend/src/components/Reports/tabs/InventoryTab.test.jsx` | Resumen, aviso y filtro de sin costo, columnas por agrupación, orden desde los encabezados, filtros, exclusión de categorías, "Revisar captura" y la edición de productos (con el formulario simulado), con la API simulada. |

## Tareas realizadas

- [x] Permiso `reports.inventory` por migración, con su etiqueta en Permisos.
- [x] Endpoint `GET /api/reports/inventory`. La vista de una alerta muestra lo mismo que cuenta su tarjeta, así que no la cambia "Excluir productos sin costo".
- [x] Pestaña Valuación de inventario. La tabla se dibuja con la agrupación de las filas que ya llegaron: al cambiarla, las filas anteriores fallaban con las columnas nuevas. La primera versión resultó confusa (la tabla quedaba hasta abajo y los valores del disponible se repetían tres veces) y se reestructuró en filtros, resumen, "Revisar captura" y desglose.
- [x] Editar productos desde el desglose con `Products/modals/ProductModal.jsx`. Sus estilos viven en `products.css`, con las variables dentro de `.prd-root`, así que la pestaña importa ese CSS y envuelve el formulario en un `div.prd-root`.

## Criterios de aceptación

_Pendiente. Se llenan después de implementar._

## Notas para portar a smallpos-saas

Revisado contra el código de smallpos-saas el 2026-10-23 (`db79cc7`).

- **Depende en parte de la spec 04:** usa `Reports/reportTabs.js` y el guard de `/reports` que esa spec agrega. Hay que portar primero [`feat-reporte-ventas-y-utilidad.md`](feat-reporte-ventas-y-utilidad.md). No usa `soldLines.js` ni nada de la spec 05.
- **No depende de la spec 03:** lo apartado se valora con el costo actual del producto, así que no necesita `layaway_details.purchase_price`, que saas todavía no tiene.
- **Mismo esquema:** saas tiene las mismas `inventory_stock` (con `variant_key` y stock no negativo), `branch_hidden_categories`, `product_variants` y `layaways` (estados `active`, `completed` y `cancelled`), así que las consultas se aplican casi igual.
- **Permiso:**
  - **Catálogo:** se agrega `{ code: 'reports.inventory', module: 'reports', description: 'Reporte de valuación de inventario' }` a `PERMISSIONS` en `backend/src/rbac/catalog.js` y se regenera `frontend/src/auth/permissionCodes.js` con `node backend/scripts/export-permission-codes.js`.
  - **Roles:** se agrega a las plantillas de **Supervisor y Almacenista**. Administrador lo recibe solo y el Propietario tiene todo.
  - **Tenants existentes:** `syncPermissionCatalog` crea el permiso, pero no se lo da a los Supervisor ni a los Almacenista que ya existen. Hace falta un paso de datos por tenant en `scripts/migrate-rbac.js` / `rbac/tenantMigration.js`, como para `reports.profit`.
  - **Menú:** se agrega `'reports.inventory'` al `anyOf` de Reportes en `frontend/src/auth/modules.js`. El Almacenista de saas tampoco tiene hoy ningún permiso de reportes, así que empezará a ver el menú Reportes.
  - **Ruta:** `router.get('/inventory', { perm: 'reports.inventory', branch: 'scope' }, reportController.getInventoryReport)`.
  - **Etiquetas:** el modal de permisos de saas muestra la descripción del catálogo, así que el cambio de `PermissionsModal.jsx` no se porta.
- **Editar productos:** saas tiene el mismo `ProductModal` (`product`, `categories`, `providers`, `onSaved`, `onClose`) y el mismo `products.css` con sus variables en `.prd-root`, así que se reutiliza igual. El botón usa `can('products.update')` en lugar de `hasPermission('products', 'update')`.
- **Varias sucursales por usuario (Spec 12 de saas):**
  - `getInventoryReport` recibe `branchIds` (de `scopeBranchIds(req.branchScope)`, `null` para todas) y filtra con `IN (?)`: `i.branch_id` en el stock y `l.branch_id` en los apartados.
  - La agrupación **por sucursal** tiene sentido cuando el alcance cubre más de una sucursal (`scope.isAll` o varias `branchIds`), no solo para el "administrador central". La validación del backend (`isCentral`) debe seguir esa regla.
  - **Sucursal en el frontend:** va en `X-Branch-Id` con `useScope`, como `CashSessionsTab` de saas, no en `branch_id`.
- **Tests:**
  - los del backend de saas simulan `db`, así que el de integración se reescribe con esas simulaciones;
  - los del frontend se adaptan cambiando los permisos por los códigos de saas y el alcance por `useScope`.
