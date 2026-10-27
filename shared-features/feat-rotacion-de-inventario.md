# feat: Rotación de inventario

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Borrador** | feat | smallposv2 | smallpos-saas | Commit de la spec 10 (un solo commit) | 2026-10-27 |

## Resumen

Agrega al módulo de Reportes la pestaña **Rotación de inventario**, con el permiso `reports.rotation`. Responde "¿qué productos llevan tiempo sin venderse, cuánto dinero tengo detenido en ellos y qué puedo hacer para moverlos?".

- **Fila:** un producto en una sucursal, con sus variantes sumadas. No es por variante, porque las ventas anteriores al arranque del sistema no guardan la variante. En el consolidado, un producto sin movimiento en dos sucursales aparece dos veces.
- **Stock:** el disponible de Valuación de inventario: producto activo, variantes activas, categorías ocultas incluidas y sin lo apartado.
- **Días sin venta:** desde la última venta del producto en la sucursal, en días de calendario de México.
  - **Venta:** una orden no cancelada (`completed`, `partial_refund` o `refunded`) o la creación de un apartado activo.
  - **Nunca vendido:** se cuenta desde su primer movimiento de inventario en la sucursal. Si no tiene movimientos, o el primero ya encontró existencias (`quantity_before > 0`), se cuenta desde la fecha de alta del producto.
- **Periodo:** 30, 60, 90 o 180 días sin venta, con 30 por defecto. Entra un producto con días sin venta iguales o mayores al periodo.
- **Resumen:** el valor detenido al costo como cifra principal, con productos, nunca vendidos y unidades por unidad de medida. Junto a él, el valor a precio de venta y la parte que representa del valor al costo de todo el inventario disponible con los mismos filtros.
- **Sugerencias por fila,** fijas e informativas:
  - **Traspaso:** a la sucursal activa donde más se vendió el producto en el periodo.
  - **Rebaja:** 10% con 30–59 días, 20% con 60–89 y 30% con 90 o más, redondeada al centavo y **nunca debajo del costo**. Si topa con el costo, sugiere el costo y lo dice. Sin rebaja si el producto no tiene costo ("Captura el costo…") o si el precio no supera el costo.
  - **Promoción:** con hasta 3 productos activos de la misma categoría, con stock en la sucursal y con más órdenes en ella en el periodo.
  - **Aviso de ubicación:** solo si no aplica ninguna de las tres anteriores. Arriba de la lista va un aviso general con el mismo texto.
- **Filtros:** los de Valuación, más los días sin venta, que siempre están a la vista (también en móvil). Incluye "Excluir del cálculo" para categorías (por ejemplo, Recargas) y productos sin costo, este último apagado por defecto y con su aviso en el resumen ("Excluirlos" o "Incluirlos").
- **Lista:** ordenable por valor al costo o por días sin venta desde los encabezados (en móvil, con un selector) y paginada de 20 en 20. La columna de sucursal solo la ve el admin central en el consolidado.
- **Editar productos:** cada fila tiene un botón Editar que abre el mismo formulario de Productos, igual que en Valuación. El formulario no se llena con el precio sugerido.

Spec completa: [`specs/10-rotacion-de-inventario.md`](../specs/10-rotacion-de-inventario.md).

## Motivo

- Hacían falta sugerencias para los productos que no se mueven (petición #7 de `docs/reportes-borrador.md`).
- En la base de producción, 1,298 de 1,968 productos con stock llevan 30 días o más sin venderse y valen $193,750 al costo. Recargas es el 55% de ese valor, y 610 de los demás no tienen costo. Por eso la exclusión de categorías, el filtro de sin costo y la edición desde la lista.

## Historias de usuario

- Como **supervisor**, quiero ver qué productos llevan tiempo sin venderse y cuánto dinero tengo detenido en ellos, para decidir qué hacer con ese inventario.
- Como **supervisor**, quiero una sugerencia concreta por producto (traspasarlo, rebajarlo o promocionarlo), para moverlo sin vender abajo del costo.
- Como **almacenista**, quiero saber qué productos se venden en otra sucursal y en la mía no, para proponer traspasos.
- Como **administrador central**, quiero ver la rotación consolidada y la de cada sucursal, para comparar.
- Como **supervisor**, quiero excluir las categorías que no son mercancía y los productos sin costo, para no confiar en una cifra inflada.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/services/reportService.js` | `getRotationReport`: una consulta trae el disponible por producto y sucursal con su última venta y su llegada; el resumen, el orden y la paginación se hacen en JS, y las sugerencias se calculan solo para las filas de la página (`rotationSuggestions`). Reutiliza `inventoryItemsQuery`, `ACTIVE_ITEM_SQL` y `parseIdList` de Valuación. |
| `backend/src/controllers/reportController.js` | `getRotationReport`, con `resolveOptionalBranchId` y la fecha de hoy en México (`todayInMexico`). |
| `backend/src/routes/report_routes.js` | `GET /reports/rotation` con `reports.rotation`. |
| `frontend/src/components/Reports/reportTabs.js` | Pestaña Rotación de inventario después de Valuación de inventario. |
| `frontend/src/components/Reports/Reports.jsx` | Contenido de la pestaña nueva. |
| `frontend/src/components/Reports/reports.css` | Estilos `rpt-rot-*`: sugerencias, nombres recortados de la promoción y botones de días sin recortar. |
| `frontend/src/components/Reports/tabs/InventoryTab.jsx` | El botón Editar y el formulario pasan a `components/ProductEdit.jsx`; sin cambios de comportamiento. |
| `frontend/src/components/Settings/modals/PermissionsModal.jsx` | La acción `rotation` se muestra como "Rotación". |
| `frontend/src/components/Reports/Reports.test.jsx` | La pestaña aparece con `reports.rotation`. |
| `frontend/src/components/App.test.jsx` | Reportes aparece en el menú con solo `reports.rotation`. |

## Archivos agregados

| Archivo | Qué es |
|---|---|
| `backend/migrations/006-add-reports-rotation-permission.sql` | Crea `reports.rotation` y lo asigna a superadmin, admin, supervisor y almacenista. |
| `backend/tests/integration/migrations/006-add-reports-rotation-permission.test.js` | Los roles que reciben el permiso. |
| `backend/tests/integration/reports/rotation.test.js` | Días sin venta (variantes, cancelada, `refunded`, apartados, hora de México, nunca vendido), periodos, resumen, rebaja en los límites de cada tramo, promoción, traspaso, filtros, orden, paginación, alcance por sucursal y respuestas 400/403. |
| `frontend/src/components/Reports/components/ProductEdit.jsx` | `EditButton` y `useProductEdit`: editar un producto desde un reporte con el formulario de Productos. Lo usan Valuación y Rotación. |
| `frontend/src/components/Reports/tabs/RotationTab.jsx` | La pestaña. |
| `frontend/src/components/Reports/tabs/RotationTab.test.jsx` | Resumen, sin costo, lista, sugerencias, orden, filtros y edición de productos, con la API simulada. |

## Tareas realizadas

- [x] Permiso `reports.rotation` por migración, con su etiqueta en Permisos.
- [x] Endpoint `GET /api/reports/rotation`. La última venta sale de `orders` y `layaways`, no de `inventory_movements`, que en producción empieza el 2026-08-25. Tarda unos 700 ms con la copia de producción (144 mil líneas de venta). Casi todo el tiempo es calcular la última venta de cada producto, y bajarlo pediría un índice nuevo.
- [x] Pestaña Rotación de inventario.
- [x] Editar productos desde la lista, con la pieza compartida `ProductEdit.jsx`.

## Criterios de aceptación

_Pendiente. Se llenan después de implementar._

## Notas para portar a smallpos-saas

Revisado contra el código de smallpos-saas el 2026-10-27 (`496b725`).

- **Depende de otras features que saas todavía no tiene:**
  - [`feat-reporte-ventas-y-utilidad.md`](feat-reporte-ventas-y-utilidad.md) (spec 04): `reportTabs.js`, el guard de `/reports` y `SOLD_STATUSES_SQL` de `helpers/soldLines.js`;
  - [`feat-tendencia-de-ventas.md`](feat-tendencia-de-ventas.md) (spec 05): `backend/src/utils/periods.js` (`addDays`);
  - [`feat-valuacion-de-inventario.md`](feat-valuacion-de-inventario.md) (spec 07): `INVENTORY_SOURCES`, `ACTIVE_ITEM_SQL`, `inventoryItemsQuery` y `parseIdList`;
  - [`feat-rediseno-ventas-y-tendencia.md`](feat-rediseno-ventas-y-tendencia.md) (spec 08): las piezas de `Reports/components/` y `fmtRangeLabel` de `utils/dateRanges.js`.
- **Índice:** usa el índice `(branch_id, product_id, created_at)` de `inventory_movements` de [`fix-costos-e-indices.md`](fix-costos-e-indices.md) para el primer movimiento. Sin él funciona, pero más lento.
- **Fecha de alta:** la regla "si el primer movimiento ya encontró existencias, se cuenta desde la fecha de alta" existe porque la base de producción de smallposv2 se cargó con stock antes de registrar movimientos. En cada tenant hay que revisar desde cuándo hay movimientos; la regla sirve igual.
- **Permiso:**
  - **Catálogo:** se agrega `{ code: 'reports.rotation', module: 'reports', description: 'Reporte de rotación de inventario' }` a `PERMISSIONS` en `backend/src/rbac/catalog.js` y se regenera `frontend/src/auth/permissionCodes.js`.
  - **Roles:** se agrega a las plantillas de **Supervisor y Almacenista**. Administrador lo recibe solo y el Propietario tiene todo.
  - **Tenants existentes:** hace falta un paso de datos por tenant para los Supervisor y Almacenista que ya existen, como con `reports.inventory`.
  - **Menú:** se agrega `'reports.rotation'` al `anyOf` de Reportes en `frontend/src/auth/modules.js`.
  - **Ruta:** `router.get('/rotation', { perm: 'reports.rotation', branch: 'scope' }, reportController.getRotationReport)`.
  - **Etiquetas:** el modal de permisos de saas muestra la descripción del catálogo, así que el cambio de `PermissionsModal.jsx` no se porta.
- **Editar productos:** `ProductEdit.jsx` usa el mismo `ProductModal` que en Valuación. El botón usa `can('products.update')`.
- **Varias sucursales por usuario (Spec 12 de saas, que ya quitó `users.branch_id`):**
  - `getRotationReport` recibe `branchIds` (de `scopeBranchIds(req.branchScope)`, `null` para todas) y filtra con `IN (?)` el stock (`i.branch_id`) y las ventas de la última venta (`o.branch_id` y `l.branch_id`).
  - El traspaso y la promoción no cambian: el traspaso busca en todas las sucursales activas, y la promoción, en la sucursal de cada fila.
  - La columna de sucursal se muestra cuando el alcance cubre más de una sucursal, no solo para el "administrador central".
  - **Sucursal en el frontend:** va en `X-Branch-Id` con `useScope`, no en `branch_id`.
- **Tests:**
  - los del backend de saas simulan `db`, así que el de integración se reescribe con esas simulaciones (las fechas de la prueba dependen de "hoy" congelado);
  - los del frontend se adaptan cambiando los permisos por los códigos de saas y el alcance por `useScope`.
