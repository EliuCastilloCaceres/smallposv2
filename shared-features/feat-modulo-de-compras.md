# feat: Módulo de compras

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Borrador** | feat | smallposv2 | smallpos-saas | Commit de las specs 14 y 15 (un solo commit) | 2026-10-28 |

## Resumen

Agrega el módulo **Compras** para registrar lo que se compra a cada proveedor, con sus productos, cantidades y costos. Cada compra sube el inventario y recalcula el costo del producto con el **promedio ponderado global**. Desde ahora, las compras solo se registran aquí: se quita el motivo "Compra a proveedor" de los ajustes de inventario y se desactiva la categoría de gasto "Pago a proveedor (mercancía)". El reporte de compras por proveedor y "con quién gasto más" van en la spec 16.

- **Cada compra** guarda:
  - proveedor activo, obligatorio; puede ser el genérico;
  - fecha (hoy o pasada, nunca futura), sucursal y método de pago (los activos, sin Crédito);
  - folio (hasta 50), notas (hasta 255) y comprobante, opcionales;
  - total: la suma de sus líneas;
  - quién la registró y cuándo.
- **Cada línea** (de 1 a 200 por compra, sin repetir producto y variante):
  - producto activo y, si es variable, una variante activa suya, obligatoria;
  - cantidad mayor a 0, con hasta 3 decimales;
  - costo unitario mayor a 0, con centavos: lo que de verdad se pagó, con IVA;
  - subtotal, y el costo del producto antes y después de la compra.
- **Inventario:** al registrar, en la misma transacción, cada línea entra al stock de la sucursal con `operation_type = 'purchase'`, `reference_type = 'purchase'` y el motivo "Compra #id – proveedor". La entrada y el costo se aplican al registrar, aunque la fecha sea pasada.
- **Costo promedio ponderado**, una vez por producto con todas sus líneas:
  - `(E × C + Σ cantidad × costo) / (E + Σ cantidad)`, redondeado al centavo;
  - E: la existencia del producto **antes** de la compra, en todas las sucursales y variantes (`inventory_stock`). Lo apartado no entra, porque su costo ya quedó congelado al apartar;
  - C: el costo actual (`products.purchase_price`);
  - si E ≤ 0 o C = 0, el costo nuevo es el promedio de las líneas;
  - la fila del producto se bloquea (`FOR UPDATE`, en orden de id) para que dos compras no se crucen;
  - las ventas ya hechas conservan su costo.
- **Pagado desde caja:** solo con Efectivo, de hoy y de una caja con sesión abierta de la sucursal. Crea su salida en `cash_movements` de tipo `purchase`, por el total, ligada a la compra ("Compra #id: proveedor").
- **Cancelación:** una compra no se edita; se cancela con motivo.
  - Revierte el inventario de todas las líneas (`purchase_cancelled`), **todo o nada**: si a una línea le falta stock, responde 409 con *"No hay stock suficiente de «producto» para revertir la compra."* y no cancela nada.
  - **El costo no se recalcula**; el detalle lo avisa.
  - Si se pagó desde caja y su sesión sigue abierta, registra el reingreso (`purchase_refund`); si ya se cerró, se cancela sin reingreso y se avisa.
- **Tipos de caja nuevos:** `purchase` (resta) y `purchase_refund` (suma), en `helpers/cashMovements.js`.
- **Compra desde el POS:** en Movimientos de caja, la opción **Compra** (con `purchases.create`) abre el formulario de compra fijo en Efectivo, pagado desde la caja del POS y de hoy. Al guardarla, el POS vuelve a leer el stock.
- **Módulo Compras** (menú y ruta `/purchases`, con `purchases.read`):
  - **filtros:** periodo, sucursal (admin central), proveedor, método de pago, estado (Activas por defecto, Canceladas o Todas) y búsqueda por folio, notas o producto de sus líneas;
  - el total y el número de compras activas del filtro;
  - lista paginada de 20, con las canceladas tachadas; en móvil, tarjetas;
  - **formulario:** buscador por nombre o SKU; Enter con un SKU exacto (lector de códigos de barras) agrega el producto o la variante; si ya está, suma 1. El costo unitario empieza con el costo actual;
  - **detalle:** las líneas con el costo antes y después, la salida de caja, el comprobante y la cancelación.
- **Fin de "Compra a proveedor":** el ajuste individual, el masivo y el producto agotado del POS ya no lo ofrecen, y el backend responde 400 si llega (sin importar mayúsculas). Los movimientos históricos no cambian.
- **Categoría de gasto:** una migración desactiva "Pago a proveedor (mercancía)". Los gastos que ya la tienen no cambian.
- **Permisos:** `purchases.read`, `purchases.create` y `purchases.cancel`.
  - superadmin, admin y supervisor: los 3;
  - almacenista: read y create;
  - cajero: solo create. Sin `purchases.read` no ve el menú, y el backend solo le acepta compras pagadas desde una caja abierta de su sucursal.
- **Endpoints:**
  - `GET /api/purchases`, `/:id` y `/:id/receipt`, con `purchases.read`;
  - `GET /api/purchases/options` y `/products`, con `purchases.create` o `purchases.read`. `/products` busca hasta 10 productos activos, primero los de SKU exacto, con su costo, sus variantes activas y el stock en la sucursal;
  - `POST /api/purchases`, multipart con las líneas como JSON en `items` y el comprobante en `receipt`;
  - `POST /api/purchases/:id/cancel`.

Spec completa: [`specs/14-modulo-de-compras.md`](../specs/14-modulo-de-compras.md).

## Motivo

- Las entradas de mercancía no guardaban ni costo ni proveedor. En producción había 1,132 entradas con el motivo "Compra a proveedor" (675 `purchase` y 457 `entry`, porque el ajuste masivo siempre grababa `entry`), de 558 productos, sin un solo costo. No se podía saber "a quién le compro más" (petición #3 de `docs/reportes-borrador.md`).
- El costo del producto se capturaba a mano, así que la utilidad y la valuación dependían de que alguien lo actualizara. Con el promedio ponderado, el costo sale de lo que de verdad se pagó.
- El cajero es quien paga a los repartidores desde la caja (unas 271 de 343 salidas históricas eran pagos de mercancía), así que la compra se registra desde el POS, con sus productos, en lugar de un gasto sin líneas.

## Historias de usuario

- Como **almacenista**, quiero registrar cada compra con su proveedor y los productos, cantidades y costos que recibí, para que el inventario suba y el costo del producto se actualice solo.
- Como **cajero**, quiero registrar desde el POS la compra que le pago al repartidor con el efectivo de mi caja, para que el inventario, el costo y el corte queden bien sin capturar dos veces.
- Como **supervisor**, quiero que el costo del producto sea el promedio ponderado de lo que tengo y de lo que compro, para que la utilidad y la valuación usen un costo real.
- Como **supervisor**, quiero cancelar una compra mal capturada con su motivo, para que el inventario se revierta sin borrar el registro.
- Como **administrador**, quiero que las compras solo se registren en Compras, para que toda entrada de mercancía tenga proveedor y costo.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/app.js` | Monta `/api/purchases`. |
| `backend/src/helpers/cashMovements.js` | `purchase` resta y `purchase_refund` suma al efectivo esperado. |
| `backend/src/services/cashRegisterService.js` | El mensaje de `createMovement` dice que las compras se registran como compras. |
| `backend/src/services/inventoryService.js` | Quita "Compra a proveedor" de los motivos; el ajuste individual y el masivo lo rechazan con 400. |
| `backend/src/services/stockService.js` | `manualAdjustment` ya no convierte ese motivo en `purchase`. |
| `backend/src/services/expenseService.js` | Usa `helpers/cashOutflows.js`, con los mismos mensajes. |
| `backend/src/controllers/expenseController.js` | Envía el comprobante con `sendReceipt`. |
| `backend/src/middlewares/uploadExpenseReceipt.js` | Solo elige su carpeta; las reglas pasaron a `uploadReceipt.js`. |
| `backend/tests/setup/env.js` | `PURCHASE_RECEIPTS_DIR` apunta a una carpeta temporal en los tests. |
| `docker-compose.prod.yml` | Volumen `./backend/storage/purchase-receipts`. |
| `frontend/src/main.jsx`, `frontend/src/components/App.jsx` | Ruta `/purchases` y entrada Compras en el menú, con `purchases.read`. |
| `frontend/src/context/PosContext.jsx` | `stockVersion` y `notifyStockChanged`, para que la pantalla de venta relea el stock. |
| `frontend/src/components/Pos/Pos.jsx` | La cuadrícula se vuelve a leer cuando cambia `stockVersion`. |
| `frontend/src/components/Pos/modals/CashMovementsModal.jsx` | Opción Compra, etiquetas `purchase` y `purchase_refund`. |
| `frontend/src/components/Pos/modals/OutOfStockModal.jsx`, `Inventory/drawers/AdjustDrawer.jsx`, `Inventory/modals/BulkAdjustModal.jsx` | Sin el motivo "Compra a proveedor". |
| `frontend/src/components/Pos/printCorteReport.js`, `Reports/modals/CashSessionDetailModal.jsx` | Etiquetas de los tipos de caja nuevos. |
| `frontend/src/components/Inventory/tabs/MovementsTab.jsx` | Etiqueta "Compra cancelada" (`purchase_cancelled`). |
| `frontend/src/components/Expenses/expenseForm.js` | `openRecordReceipt` y `downloadRecordReceipt`, para gastos y compras. |
| `frontend/src/components/Settings/modals/PermissionsModal.jsx` | El módulo `purchases` se muestra como "Compras". |
| Tests de la spec 12 | `list-expenses`, `expense-categories`, `008-add-expense-categories` y `cashMovements`: la categoría de mercancía inactiva y los tipos de caja nuevos. |

## Archivos agregados

| Archivo | Qué es |
|---|---|
| `backend/migrations/013-add-purchases.sql` | Tablas `purchases` y `purchase_items` (con `variant_key` y llave única por producto y variante). |
| `backend/migrations/014-add-purchases-permissions.sql` | Los 3 permisos, asignados por nombre de rol. En una transacción. |
| `backend/migrations/015-deactivate-merchandise-expense-category.sql` | Desactiva "Pago a proveedor (mercancía)". En una transacción. |
| `backend/src/helpers/cashOutflows.js` | Validaciones, caja abierta y reingreso que comparten gastos y compras. |
| `backend/src/middlewares/uploadReceipt.js` | `createReceiptUpload({ dirEnv, folder })` y `sendReceipt`: el comprobante privado de cada módulo. |
| `backend/src/middlewares/uploadPurchaseReceipt.js` | Comprobante de compras en `backend/storage/purchase-receipts`. |
| `backend/src/services/purchaseService.js`, `controllers/purchaseController.js`, `routes/purchase_routes.js` | API de compras. |
| `backend/tests/integration/migrations/013-…`, `014-…` y `015-….test.js` | Tests de las migraciones. |
| `backend/tests/integration/purchases/*.test.js` | Registro (validaciones, inventario, costo promedio, desde caja, cajero, alcance), lista, detalle, comprobante, productos, opciones y cancelación. |
| `backend/tests/integration/inventory/adjustment-reasons.test.js` | Los ajustes rechazan "Compra a proveedor". |
| `frontend/src/components/Purchases/Purchases.jsx`, `purchases.css` | El módulo, con estilos `pur-*`; las variables también van en `.pur-overlay` porque el formulario se abre en el POS. |
| `frontend/src/components/Purchases/purchaseForm.js` | Líneas, total, FormData y comprobante, compartidos por el módulo y el POS. |
| `frontend/src/components/Purchases/PurchaseLines.jsx` | Buscador con lector de códigos de barras y lista de líneas. |
| `frontend/src/components/Purchases/modals/PurchaseFormModal.jsx`, `PurchaseDetailModal.jsx` | Nueva compra (también desde el POS) y detalle con cancelación. |
| Tests del frontend | `Purchases.test.jsx`, `PurchaseFormModal.test.jsx`, `PurchaseDetailModal.test.jsx`, `MovementsTab.test.jsx`, `AdjustDrawer.test.jsx`, `BulkAdjustModal.test.jsx`, `OutOfStockModal.test.jsx`, más casos en `CashMovementsModal`, `printCorteReport`, `CashSessionDetailModal`, `App` y `PermissionsModal`. |

## Tareas realizadas

- [x] Tablas de compras y de sus líneas.
- [x] Permisos, menú y etiqueta de Permisos.
- [x] Tipos de movimiento de caja y de inventario.
- [x] Fin del motivo "Compra a proveedor" y categoría de mercancía inactiva.
- [x] API de compras: registro, inventario y costo promedio ponderado.
- [x] API de compras: lista, detalle, comprobante, productos, opciones y cancelación.
- [x] Módulo Compras.
- [x] Compra desde el POS.
- [x] Volumen de comprobantes y esta documentación.

## Criterios de aceptación

_Pendiente. Se llenan después de implementar._

## Notas para portar a smallpos-saas

Revisado contra el código de smallpos-saas el 2026-10-28 (`0014322`).

- **Depende del módulo de gastos:** saas todavía no tiene [`feat-modulo-de-gastos.md`](feat-modulo-de-gastos.md). Las compras usan piezas que llegan con él: `helpers/cashMovements.js`, el comprobante privado y el gasto desde el POS en `CashMovementsModal`. Conviene portar primero gastos y después compras; `cashOutflows.js` y `uploadReceipt.js` se pueden crear directamente en el port de gastos.
- **Categoría de mercancía:** si gastos se porta junto con compras, la categoría "Pago a proveedor (mercancía)" puede nacer inactiva o no sembrarse; la `015` solo hace falta en los tenants que ya la tengan. Se busca por nombre, así que hay que revisar si algún tenant la renombró.
- **Esquema por tenant:** las tablas `purchases` y `purchase_items` se aplican a cada tenant con su propio paso (`scripts/migrate-*`), y un tenant nuevo debe nacer con ellas. `variant_key` es una columna generada `STORED`, como en `inventory_stock`; MariaDB la acepta.
- **"Compra a proveedor":** saas lo tiene en los mismos cinco lugares (`inventoryService`, `stockService`, `AdjustDrawer`, `BulkAdjustModal` y `OutOfStockModal`).
- **Permisos:**
  - **Catálogo:** se agregan a `PERMISSIONS` en `backend/src/rbac/catalog.js`, y se regenera `frontend/src/auth/permissionCodes.js`: `purchases.read` ("Ver compras"), `purchases.create` ("Registrar compras") y `purchases.cancel` ("Cancelar compras").
  - **Plantillas:** Supervisor recibe los 3, Almacenista read y create, y Cajero solo create. Administrador lo recibe todo, y el Propietario tiene todo.
  - **Tenants existentes:** hace falta un paso de datos por tenant para los roles que ya existen.
  - **Menú:** entrada Compras con `purchases.read` en `frontend/src/auth/modules.js`.
- **Rutas con `createSecureRouter`:**
  - `GET /options` y `/products` con `{ anyPerm: ['purchases.create', 'purchases.read'], branch: 'scope' }`;
  - `GET /`, `/:id` y `/:id/receipt` con `purchases.read` y `branch: 'scope'`;
  - `POST /` con `purchases.create` y `branch: 'required'`;
  - `POST /:id/cancel` con `purchases.cancel` y `branch: 'scope'`.
- **Costo promedio con varios tenants:** la existencia E se suma en la base del tenant, en todas sus sucursales. No cambia nada más: el catálogo ya es por tenant.
- **Comprobantes por tenant:** igual que en gastos, en una carpeta privada por tenant (por ejemplo `storage/{subdomain}/purchase-receipts`), y la descarga busca en la carpeta del tenant del request.
- **Varias sucursales por usuario (Spec 12 de saas):**
  - la lista, el detalle, el comprobante y la cancelación filtran con `branchIds`;
  - el registro usa la sucursal del request (`X-Branch-Id`), y la búsqueda de productos muestra el stock de esa sucursal;
  - la caja de la compra pagada desde caja debe ser de esa sucursal.
- **POS:** `stockVersion` se agrega al `PosContext` de saas. Revisar que la cuadrícula del POS de saas se lea con un `fetchGrid` parecido.
- **Etiquetas:** el modal de permisos de saas muestra la descripción del catálogo, así que el cambio de `PermissionsModal.jsx` no se porta.
- **Tests:** los del backend de saas simulan `db`, así que los de integración se reescriben con esas simulaciones. Los del frontend se adaptan con los códigos de permiso de saas y `useScope`.
