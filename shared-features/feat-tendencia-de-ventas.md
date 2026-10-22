# feat: Tendencia de ventas

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Borrador** | feat | smallposv2 | smallpos-saas | Commit de la spec 05 (un solo commit) | 2026-10-21 |

## Resumen

Agrega al módulo de Reportes la pestaña **Tendencia de ventas**: una gráfica de líneas (Recharts) de cómo evolucionan las ventas por día, semana o mes, con comparación contra el año anterior o por sucursal.

- **Métricas:**
  - **Monto vendido** y **número de ventas**, con el mismo cálculo que los KPIs del Dashboard.
  - **Utilidad bruta**, con el mismo cálculo que Ventas y utilidad.
  - **Ticket promedio**.
- **Periodos:**
  - **Días:** días de México.
  - **Semanas:** de lunes a domingo.
  - **Meses:** meses calendario.
  - **Granularidad automática** según el rango, que el usuario puede cambiar: hasta 31 días por día, hasta 183 por semana y más por mes.
  - **Límites:** por día hasta 92 días, por semana hasta 2 años y por mes hasta 5 años, que es también el rango máximo.
- **Presets** alineados al calendario: Este mes, Últimos 3 meses, Este año, Últimos 12 meses (por defecto) y Personalizado.
- **Marcas:**
  - los periodos pasados sin ventas valen 0, y el ticket de un periodo sin ventas queda sin valor;
  - los futuros no tienen valor;
  - el periodo que contiene hoy se marca "en curso";
  - los de los extremos que el rango corta se marcan "parcial".
- **Comparación, una a la vez:**
  - **Año anterior:** por día y por semana se retroceden 364 días; por mes, el mismo mes. Los KPIs del año anterior cuentan a la fecha.
  - **Por sucursal:** solo para el administrador central en el consolidado.
- **KPIs por métrica:**
  - monto, ventas y utilidad: total, promedio por periodo y mejor periodo;
  - ticket: ticket del rango y mejor periodo;
  - con "Año anterior", cada tarjeta lleva el valor anterior y el % de cambio.
- **Aviso de ventas sin costo** con la métrica Utilidad, sin filtro.
- **Permiso `reports.trend`,** por migración, para superadmin, admin y supervisor.

Spec completa: [`specs/05-tendencia-de-ventas.md`](../specs/05-tendencia-de-ventas.md). Depende de [`feat-reporte-ventas-y-utilidad.md`](feat-reporte-ventas-y-utilidad.md).

## Motivo

- El Dashboard solo agrupa por hora del día; no había forma de ver la evolución por día, semana o mes, ni de comparar contra el año anterior o entre sucursales.
- No había librería de gráficas: las del Dashboard están hechas a mano en SVG. Recharts facilita las comparaciones y las gráficas de los reportes que vienen (gastos, utilidad).

## Historias de usuario

- Como **supervisor**, quiero ver cómo evolucionan las ventas, la utilidad y el ticket promedio por día, semana o mes, para detectar temporadas, caídas y crecimientos.
- Como **supervisor**, quiero comparar el periodo actual contra el mismo periodo del año anterior, para saber si el negocio va mejor o peor que antes.
- Como **administrador central**, quiero ver la tendencia de cada sucursal en la misma gráfica, para saber cuál crece y cuál se estanca.
- Como **supervisor**, quiero ver el total, el promedio y el mejor periodo del rango, para resumir la tendencia sin leer punto por punto.
- Como **supervisor**, quiero saber si la utilidad de la gráfica incluye ventas sin costo, para no confiar en una utilidad inflada.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/services/reportService.js` | `getTrendReport`: valida el rango, la granularidad y la comparación. Agrupa monto, ventas y utilidad por periodo con dos consultas (por orden y por línea). Arma los periodos con sus marcas, la serie del año anterior o las de cada sucursal, los KPIs a la fecha y las líneas sin costo. |
| `backend/src/controllers/reportController.js` | `getTrendReport`, con la sucursal de `resolveOptionalBranchId` y la fecha de hoy de `todayInMexico`. |
| `backend/src/routes/report_routes.js` | `GET /reports/trend` con `requirePermission('reports', 'trend')`. |
| `backend/src/services/dashboardService.js` | `getKpis` usa `helpers/orderNet.js` y `SOLD_STATUSES_SQL` en lugar de su propia copia. |
| `frontend/src/components/Reports/reportTabs.js` | Pestaña `trend` con el permiso `reports.trend`. |
| `frontend/src/components/Reports/Reports.jsx` | Contenido de la pestaña `trend`. |
| `frontend/src/components/Dashboard/Dashboard.jsx` | Toma `CHART_COLORS` de `utils/chartColors.js`. |
| `frontend/src/components/Settings/modals/PermissionsModal.jsx` | La acción `trend` se muestra como "Tendencia". |
| `frontend/src/utils/dateRanges.js` | `TREND_PRESETS`, `getTrendPresetRange` (con la fecha de hoy en México), `rangeDays`, `autoGranularity`, `fitsGranularity` y los límites. |
| `frontend/src/components/Reports/reports.css` | Gráfica, tooltip, tarjetas de 2 y 3 columnas y granularidad deshabilitada. |
| `frontend/package.json`, `frontend/package-lock.json` | `recharts` 3.10.1, versión exacta. |

## Archivos agregados

| Archivo | Qué es |
|---|---|
| `backend/migrations/004-add-reports-trend-permission.sql` | Crea `reports.trend` y se lo da a superadmin, admin y supervisor, buscados por nombre, en una transacción. |
| `backend/src/helpers/orderNet.js` | `ORDER_REFUNDS_JOIN_SQL` y `ORDER_NET_SALE_SQL`: el ingreso neto por orden del Dashboard, compartido. |
| `backend/src/utils/periods.js` | Aritmética de fechas pura: validación, días del rango, granularidad automática y límites, periodos con sus marcas, y fecha y rango del año anterior (364 días o mismo mes, con el 29 de febrero como 28). |
| `frontend/src/utils/chartColors.js` | `CHART_COLORS` y `chartColor(i)`. |
| `frontend/src/components/Reports/tabs/TrendTab.jsx` | La pestaña: filtros, métrica, granularidad, comparación, KPIs, aviso, gráfica y `TrendTooltip`. |
| `frontend/src/components/Reports/tabs/trendData.js` | Funciones puras: etiquetas de los periodos, filas de la gráfica, % de cambio y formatos. |
| `backend/tests/integration/migrations/004-add-reports-trend-permission.test.js` | Roles con el permiso, incluido un rol creado por el usuario. |
| `backend/tests/unit/utils/periods.test.js` | Bordes de granularidad y límites, semanas parciales, en curso y futuros, meses bisiestos y año anterior. |
| `backend/tests/integration/reports/trend.test.js` | Endpoint con "hoy" congelado: el cálculo a mano por periodo (con descuento, devolución con restock y una venta cancelada), la venta de las 23:30 y la coincidencia con el Dashboard y Ventas y utilidad. También cubre: semanas parciales, año anterior por día y por mes (con el 29 de febrero), por sucursal, KPIs, límites, alcance y 403. |
| `frontend/src/components/Reports/tabs/trendData.test.js` | Etiquetas, filas de la gráfica, % de cambio y formatos. |
| `frontend/src/components/Reports/tabs/TrendTab.test.jsx` | Arranque, granularidad automática y deshabilitada, comparación, KPIs por métrica y contra el año anterior, aviso, "Por sucursal" solo en el consolidado y marcas del tooltip. |

También se ampliaron `frontend/src/utils/dateRanges.test.js` (presets de tendencia y granularidad), `frontend/src/components/Dashboard/Dashboard.test.jsx` (paleta compartida), `frontend/src/components/Reports/Reports.test.jsx` y `frontend/src/components/App.test.jsx` (pestaña y menú con `reports.trend`).

## Tareas realizadas

- [x] Permiso `reports.trend` por migración y etiqueta "Tendencia" en Permisos.
- [x] Endpoint `GET /api/reports/trend`, con las fórmulas compartidas con el Dashboard y con Ventas y utilidad.
- [x] Recharts, presets de tendencia y paleta compartida con el Dashboard.
- [x] Pestaña Tendencia de ventas.
- [x] Los tests del endpoint encontraron un bug antes de cerrar la tarea. En MySQL, `GROUP BY branch_id` busca primero en las columnas de las tablas y después en los alias del `SELECT`, así que agrupaba por `o.branch_id` aunque el `SELECT` lo definiera como `NULL`. Con dos sucursales en el mismo periodo, una fila sobrescribía a la otra. Se corrigió con alias que no chocan con ninguna columna (`trend_period`, `trend_branch`).

## Criterios de aceptación

_Pendiente. Se llenan después de implementar._

## Notas para portar a smallpos-saas

Revisado contra el código de smallpos-saas el 2026-10-21 (`db79cc7`).

- **Depende de la spec 04.** saas todavía no tiene Ventas y utilidad, y esta pestaña usa piezas que esa spec agrega:
  - `helpers/soldLines.js`, para la utilidad;
  - `Reports/reportTabs.js`, para la pestaña;
  - `utils/dateRanges.js`, para los presets.

  Hay que portar primero [`feat-reporte-ventas-y-utilidad.md`](feat-reporte-ventas-y-utilidad.md).
- **Permiso:**
  - **Catálogo:** se agrega `{ code: 'reports.trend', module: 'reports', description: 'Reporte de tendencia de ventas' }` a `PERMISSIONS` en `backend/src/rbac/catalog.js`. Después se regenera `frontend/src/auth/permissionCodes.js` con `node backend/scripts/export-permission-codes.js`.
  - **Roles:** se agrega a la plantilla de Supervisor. Administrador lo recibe solo y el Propietario tiene todo.
  - **Tenants existentes:** igual que con `reports.profit`, `syncPermissionCatalog` crea el permiso pero no se lo da a los Supervisor que ya existen. Hace falta un paso de datos por tenant en `scripts/migrate-rbac.js` / `rbac/tenantMigration.js`.
  - **Menú:** se agrega `'reports.trend'` al `anyOf` de Reportes en `frontend/src/auth/modules.js`.
  - **Ruta:** `router.get('/trend', { perm: 'reports.trend', branch: 'scope' }, reportController.getTrendReport)`.
- **Varias sucursales por usuario (Spec 12 de saas):**
  - `getTrendReport` recibe `branchIds` (de `scopeBranchIds(req.branchScope)`, `null` para todas) y filtra con `o.branch_id IN (?)`. Allá `getKpis` ya recibe `branchIds`.
  - **"Por sucursal"** tiene sentido cuando el alcance cubre más de una sucursal (`scope.isAll` o varias `branchIds`), no solo para el "administrador central". La validación del backend debe seguir esa regla, en lugar de `branchId !== null`.
  - **Sucursal en el frontend:** va en `X-Branch-Id` con `useScope`, como `CashSessionsTab` de saas, no en `branch_id`.
- **Fórmula del Dashboard:** `dashboardService.getKpis` de saas tiene la misma copia de `o.total - COALESCE(rf.refunded, 0)` (y otra en las ventas por hora). La extracción a `helpers/orderNet.js` se aplica igual.
- **"Hoy":**
  - el backend usa `todayInMexico` y `createdAtMx` de `utils/timezone.js`, que saas ya tiene;
  - el frontend calcula la fecha de México con `Intl` y `VITE_TIMEZONE`.
- **Recharts:** saas usa React 18, Vite 4 y `node:20-slim` en sus imágenes del frontend, así que Recharts 3.10.1 sirve tal cual. Después de agregarlo hay que reconstruir la imagen del frontend. Sus dependencias suben unas 660 líneas en `package-lock.json`. La paleta `CHART_COLORS` de saas está igual en `Dashboard.jsx`, así que la extracción a `utils/chartColors.js` se aplica igual.
- **Alias en `GROUP BY`:** al adaptar las consultas, conviene conservar los alias `trend_period` y `trend_branch`. Un alias que se llame como una columna (`branch_id`) agrupa por la columna, no por la expresión del `SELECT`.
- **Tests:**
  - los del backend de saas simulan `db`, así que el test de integración se reescribe con esas simulaciones;
  - `periods.test.js` es unitario y se porta tal cual;
  - los del frontend se adaptan cambiando los permisos por los códigos de saas y el alcance por `useScope`.
