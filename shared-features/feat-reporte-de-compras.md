# feat: Reporte de compras

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Implementada** | feat | smallposv2 | smallpos-saas | Commit de la spec 16 (un solo commit) | 2026-10-29 |

## Resumen

Agrega a Reportes la pestaña **Compras** (permiso `reports.purchases`), después de Gastos. Responde "¿a quién le compro más?", solo con las compras. Es la segunda parte del módulo de compras ([`feat-modulo-de-compras.md`](feat-modulo-de-compras.md)).

- **Qué cuenta:**
  - las compras **activas** (no canceladas) cuya **fecha de la compra** cae en el periodo; su monto es su total;
  - los gastos no se suman, con proveedor o sin él (cambio del 2026-11-10). Los gastos por proveedor se ven en el reporte de Gastos.
  - El alcance por sucursal es el del resto de Reportes.
- **Filtros:**
  - periodo, con los presets de Gastos y "Este mes" por defecto;
  - sucursal, solo para el admin central.
- **Resumen:** **total comprado**, número de compras, **compra promedio** y número de proveedores.
- **Desglose ("Ver por"):**
  - **Proveedor** (por defecto): compras, total, % del total, compra promedio y fecha de la última compra. Un proveedor inactivo lleva la marca "Inactivo".
  - **Producto:** nombre y SKU, cantidad con su unidad, en cuántas compras aparece, total, % y **costo promedio de compra** (total ÷ cantidad). Las variantes se suman a su producto, y un producto inactivo lleva la marca "Inactivo".
  - **Sucursal**, solo en el consolidado del admin central: compras, total, % y compra promedio.
  - Las filas van ordenadas por total y paginadas de 20 en 20; en móvil se ven como tarjetas. Tocar una fila no abre nada.
- **Aviso de la primera compra:** si el periodo empieza antes de la compra activa más antigua del alcance, se avisa que las entradas de mercancía anteriores no tienen costo ni proveedor.
  - **Se puede cerrar** con la × ("Cerrar aviso"; cambio del 2026-10-30). Cerrado, vuelve a salir al cambiar el periodo o la sucursal, y al volver a abrir la pestaña; "Ver por" y la página no lo vuelven a mostrar. Lo cerrado no se guarda.
- **Fuera:**
  - los gastos y "¿con quién gasto más?": la spec tuvo un selector "Sumar: Solo compras / Compras y gastos", que se quitó el 2026-11-10 porque dejaba fuera los gastos sin proveedor y no cuadraba con el módulo de Gastos;
  - la lista de cada compra, que está en el módulo Compras;
  - gráfica y desglose por categoría de producto o por método de pago;
  - las entradas históricas "Compra a proveedor";
  - cuentas por pagar, exportación y comparación con otro periodo.

Spec completa: [`specs/16-reporte-de-compras.md`](../specs/16-reporte-de-compras.md).

## Motivo

- Responder "¿a quién le compro más?" (petición #3 de `docs/reportes-borrador.md`) con lo que se registra en el módulo de compras.

## Historias de usuario

- Como **supervisor**, quiero ver a qué proveedores les compro más en un periodo, para negociar precios y decidir con quién comprar.
- Como **supervisor**, quiero ver qué productos compro más y a qué costo promedio, para planear las compras.
- Como **administrador central**, quiero comparar lo que compra cada sucursal.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/services/reportService.js` | `getPurchaseReport`, con `PURCHASE_GROUPS`, `PURCHASE_ROWS`, `activePurchasesWhere` y `getFirstPurchaseDate`. |
| `backend/src/controllers/reportController.js` | `getPurchaseReport`. |
| `backend/src/routes/report_routes.js` | `GET /reports/purchases` con `reports.purchases`. |
| `frontend/src/components/Reports/reportTabs.js`, `Reports.jsx` | Pestaña Compras, al final. |
| `frontend/src/components/Settings/modals/PermissionsModal.jsx` | La acción `purchases` de Reportes se muestra como "Compras". |
| `frontend/src/components/Reports/components/SummaryNote.jsx`, `reports.css` | `onDismiss` opcional: el botón × del aviso (`.rpt-note__close`, `.rpt-note--dismissible`). Los avisos de las demás pestañas no lo usan. |
| Tests del frontend | `Reports.test.jsx`, `App.test.jsx` y `PermissionsModal.test.jsx`. |

## Archivos agregados

| Archivo | Qué es |
|---|---|
| `backend/migrations/018-add-reports-purchases-permission.sql` | Crea `reports.purchases` y lo asigna a superadmin, admin y supervisor. |
| `backend/tests/integration/migrations/018-add-reports-purchases-permission.test.js` | Los roles que reciben el permiso. |
| `backend/tests/integration/reports/purchases.test.js` | Resumen, cada agrupación, % del total, orden, paginación, canceladas, fecha de la compra, alcance, primera compra, que los gastos no cuentan (ni con `include_expenses`) y respuestas 400/403. |
| `frontend/src/components/Reports/tabs/PurchasesTab.jsx` y su test | La pestaña Compras, con el aviso que se cierra (`noteClosed`, que vuelve a `false` al cambiar un filtro). |

## Tareas realizadas

- [x] Permiso `reports.purchases` por migración, con su pestaña y su etiqueta.
- [x] Endpoint `GET /api/reports/purchases`.
- [x] Pestaña Compras.
- [x] Aviso que se cierra y vuelve a salir al cambiar un filtro o al abrir la pestaña.
- [x] Solo compras: se quitaron "Sumar", "Compras y gastos" e `include_expenses` (2026-11-10).

## Criterios de aceptación

Implementada en smallpos-saas con la Spec 26 (`specs/26-purchases-report.md`) el 2026-11-25. Las pruebas por la API se hicieron en `marksexpress` con usuarios reales, después de un backup que no se restauró (decisión del usuario), comparando cada respuesta con consultas directas a la base.

- [x] **Migración:** la `018` se aplicó a `marksexpress` y a `rbac09demo`, y la segunda corrida dijo "Al día". `reports.purchases` lo tienen Administrador, Supervisor y Almacenista, una vez cada uno. El Cajero, el Propietario y los roles personalizados no lo tienen.
- [x] **Resumen y desglose:** un Supervisor con "Todas mis sucursales" vio en noviembre $1,723.46 en 8 compras, compra promedio $215.43 y 6 proveedores, con "Proveedor generico" primero (25.56 %).
  - El resumen, cada "Ver por" (proveedor, producto y sucursal) y la primera compra coincidieron con la base, también la última compra de cada proveedor y el costo promedio de cada producto.
  - Las 3 compras canceladas del mes no cuentan.
- [x] **Variantes:** un Almacenista registró una compra de prueba con 3 de una variante y 2 de otra del mismo producto, por $654.00. Por producto, ese producto salió una sola vez: 5 par, 1 compra, $654.00 y costo promedio $130.80, igual que en la base.
- [x] **Alcance y permisos:**
  - un Almacenista de Sucursal Central solo ve las compras de Central, y uno de Sucursal Norte solo las de Norte. Pedir la otra sucursal en `X-Branch-Id` responde 403;
  - el Cajero, y un Supervisor sin `reports.purchases` aunque tenga `purchases.read` y `reports.expenses`, reciben 403.
- [x] **Aviso de la primera compra:** con Este mes, el periodo empieza antes de la primera compra (25 nov 2026) y sale el aviso. Con Hoy no sale.
- [x] **Pantalla:** el usuario la revisó en la app el 2026-11-25, en escritorio (1366 px) y en el celular, con cada "Ver por" y la × del aviso, y todo se ve bien.
- [x] **Tests:**
  - **backend:** `purchaseReport.test.js` (38), la `018` en `migrationFiles.test.js` (3), el catálogo, las plantillas y la matriz de rutas;
  - **frontend:** `PurchasesTab` (29), `SummaryNote` (3), `Reports` y `App`;
  - **resultado:** en Docker pasan los del backend (1583/1583, 66 suites) y los del frontend (791/791, 74 archivos).

**Diferencias con smallposv2:**
- **Permiso:**
  - la descripción es "Ver el reporte de compras", como los demás reportes de saas;
  - lo recibe también el **Almacenista**, que registra las compras (decisión del plan de saas). La `018` lo asigna por nombre de rol a Administrador, Administrador de sucursal, Supervisor y Almacenista;
  - la etiqueta de `PermissionsModal.jsx` no se porta: saas muestra la descripción del catálogo.
- **Ícono:** la pestaña usa `bi-cart-plus`, el del módulo Compras, porque `bi-cart-check` es el de "Vender" en saas.
- **Sucursales:**
  - el alcance va en `X-Branch-Id` con `useScope('purchases-report')` y `ScopeSelector`, y el backend filtra con `branchIds`. No hay `branch_id` en el query;
  - "Ver por sucursal" aparece cuando el alcance cubre más de una sucursal, no por ser administrador central.
- **Carga y error, como Gastos de saas:** el esqueleto solo sale en la primera carga, y después las filas anteriores se quedan atenuadas. Si la API falla, se vacían el resumen y el desglose.
- **El aviso vuelve a salir** al cambiar el periodo o el alcance desde sus controles, no con un efecto. Cambiar "Ver por" o la página no lo vuelve a mostrar, como aquí.
- **Aviso de la primera compra:** dice lo mismo que aquí (decisión del usuario). No menciona los gastos de "Pago a proveedor (mercancía)" que el histórico de caja de saas dejó en Gastos.
- **Tests:** los del backend simulan la base, y las sumas se comprobaron contra `marksexpress`. Los del frontend se adaptaron al `can()` de saas y a `useScope`.

## Notas para portar a smallpos-saas

Revisado contra el código de smallpos-saas el 2026-10-29 (`82f8b31`): todavía no tiene el módulo de compras ni los reportes de las specs 04–15. Sus reportes son solo los de cortes de caja.

- **Depende de:**
  - [`feat-modulo-de-compras.md`](feat-modulo-de-compras.md) (spec 14): las tablas `purchases` y `purchase_items`;
  - [`feat-rediseno-ventas-y-tendencia.md`](feat-rediseno-ventas-y-tendencia.md) (spec 08): las piezas de `Reports/components/`.
- **Permiso:**
  - **Catálogo:** `{ code: 'reports.purchases', module: 'reports', description: 'Reporte de compras' }` en `backend/src/rbac/catalog.js`, y se regenera `frontend/src/auth/permissionCodes.js`.
  - **Plantillas:** Supervisor. Administrador lo recibe solo y el Propietario tiene todo. Para los tenants existentes, un paso de datos por tenant.
  - **Menú:** `'reports.purchases'` en el `anyOf` de Reportes de `frontend/src/auth/modules.js`.
  - **Ruta:** `router.get('/purchases', { perm: 'reports.purchases', branch: 'scope' }, reportController.getPurchaseReport)`, con `createSecureRouter`.
  - **Etiquetas:** el modal de permisos de saas muestra la descripción del catálogo, así que el cambio de `PermissionsModal.jsx` no se porta.
- **Varias sucursales por usuario (Spec 12 de saas):**
  - `activePurchasesWhere` y `getFirstPurchaseDate` reciben `branchIds` (`scopeBranchIds(req.branchScope)`, `null` para todas) y filtran con `branch_id IN (?)`;
  - "Ver por sucursal" se muestra cuando el alcance cubre más de una sucursal;
  - la sucursal del filtro va en `X-Branch-Id` con `useScope`.
- **Tests:** los del backend de saas simulan `db`, así que los de integración se reescriben con esas simulaciones. Los del frontend se adaptan con los códigos de permiso de saas y `useScope`.
