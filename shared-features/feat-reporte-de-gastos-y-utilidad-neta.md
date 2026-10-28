# feat: Reporte de gastos y utilidad neta

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Borrador** | feat | smallposv2 | smallpos-saas | Commit de la spec 13 (un solo commit) | 2026-10-27 |

## Resumen

Agrega al módulo de Reportes la pestaña **Gastos** (permiso `reports.expenses`) y la **utilidad neta** en Ventas y utilidad. Es la segunda parte del módulo de gastos ([`feat-modulo-de-gastos.md`](feat-modulo-de-gastos.md)).

- **Qué gastos cuentan:** los activos (no cancelados) cuya **fecha del gasto** cae en el periodo. Las salidas de caja históricas y los retiros no son gastos. Alcance por sucursal como en el resto de Reportes.
- **Pestaña Gastos:**
  - filtros de periodo (presets de Ventas y utilidad, "Este mes" por defecto) y sucursal (solo admin central);
  - resumen: **total gastado**, número de gastos, **gasto promedio** y el total separado en "Cuenta en la utilidad neta" y "No cuenta", según la marca **actual** de cada categoría;
  - desglose con "Ver por" categoría, sucursal (solo consolidado del admin central), proveedor ("Sin proveedor" para los que no tienen) o método de pago: número de gastos, total y % del total gastado; ordenado por total y paginado de 20 en 20. Por categoría, las que no cuentan llevan la marca "No cuenta en la utilidad neta".
- **Utilidad neta en Ventas y utilidad:**
  - **gastos de la utilidad neta:** los de las categorías que cuentan en ella ("Pago a proveedor (mercancía)" no cuenta, porque su costo ya cuenta al vender);
  - **resumen:** utilidad bruta − gastos = **utilidad neta**, con su **margen neto** (utilidad neta ÷ ventas netas). La utilidad neta pasa a ser la cifra principal;
  - **por sucursal:** cada fila agrega Gastos y Utilidad neta, y aparecen también las sucursales con gastos y sin ventas, para que las filas sumen lo mismo que el resumen;
  - por producto, categoría o proveedor el desglose no cambia: los gastos no tienen esas dimensiones;
  - **con filtro de categoría de producto** no hay utilidad neta, y un aviso explica por qué, con "Quitar el filtro";
  - **permiso:** la ve quien tiene `reports.profit` **y** `reports.expenses`; con solo `reports.profit`, la pestaña queda como antes;
  - "Excluir ventas sin costo" solo cambia las ventas.
- **Aviso del primer gasto:** si el periodo empieza antes del gasto activo más antiguo (en el alcance de sucursal), la pestaña Gastos y la utilidad neta avisan con esa fecha. Si no hay ningún gasto, Ventas y utilidad avisa que la utilidad neta es igual a la bruta. Hace falta porque los gastos se registran desde el módulo de gastos, sin histórico.
- **Fuera:** gráfica del gasto, utilidad neta en Tendencia de ventas o en el Dashboard, prorrateo de gastos por producto, exportación.

Spec completa: [`specs/13-reporte-de-gastos-y-utilidad-neta.md`](../specs/13-reporte-de-gastos-y-utilidad-neta.md).

## Motivo

- Responder "¿en qué y cuánto gasto?" (peticiones #1 y #2 de `docs/reportes-borrador.md`) con lo que se registra en el módulo de gastos.
- Pasar de la utilidad bruta (lo que deja lo vendido) a la utilidad neta (lo que queda después de los gastos), decisión #9 del borrador, sin contar dos veces la mercancía.

## Historias de usuario

- Como **supervisor**, quiero ver cuánto gasté en un periodo y en qué categorías, para saber a dónde se va el dinero.
- Como **supervisor**, quiero ver el gasto por sucursal, proveedor y método de pago, para comparar y detectar gastos fuera de lo normal.
- Como **administrador**, quiero ver la utilidad neta, para saber cuánto gana de verdad el negocio y no solo cuánto deja lo vendido.
- Como **administrador central**, quiero la utilidad neta de cada sucursal, para comparar cuál es rentable.
- Como **supervisor**, quiero que los pagos de mercancía no resten de la utilidad neta, porque su costo ya cuenta al vender.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/services/reportService.js` | `getExpenseReport` (con `EXPENSE_GROUPS`, `activeExpensesWhere`, `getFirstExpenseDate` y `netProfitExpensesByBranch`). `getProfitReport` recibe `includeNet`: agrega `summary.net` y, por sucursal, `row.net`; las filas por sucursal con utilidad neta se completan, ordenan y paginan en JS (`compareProfitRows`). |
| `backend/src/controllers/reportController.js` | `getExpenseReport`. `getProfitReport` manda `includeNet` solo con `reports.expenses` (o superadmin) y sin `category_id`. |
| `backend/src/routes/report_routes.js` | `GET /reports/expenses` con `reports.expenses`. |
| `backend/tests/integration/reports/profit.test.js` | Las respuestas del admin traen `net` (sin gastos, igual a la bruta). |
| `frontend/src/components/Reports/reportTabs.js`, `Reports.jsx` | Pestaña Gastos, al final. |
| `frontend/src/components/Reports/tabs/ProfitTab.jsx` | La cuenta del resumen sigue con gastos y utilidad neta; columnas Gastos y Utilidad neta por sucursal; avisos del filtro de categoría y del primer gasto. |
| `frontend/src/components/Settings/modals/PermissionsModal.jsx` | La acción `expenses` de Reportes se muestra como "Gastos". |
| Tests del frontend | `Reports.test.jsx`, `App.test.jsx`, `ProfitTab.test.jsx` y `PermissionsModal.test.jsx`. |

## Archivos agregados

| Archivo | Qué es |
|---|---|
| `backend/migrations/012-add-reports-expenses-permission.sql` | Crea `reports.expenses` y lo asigna a superadmin, admin y supervisor. |
| `backend/tests/integration/migrations/012-add-reports-expenses-permission.test.js` | Los roles que reciben el permiso. |
| `backend/tests/integration/reports/expenses.test.js` | Resumen, cada agrupación, % del total, paginación, cancelados, alcance, primer gasto y respuestas 400/403. |
| `backend/tests/integration/reports/profit-net.test.js` | Utilidad neta: categorías que cuentan, cancelados, filas por sucursal (con una sin ventas), orden y paginación, filtro de categoría, permiso, "Excluir ventas sin costo" y alcance. |
| `frontend/src/components/Reports/tabs/ExpensesTab.jsx` y su test | La pestaña Gastos. |

## Tareas realizadas

- [x] Permiso `reports.expenses` por migración, con su pestaña y su etiqueta.
- [x] Endpoint `GET /api/reports/expenses`.
- [x] Pestaña Gastos.
- [x] Utilidad neta en `GET /api/reports/profit`.
- [x] Utilidad neta en la pestaña Ventas y utilidad.

## Criterios de aceptación

_Pendiente. Se llenan después de implementar._

## Notas para portar a smallpos-saas

Revisado contra el código de smallpos-saas el 2026-10-27 (`e8f9985`).

- **Depende de:**
  - [`feat-modulo-de-gastos.md`](feat-modulo-de-gastos.md) (spec 12): las tablas `expenses` y `expense_categories`, con la marca `counts_in_net_profit`;
  - [`feat-reporte-ventas-y-utilidad.md`](feat-reporte-ventas-y-utilidad.md) (spec 04) y [`feat-rediseno-ventas-y-tendencia.md`](feat-rediseno-ventas-y-tendencia.md) (spec 08): `getProfitReport`, `ProfitTab.jsx` y las piezas de `Reports/components/`.
- **Permiso:**
  - **Catálogo:** `{ code: 'reports.expenses', module: 'reports', description: 'Reporte de gastos' }` en `backend/src/rbac/catalog.js`, y se regenera `frontend/src/auth/permissionCodes.js`.
  - **Plantillas:** Supervisor. Administrador lo recibe solo y el Propietario tiene todo. Para los tenants existentes, un paso de datos por tenant.
  - **Menú:** `'reports.expenses'` en el `anyOf` de Reportes de `frontend/src/auth/modules.js`.
  - **Ruta:** `router.get('/expenses', { perm: 'reports.expenses', branch: 'scope' }, reportController.getExpenseReport)`.
  - **Utilidad neta:** en saas, el controller revisa el permiso con `req.user.can('reports.expenses')` (guards.js; sin atajo por nombre de rol, el Propietario lo trae en el token), y `ProfitTab` con `can('reports.expenses')` del `UserContext`.
  - **Etiquetas:** el modal de permisos de saas muestra la descripción del catálogo, así que el cambio de `PermissionsModal.jsx` no se porta.
- **Varias sucursales por usuario (Spec 12 de saas):**
  - `getExpenseReport`, `getFirstExpenseDate` y `netProfitExpensesByBranch` reciben `branchIds` (`scopeBranchIds(req.branchScope)`, `null` para todas) y filtran con `e.branch_id IN (?)`;
  - "Ver por sucursal" y la columna se muestran cuando el alcance cubre más de una sucursal;
  - la sucursal del filtro va en `X-Branch-Id` con `useScope`.
- **Tests:** los del backend de saas simulan `db`, así que los de integración se reescriben con esas simulaciones. Los del frontend se adaptan con los códigos de permiso de saas y `useScope`.
