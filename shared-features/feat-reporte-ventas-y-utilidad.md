# feat: Reporte de ventas y utilidad, permisos por reporte y alcance de Sesiones de caja

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Implementada** | feat | smallposv2 | smallpos-saas | Commit de la spec 04 (un solo commit) | 2026-10-20 |

## Resumen

Agrega al módulo de Reportes la pestaña **Ventas y utilidad**, que responde "¿cuánto gané con lo que vendí?", y hace los cambios base del módulo para los reportes que vienen:

- **Endpoint `GET /api/reports/profit`:**
  - **KPIs:** ventas netas, costo de lo vendido, utilidad bruta y margen.
  - **Agrupaciones:** producto, categoría, sucursal o proveedor. Por producto, las variantes se suman en su producto.
  - **Orden:** por venta neta, utilidad o margen, en las dos direcciones.
  - **Paginación** de 20 en 20 en el servidor.
  - **Filtros:** fechas, sucursal, categoría y "Excluir ventas sin costo".
- **Fórmula compartida:**
  - La venta neta de cada línea (con el descuento de orden prorrateado y lo reembolsado de verdad restado) sale de un helper nuevo, `helpers/soldLines.js`, que ahora usan también Ventas → Productos vendidos y este reporte.
  - Sumada por orden, da lo mismo que las ventas netas del Dashboard.
  - **Costo** = unidades netas × `od.purchase_price`.
- **Ventas "sin costo":**
  - Son las líneas con `purchase_price = 0` (spec 03).
  - Si hay, un aviso dice cuántas son y cuánto suman, y las filas que las incluyen llevan la marca "Sin costo".
  - El filtro "Excluir ventas sin costo" empieza apagado; encendido, las saca de todos los cálculos.
- **Permisos por reporte:**
  - Se crea `reports.profit` para superadmin, admin y supervisor, y se elimina `reports.advanced`, que nadie usaba. Las dos cosas van en una migración.
  - El menú muestra Reportes con cualquier permiso de reportes. `/reports` manda al inicio si no hay ninguno, y cada pestaña aparece solo con su permiso.
- **Alcance por sucursal de Sesiones de caja:**
  - Un usuario con sucursal veía las sesiones de todas las sucursales. Ahora sigue la regla del Dashboard: solo la suya, aunque mande otro `branch_id`.
  - El detalle de una sesión de otra sucursal responde como una que no existe.
- **Presets de fechas compartidos:** el cálculo de rangos (Hoy, Esta semana, Este mes, Personalizado) sale de `Dashboard.jsx` a `utils/dateRanges.js`, que usan el Dashboard y la pestaña nueva.

Spec completa: [`specs/04-reporte-ventas-y-utilidad.md`](../specs/04-reporte-ventas-y-utilidad.md).

## Motivo

- **Se sabía cuánto se vendía, no cuánto se ganaba.** El costo de cada venta ya se guardaba (y desde la spec 03 sale del catálogo), pero ninguna pantalla calculaba la utilidad.
- **`reports.advanced` existía y no lo usaba nadie,** y la ruta `/reports` del frontend no validaba permisos: solo se ocultaba en el menú. Los reportes nuevos necesitan un permiso cada uno, asignable por rol.
- **Sesiones de caja exponía otras sucursales.** El controller usaba `resolveUnrestrictedBranchId`, que nunca lee la sucursal del usuario, y la pestaña no manda `branch_id` para quien no es administrador central. Así, un usuario con sucursal veía en pantalla las sesiones de todas las sucursales.

## Historias de usuario

- Como **supervisor**, quiero ver la utilidad bruta y el margen de lo vendido en un periodo, para saber cuánto gana el negocio y no solo cuánto vende.
- Como **supervisor**, quiero ver qué productos, categorías y proveedores dejan más utilidad y cuáles tienen margen bajo, para decidir qué promover o a qué subirle el precio.
- Como **administrador central**, quiero comparar la utilidad entre sucursales y ver el consolidado, para saber cuál rinde más.
- Como **supervisor**, quiero ver qué ventas no tienen costo capturado, y poder excluirlas, para que no inflen la utilidad.
- Como **administrador**, quiero dar acceso a cada reporte por rol, para que cada quien vea solo los reportes que le corresponden.
- Como **encargado de una sucursal**, quiero que mis usuarios vean solo las sesiones de caja de su sucursal, para que la información de otras sucursales no quede expuesta.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/services/reportService.js` | `getProfitReport`: valida los parámetros, arma una subconsulta con una fila por línea de venta (venta neta, unidades netas y costo) y agrega sobre ella las filas de la página, el conteo y los KPIs. |
| `backend/src/controllers/reportController.js` | `getProfitReport`. Sesiones de caja (listado y detalle) pasa de `resolveUnrestrictedBranchId` a `resolveOptionalBranchId`. |
| `backend/src/routes/report_routes.js` | `GET /reports/profit` con `requirePermission('reports', 'profit')`. |
| `backend/src/services/orderService.js` | `getSoldProducts` usa los fragmentos de `helpers/soldLines.js` en lugar de su propia copia de la fórmula. |
| `frontend/src/components/Reports/Reports.jsx` | Guard: sin permisos de reportes, `<Navigate to="/" />`. Muestra solo las pestañas permitidas y abre en la primera. |
| `frontend/src/components/App.jsx` | El menú muestra Reportes si el usuario puede ver al menos una pestaña de `reportTabs.js`. |
| `frontend/src/components/Dashboard/Dashboard.jsx` | Usa `getPresetRange`, `DATE_PRESETS` y `today` de `utils/dateRanges.js`. |
| `frontend/src/components/Settings/modals/PermissionsModal.jsx` | La acción `profit` se muestra como "Utilidad"; se quita la etiqueta "Avanzado". |
| `frontend/src/components/Reports/reports.css` | Presets, aviso, marca "Sin costo" y tabla y tarjetas sin clic. |

## Archivos agregados

| Archivo | Qué es |
|---|---|
| `backend/migrations/003-add-reports-profit-permission.sql` | Crea `reports.profit`, se lo da a superadmin, admin y supervisor (buscados por nombre) y borra `reports.advanced`, con sus asignaciones en cascada. Va en una transacción porque solo cambia datos. |
| `backend/src/helpers/soldLines.js` | `SOLD_STATUSES_SQL`, `RETURN_ATTRIBUTION_SUBQUERY`, `RETURNS_JOIN_SQL`, `NET_QUANTITY_SQL` y `NET_SALE_SQL`: la venta neta por línea, compartida. |
| `frontend/src/components/Reports/reportTabs.js` | `REPORT_TABS` (pestaña y permiso) y `getVisibleReportTabs(hasPermission)`. Cada reporte nuevo agrega aquí su pestaña. |
| `frontend/src/components/Reports/tabs/ProfitTab.jsx` | La pestaña: KPIs, aviso de ventas sin costo, filtros, tabla en escritorio, tarjetas en móvil y paginación. |
| `frontend/src/utils/dateRanges.js` | `DATE_PRESETS`, `getPresetRange(preset, custom, now)`, `toISO` y `today`. |
| `backend/tests/integration/migrations/003-add-reports-profit-permission.test.js` | Base migrada y base sin migrar con un rol creado por el usuario. |
| `backend/tests/integration/reports/profit.test.js` | Cálculo a mano con descuento de orden, devolución parcial con tarifa de restock, venta cancelada, línea sin costo y variantes. También cubre: coincidencia con el Dashboard y Productos vendidos, las cuatro agrupaciones, orden y paginación, alcance por sucursal, venta de las 23:30, 403 y 400. |
| `backend/tests/integration/reports/cash-sessions-scope.test.js` | Alcance por sucursal de Sesiones de caja: listado, detalle y administrador central. |
| `frontend/src/utils/dateRanges.test.js` | Rangos de cada preset; la semana empieza en lunes. |
| `frontend/src/components/Dashboard/Dashboard.test.jsx` | El Dashboard pide el rango de los presets compartidos. |
| `frontend/src/components/App.test.jsx` | Reportes aparece en el menú con `reports.profit` o `reports.basic`, y no sin ellos. |
| `frontend/src/components/Reports/Reports.test.jsx` | Guard, pestañas por permiso y primera pestaña permitida. |
| `frontend/src/components/Reports/tabs/ProfitTab.test.jsx` | Empieza en Este mes; muestra KPIs y filas; margen "—"; aviso y marca de ventas sin costo; filtro de excluir; unidades solo por producto; selector y agrupación por sucursal solo para el administrador central. |

## Tareas realizadas

- [x] Permiso `reports.profit` y eliminación de `reports.advanced` por migración; etiqueta "Utilidad" en Permisos.
- [x] Endpoint `GET /api/reports/profit` con la fórmula compartida con Productos vendidos.
- [x] Alcance por sucursal de Sesiones de caja.
- [x] Acceso al módulo en el frontend: menú, guard y pestañas por permiso.
- [x] Pestaña Ventas y utilidad y presets de fechas compartidos con el Dashboard.

## Criterios de aceptación

Implementada en smallpos-saas con la Spec 18 (`specs/18-profit-report.md`) el 2026-11-17, ya con el diseño de [`feat-rediseno-ventas-y-tendencia.md`](feat-rediseno-ventas-y-tendencia.md).

- [x] **Permiso:** `reports.profit` está en el catálogo y en la plantilla de Supervisor. La migración `003-add-reports-profit-permission.sql` se aplicó a los dos tenants locales, después de un backup, y la segunda corrida dijo "Al día". En `marksexpress` lo tienen Administrador y Supervisor, y no lo tienen Cajero, Almacenista ni los roles personalizados "Supervisor_Ventas" y "Cajero N3".
- [x] **Acceso:** un Supervisor ve las pestañas Sesiones de caja y Ventas y utilidad, un Cajero solo Sesiones de caja y un Almacenista no ve Reportes. Lo probó el usuario (2026-11-14). Sin `reports.profit`, `GET /api/reports/profit` responde 403.
- [x] **Cifras de `marksexpress`:** del 1 al 31 de octubre de 2026, con todas las sucursales, son las mismas que da una consulta directa:
  - $52,028.00 de ventas netas − $29,054.74 de costo = $22,973.26 de utilidad y 44.2% de margen. Las ventas netas son iguales a las del Dashboard;
  - 638 líneas sin costo suman $14,597.00. Si se excluyen: $37,431.00 − $29,054.74 = $8,376.26 y 22.4%;
  - las cuatro agrupaciones suman lo mismo que el resumen, y el resumen no cambia entre páginas.
- [x] **Cálculo a mano:** coinciden al centavo con el reporte:
  - la venta 87182 de `marksexpress`, con descuento de orden (se cobró 141/143 de cada línea);
  - la venta 90362 de `marksexpress`, con devolución parcial;
  - la venta 7 de `rbac09demo`, que registró el usuario en la app. Tiene dos devoluciones parciales y una de ellas cobra $5 de tarifa de restock: da $45 de venta neta, $20 de costo, $25 de utilidad y 55.56% de margen, y el Dashboard da los mismos $45.
- [x] **Sucursales:** en octubre, Sucursal Central ($51,363.00) y Sucursal Norte ($665.00) suman el consolidado. Un usuario que pide en `X-Branch-Id` una sucursal que no es suya recibe 403.
- [x] **Productos vendidos:** con `soldLines.js` da las mismas filas, en el mismo orden, y los mismos totales que antes en `marksexpress`. Se probaron cinco casos, de octubre de 2026 y de toda la historia.
- [x] **Presets:** el Dashboard da los mismos rangos que antes. Se compararon la función anterior y la de `utils/dateRanges.js` en cada día de 2026, a tres horas distintas y en tres zonas horarias.
- [x] **Pantalla:** la pestaña se ve y se usa bien en escritorio (1366 px) y en el celular, y Sesiones de caja se ve igual que antes. Lo revisó el usuario (2026-11-14).
- [x] **Tests:** `profitReport.test.js` (42), `soldLines.test.js` (6), `Reports.test.jsx` (5), `ProfitTab.test.jsx` (40) y `dateRanges.test.js` (12), más los casos de permisos, menú y migración. Los tests del backend y del frontend pasan, en Docker: backend 956/956 (51 suites) y frontend 435/435 (47 archivos).

**Diferencias con smallposv2:**
- **Permisos:**
  - el código va en `rbac/catalog.js`, con la descripción "Ver el reporte de ventas y utilidad", y `permissionCodes.js` se regenera;
  - la migración lo asigna por nombre de rol a Administrador, Administrador de sucursal y Supervisor, sin el Propietario;
  - no se borra `reports.advanced`, porque saas ya no lo tenía (Spec 09), y no se porta la etiqueta de `PermissionsModal.jsx`.
- **Acceso:** no hay `<Navigate>` en `Reports.jsx`. La ruta la protegen `modules.js` y `RequirePermission`, y el `anyOf` de Reportes sale de `REPORT_TABS` (`visibleReportTabs({ canAny })`).
- **Sucursal:**
  - va en `X-Branch-Id` con `useScope` y `ScopeSelector`, y el backend filtra con `branchIds`;
  - "Ver por sucursal" aparece cuando el alcance cubre más de una sucursal, no por ser administrador central. Si el alcance deja de cubrirlas, la agrupación vuelve a Producto sin pedir el reporte por sucursal.
- **Sesiones de caja:** su alcance por sucursal ya estaba resuelto en saas (Spec 12), así que no se tocó.
- **Utilidad neta:** no se portó `includeNet`. Llega con la Spec 23 de saas.
- **Diseño:**
  - se portó directamente el de la ficha del rediseño, así que no hay pastilla "Sin costo": el costo sale en naranja, con su ayuda;
  - el margen usa `fmtMargin` de `utils/productMargin.js`, igual que Productos.
- **Al recargar:** las filas anteriores se quedan atenuadas, con su agrupación, hasta que llega la respuesta. El esqueleto solo sale en la primera carga.
- **Error:** si la API falla, se vacían las filas y el resumen y solo se ve el mensaje.
- **Costos estimados:** no se portó la estimación del costo de la spec 11 de smallposv2. Las ventas sin costo se quedan en 0 y solo se marcan o se excluyen.
- **"Top productos" del Dashboard:** conserva su propia copia de la fórmula, igual que en smallposv2. Quedó anotado en la deuda técnica del plan de saas.
- **Tests:**
  - los del backend simulan la base en lugar de ser de integración, y los cálculos se comprobaron contra `marksexpress` y `rbac09demo`;
  - el Dashboard de saas no tiene tests, así que sus rangos se comprobaron comparando la función de antes y la de después.

## Notas para portar a smallpos-saas

Revisado contra el código de smallpos-saas el 2026-10-20 (`db79cc7`).

- **Permisos: el RBAC de saas es otro y cambia casi todo este punto.**
  - **Catálogo:** los permisos se definen solo en `backend/src/rbac/catalog.js`, con `code`. Hay que agregar `{ code: 'reports.profit', module: 'reports', description: 'Reporte de ventas y utilidad' }` a `PERMISSIONS`, y después regenerar `frontend/src/auth/permissionCodes.js` con `node backend/scripts/export-permission-codes.js`. El `npm test` de la raíz corre `--check` y falla si no está al día.
  - **Roles:**
    - **Administrador** lo recibe solo, porque su plantilla es todo el catálogo.
    - **Propietario** tiene todos los permisos calculados en código.
    - **Supervisor:** hay que agregar el código a su plantilla en `TEMPLATE_ROLES`. Cajero y Almacenista no lo llevan.
  - **Tenants existentes:**
    - `syncPermissionCatalog` inserta la fila del permiso, pero **no se lo da a ningún rol existente**: `seedTemplateRoles` nunca sobrescribe un rol que ya existe.
    - Para que los Supervisor actuales lo tengan, hace falta un paso de datos por tenant que lo asigne al rol de plantilla (`role_id` 3, nombre `Supervisor` desde la Spec 12), como hace aquí la migración 003. Encaja en `scripts/migrate-rbac.js` / `rbac/tenantMigration.js`, que ya recorre los tenants.
  - **`reports.advanced` no existe allá.** Ya se eliminó en la Spec 09 de saas y se mapeó a `reports.cash_sessions_all` (`LEGACY_PERMISSION_MAP`). El requisito de borrarlo no aplica, y **no** hay que mapearlo a `reports.profit`, porque allá significa otra cosa.
  - **Ruta:** con `createSecureRouter`: `router.get('/profit', { perm: 'reports.profit', branch: 'scope' }, reportController.getProfitReport)`.
  - **Etiquetas:** el modal de permisos de saas muestra la descripción del catálogo (`PERMISSION_MODULES`), no una etiqueta por acción, así que el cambio de `PermissionsModal.jsx` no se porta.
- **Alcance por sucursal: saas usa varias sucursales por usuario (Spec 12).**
  - La sucursal llega en la cabecera `X-Branch-Id`, no en `branch_id`. La ruta declara `branch: 'scope'`, y el controller usa `scopeBranchIds(req.branchScope)`, que devuelve un arreglo o `null` para "todas".
  - `getProfitReport` tiene que recibir `branchIds` y filtrar con `o.branch_id IN (?)`, en lugar de `branchId` con `=`.
  - En el frontend, la pestaña usa `ScopeSelector` / `useScope` y manda `{ branchId: scope.branchId }` en `api.get`, como `CashSessionsTab` de saas.
  - La agrupación **por sucursal** y la columna de sucursal tienen sentido cuando el alcance cubre más de una sucursal (`scope.isAll`), no solo para el "administrador central".
- **Sesiones de caja ya está resuelto allá:** sus rutas declaran `branch: 'scope'` (Spec 12, RF-5) y además distinguen `reports.cash_sessions` (solo los cortes propios) de `reports.cash_sessions_all`. El cambio del requisito 9 no se porta.
- **Menú y guard:** saas declara los módulos en `frontend/src/auth/modules.js`; la entrada de Reportes tiene `anyOf: ['reports.cash_sessions', 'reports.cash_sessions_all']`. Hay que agregar `'reports.profit'` a ese `anyOf`, y la lógica de pestañas por permiso de `reportTabs.js` se adapta a los códigos de saas.
- **Fórmula compartida:** `orderService.js` de saas tiene la misma `RETURN_ATTRIBUTION_SUBQUERY` local en `getSoldProducts`, así que la extracción a `helpers/soldLines.js` se aplica igual.
- **Presets:** `Dashboard.jsx` de saas tiene su propio `getPresetRange`; la extracción a `utils/dateRanges.js` se aplica igual.
- **Tests:** los del backend de saas simulan `db` en lugar de usar una base de pruebas. Los tests de integración de aquí no se portan tal cual: se reescriben con esas simulaciones. Los del frontend sí se pueden adaptar, cambiando los permisos por los códigos de saas y el alcance por `useScope`.
