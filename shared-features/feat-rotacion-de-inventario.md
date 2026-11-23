# feat: Rotación de inventario

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Implementada** | feat | smallposv2 | smallpos-saas | Commit de la spec 10 (un solo commit) | 2026-10-27 |

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

Implementada en smallpos-saas con la Spec 21 (`specs/21-inventory-rotation-report.md`) el 2026-11-23. Las cifras son de `marksexpress` el 23 de noviembre de 2026, antes de las pruebas del usuario. Las ventas reales de esa copia terminan el 2026-10-15, así que con 30 días casi todo el stock sale sin movimiento.

- [x] **Permiso:**
  - `reports.rotation` está en el catálogo y en las plantillas de Supervisor y Almacenista;
  - la migración `006-add-reports-rotation-permission.sql` se aplicó a los dos tenants locales, después de un backup, y la segunda corrida dijo "Al día";
  - en `marksexpress` lo tienen Administrador, Supervisor y Almacenista; Cajero, "Supervisor_Ventas" y "Cajero N3" no;
  - sin el permiso, `GET /api/reports/rotation` responde 403.
- [x] **Índice de la última venta:** la migración `007-add-last-sale-indexes.sql` agrega `order_details (product_id, order_id)`, y el `EXPLAIN` de la última venta lo usa. Con las tablas de `marksexpress`, la búsqueda por producto baja de 338 a 202 ms.
- [x] **Mismas cifras que SQL:** con 30, 60, 90 y 180 días, los productos sin movimiento, los nunca vendidos, el valor al costo, el valor a venta y la parte del inventario coinciden con un cálculo SQL. Con 30 días: 1,975 productos (318 nunca vendidos), 17,279 pza · 618 par · 4 paq · 1 kg, $210,077.53 al costo, $636,456.46 a venta y 98.9% del inventario. Con 90 días: 1,105 productos, $91,335.76 y 43%.
- [x] **Última venta y nunca vendidos:**
  - "12875", producto variable con ventas sin variante, tiene su última venta el 2026-08-25;
  - "Acetona" cuenta desde su primer movimiento (2026-08-26) y "Recarga500" desde su alta (2024-07-15). Los dos dicen "Nunca vendido".
- [x] **Rebaja:** "mentos menta 2.64g" a $0.90 (−10%), "LENTES100" a $70.00 (−30%) y "Nescafe clasico" hasta el costo ($43.30, −13.4%). "12875" pide capturar el costo y "Lapicero Austro" dice que el precio no supera el costo.
- [x] **Promoción:** con 90 días, los productos de Abarrotes de Sucursal Central sugieren fritos chip. (54 órdenes), cheetos xt. fla. (52) y doritos nach. (49), igual que un cálculo SQL.
- [x] **Traspaso:** con 30 días, "coca 1.75 desc" de Sucursal Central sugiere traspasar a Sucursal Norte (3 ventas). "Alma1", que solo tiene Sucursal Central, también lo recibe.
- [x] **Filtros:** coinciden con SQL:
  - Abarrotes da 642 productos con 30 días;
  - excluyendo Recargas quedan 1,961 productos, $120,722.53 al costo y 98.11% del inventario sin Recargas;
  - con "Productos sin costo" excluidos quedan 1,208 productos, y el aviso sigue en 767.
- [x] **Sucursales:** la columna Sucursal aparece con "Todas mis sucursales" de más de una sucursal, y una sucursal ajena en `X-Branch-Id` responde 403.
- [x] **Rendimiento:** con 30 días, la API responde en 277–329 ms, y la consulta con la última venta tarda 254–286 ms.
- [x] **Editar productos:** el usuario editó desde la lista dos productos de `marksexpress` el 2026-11-23:
  - el precio de "rifle,luz,sonido" pasó de $160.00 a $120.00, y la rotación sugiere rebajarlo hasta el costo ($100.00);
  - el de "14018" pasó de $250.00 a $125.00, igual a su costo, y dice que el precio no supera el costo.

  `RotationTab.test.jsx` cubre el botón, el formulario y la rotación que se vuelve a pedir al guardar.
- [x] **Pantalla y acceso por rol:** el usuario lo revisó en la app el 2026-11-23. Un Supervisor y un Almacenista ven la pestaña y un Cajero no, y se ve bien en escritorio y en el celular.
- [x] **Tests:** `rotationReport.test.js` (81) y `RotationTab.test.jsx` (44), más los casos de permisos, menú y migraciones. Pasan los del backend (1165/1165, 56 suites) y los del frontend (592/592, 54 archivos), en Docker.

**Diferencias con smallposv2:**
- **Permisos:**
  - el código va en `rbac/catalog.js`, con la descripción "Ver el reporte de rotación de inventario";
  - una migración por tenant (`006`) lo asigna por nombre de rol a Administrador, Administrador de sucursal, Supervisor y Almacenista;
  - no se porta la etiqueta "Rotación" de `PermissionsModal.jsx`.
- **Acceso:** la pestaña va en `REPORT_TABS`, y el menú la toma de ahí; no hubo que tocar `modules.js`.
- **Sucursal:**
  - va en `X-Branch-Id` con `useScope` y `ScopeSelector`. El backend filtra el stock con `branchIds`, y la última venta se busca en la sucursal de cada fila, que ya está en el alcance;
  - la columna Sucursal aparece cuando el alcance cubre más de una sucursal, no por ser administrador central;
  - el traspaso, como aquí, se busca en cualquier sucursal activa, aunque esté fuera del alcance del usuario.
- **Última venta con un índice:** se busca producto por producto, solo para las filas del disponible, con el índice nuevo `order_details (product_id, order_id)` (migración `007`), en lugar de agregar todo el historial de ventas. Un índice de `orders` que también se probó no se usaba y se quitó.
- **Recarga y error:** como Valuación de saas. El esqueleto solo sale en la primera carga, y después la lista anterior se queda atenuada; si la API falla, se vacían el resumen y la lista.
- **Filtros en escritorio:** cuando la tarjeta se angosta, la fila de selectores baja de línea en lugar de salirse, y la búsqueda dentro de la fila ocupa el espacio que sobra. Es la regla compartida de la tarjeta, así que también corrige Valuación.
- **Validaciones:** los ids se validan como en Valuación de saas, y no hay `branch_id`.
- **Tests:** los del backend simulan la base con la fecha de hoy fija, y los cálculos se comprobaron contra `marksexpress`. Los del frontend se adaptaron al `can()` de saas y a `useScope`.

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
