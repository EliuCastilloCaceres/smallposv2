# feat: Valuación de inventario

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Implementada** | feat | smallposv2 | smallpos-saas | Commit de la spec 07 (un solo commit) | 2026-10-23 |

## Resumen

Agrega al módulo de Reportes la pestaña **Valuación de inventario**, con el permiso `reports.inventory`. Responde "¿cuántos productos tengo, cuánto valen y cuánto ganaría si los vendo?" con las existencias y los precios del momento.

- **Artículo:** un producto simple o una variante. Las variantes usan el costo y el precio de su producto.
- **Pantalla,** de arriba abajo: filtros, resumen, "Revisar captura" y desglose. Cada dato aparece una sola vez.
- **Resumen del disponible:** el valor al costo como cifra principal, con artículos y unidades por unidad de medida ("17,989 pza · 600 par"), y junto a él el valor a precio de venta y la utilidad estimada con su margen.
- **Qué cuenta:** artículos activos con stock > 0, con las reglas de `getStockByBranch`: en un producto variable, sus variantes activas; en uno simple, la fila sin variante. A diferencia de Inventario, **sí cuentan las categorías ocultas** para la sucursal.
- **Apartado y total en tienda,** al pie del resumen: las líneas de apartados activos (cuyo stock ya se descontó) y disponible + apartado. Lo apartado se valora con el costo y el precio de hoy, no con los del apartado. Sin apartados dice "Sin apartados activos".
- **Desglose:** "Ver por" producto (las variantes se suman en su producto), categoría, proveedor y sucursal (solo el admin central), ordenable con un clic en los encabezados (en móvil, con un selector) y paginado.
- **Filtros,** arriba: búsqueda por nombre o SKU (también de variante), sucursal, categoría, proveedor y "Excluir del cálculo": **categorías** (por ejemplo, Recargas; solo con "Todas las categorías") y **productos sin costo**, apagado por defecto. El aviso de sin costo va junto a la utilidad, con "Excluirlos" o "Incluirlos". En móvil, los filtros se abren con un botón que dice cuántos hay activos.
- **Revisar captura:** accesos de sin costo, costo mayor al precio e inactivos con stock (la segunda se llamaba "Precio menor al costo" hasta la spec 09). Al darles clic, el desglose muestra solo esos artículos, con un aviso y "Ver todos"; el de sin costo vuelve a incluirlos si estaban excluidos. Los inactivos no entran en el resumen.
- **Editar productos:** al ver por producto (también en las vistas de "Revisar captura"), cada fila tiene un botón Editar que abre el mismo formulario de Productos. Solo lo ve quien tiene `products.update`. Al guardar, la valuación se vuelve a pedir con los mismos filtros, orden y página.

Spec completa: [`specs/07-valuacion-de-inventario.md`](../specs/07-valuacion-de-inventario.md).

## Motivo

- No había forma de saber cuánto dinero hay en mercancía ni su utilidad estimada (petición #5 de `docs/reportes-borrador.md`).
- En la base de producción, 940 de los 2,177 artículos con stock no tienen costo. Con ellos, la utilidad estimada da 45.1%; sin ellos, 8.3%. Además, Recargas es el 54% del valor al costo. Por eso el filtro de sin costo y la exclusión de categorías.

## Historias de usuario

- Como **supervisor**, quiero saber cuántos productos y unidades tengo y cuánto valen al costo y a precio de venta, para conocer el dinero que tengo en mercancía.
- Como **supervisor**, quiero ver la utilidad estimada del inventario por categoría, proveedor y producto, para saber dónde está el dinero y qué deja más.
- Como **administrador central**, quiero ver el inventario consolidado y el de cada sucursal, para comparar cuánto tiene cada una.
- Como **almacenista**, quiero encontrar los productos con stock sin costo, con el costo mayor al precio o inactivos, para corregirlos.
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

Implementada en smallpos-saas con la Spec 20 (`specs/20-inventory-valuation-report.md`) el 2026-11-19, con el diseño final de smallposv2: las piezas comunes del rediseño, el nombre "Costo mayor al precio" y `ProductEdit.jsx`. Las cifras son de `marksexpress` al 17 de noviembre de 2026, antes de la edición de prueba; el apartado se probó en `rbac09demo`.

- [x] **Permiso:**
  - `reports.inventory` está en el catálogo y en las plantillas de Supervisor y Almacenista;
  - la migración `005-add-reports-inventory-permission.sql` se aplicó a los dos tenants locales, después de un backup, y la segunda corrida dijo "Al día";
  - en `marksexpress` lo tienen Administrador, Supervisor y Almacenista; Cajero, "Supervisor_Ventas" y "Cajero N3" no;
  - sin el permiso, `GET /api/reports/inventory` responde 403.
- [x] **Mismas cifras que SQL y que Inventario:**
  - sin filtros, 2,192 artículos, 17,422 pza · 628 par · 4 paq · 1 kg, $243,856.57 al costo y $643,444.46 a venta (62.1% de margen), igual que un cálculo SQL;
  - las 17,964 unidades de Sucursal Central coinciden con su stock en Inventario.
- [x] **Variantes:** buscando "10109", el resumen cuenta 8 artículos y la tabla tiene una sola fila con sus 10 unidades.
- [x] **Sin costo:** al excluirlos, el resumen pasa a 1,246 artículos y 10.28% de margen (antes 62.1%), y la alerta sigue en 946 ($371,651.00 a precio de venta).
- [x] **Alertas:** 946 sin costo, 8 con el costo mayor al precio ($33,631.50 al costo) y 149 inactivos con stock ($9,244.54). La vista de cada una trae solo sus artículos y el resumen no cambia.
- [x] **Filtros:** Abarrotes da 644 artículos y $40,090.12; excluyendo Recargas quedan 2,178 artículos y $154,501.57 al costo, y la alerta "Sin costo" baja a 938.
- [x] **Por sucursal:** Sucursal Central (2,190 artículos) y Sucursal Norte (8, $1,823.04). El consolidado cuenta una vez los 6 artículos que están en las dos. Con una sola sucursal en el alcance, la API responde 400, y una sucursal ajena, 403.
- [x] **Apartado:** `marksexpress` no tiene apartados activos, así que se probó en `rbac09demo` con un apartado de 3 pza a $9.00 (costo de hoy $5.00, precio de hoy $10.00):
  - activo, el apartado dice 3 pza, $15.00 al costo y $30.00 a venta, con el precio de hoy y no los $27.00 del apartado;
  - el total en tienda es disponible + apartado: 5 + 3 = 8 pza;
  - al cancelarlo, el apartado vuelve a 0 y el disponible a 8 pza.
- [x] **Editar productos:** el usuario corrigió desde el desglose el costo de dos productos de "Costo mayor al precio", el mentos de $50.00 a $0.50 y la bolsa de regalo de $76.00 a $1.00. El valor al costo bajó de $243,856.57 a $212,406.07 y la alerta, de 8 a 6. `InventoryTab.test.jsx` cubre el botón, el formulario y la valuación que se vuelve a pedir al guardar.
- [x] **Pantalla y acceso por rol:** el usuario lo revisó en la app el 2026-11-19. Un Supervisor y un Almacenista ven la pestaña y un Cajero no, y se ve bien en escritorio y en el celular.
- [x] **Tests:** `inventoryReport.test.js` (56) y `InventoryTab.test.jsx` (42), más los casos de permisos, menú y migración. Los tests del backend y del frontend pasan, en Docker: backend 1077/1077 (55 suites) y frontend 544/544 (53 archivos).

**Diferencias con smallposv2:**
- **Permisos:**
  - el código va en `rbac/catalog.js`, con la descripción "Ver el reporte de valuación de inventario";
  - una migración por tenant (`005`) lo asigna por nombre de rol a Administrador, Administrador de sucursal, Supervisor y Almacenista, en lugar de un paso en `migrate-rbac.js`;
  - no se porta la etiqueta "Inventario" de `PermissionsModal.jsx`.
- **Acceso:** la pestaña va en `REPORT_TABS`, y el menú la toma de ahí; no hubo que tocar `modules.js`.
- **Sucursal:**
  - va en `X-Branch-Id` con `useScope` y `ScopeSelector`, y el backend filtra con `branchIds`: `i.branch_id` en el stock y `l.branch_id` en los apartados;
  - "Ver por sucursal" aparece cuando el alcance cubre más de una sucursal, no por ser administrador central. El backend responde 400 con un alcance de una sola sucursal, y si el alcance deja de cubrirlas, la agrupación vuelve a Producto sin pedir la del alcance nuevo.
- **Apartado:** saas ya guarda el costo del apartado (`layaway_details.purchase_price`), pero lo apartado se valora con el costo y el precio actuales, como aquí.
- **Validaciones:** los ids se validan como en Ventas y utilidad de saas, así que un `category_id` vacío o con ceros a la izquierda responde 400.
- **Diseño:** se portó con las piezas comunes que saas ya tenía de Ventas y utilidad, y `ProductEdit.jsx` llegó con esta ficha, no con Rotación. La regla de la cifra principal va dentro de `.rpt-summary__main`, para no cambiar el resumen de Ventas y utilidad. El margen usa `fmtMargin` de saas.
- **Recarga y error:** como Ventas y utilidad de saas. El esqueleto solo sale en la primera carga y después el desglose anterior se queda atenuado; si la API falla, se vacían el resumen, las alertas y la tabla.
- **Tests:** los del backend simulan la base en lugar de ser de integración, y los cálculos se comprobaron contra `marksexpress`. Los del frontend se adaptaron al `can()` de saas y a `useScope`.

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
