# feat: Comprobante después de guardar

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Implementada** | feat | smallposv2 | smallpos-saas | Commit de las specs 14 y 15 (un solo commit) | 2026-10-28 |

## Resumen

Permite **agregar o reemplazar el comprobante** de un gasto o de una compra desde su detalle, después de registrarlo, y guarda quién subió cada comprobante y cuándo. Antes, el comprobante solo se adjuntaba al registrar ([`feat-modulo-de-gastos.md`](feat-modulo-de-gastos.md) y [`feat-modulo-de-compras.md`](feat-modulo-de-compras.md)).

- **Un solo comprobante** por gasto o compra, como antes: foto o PDF (jpg, png, webp o pdf) de hasta 5 MB, con el contenido real validado, en la carpeta privada de su módulo.
- **Agregar o reemplazar:**
  - `PUT /api/expenses/:id/receipt` y `PUT /api/purchases/:id/receipt`, multipart con el campo `receipt`;
  - piden `read` y `create` del módulo: superadmin, admin y supervisor en los dos; el almacenista solo en Compras; el cajero en ninguno, porque no tiene `read`;
  - solo en registros **activos**: un cancelado responde 400 (*"No se puede cambiar el comprobante de un gasto cancelado."* o *"…de una compra cancelada."*);
  - sin archivo, 400 *"Elige el comprobante."*; otra sucursal, 404, como el detalle;
  - la fila se bloquea (`FOR UPDATE`). Al reemplazar, el archivo anterior se borra del disco **después** de guardar; si no se guarda, se borra el archivo recién subido;
  - responde el detalle actualizado.
- **Quién lo subió:** columnas `receipt_uploaded_by` (usuario) y `receipt_uploaded_at` en `expenses` y `purchases`. Al registrar con comprobante, son quien registra y la hora del registro. Los comprobantes que ya existían toman `created_by` y `created_at`. El detalle devuelve `receipt_uploaded_by_name` y `receipt_uploaded_at`.
- **Pantalla:** en el detalle, la sección Comprobante muestra *"Subido por Nombre · fecha y hora"* y, con el permiso `create` en un registro activo, el botón **"Agregar comprobante"** o **"Reemplazar"**:
  - abre el selector de archivos (en un teléfono, también la cámara) y valida el archivo antes de subirlo;
  - reemplazar pide confirmación: *"¿Reemplazar el comprobante? El anterior se borra y no se puede recuperar."*;
  - al guardar muestra *"Comprobante guardado."*, actualiza el detalle y vuelve a leer la lista, para que aparezca el clip.
- **No incluye:** varios comprobantes por registro, quitar un comprobante sin poner otro, conservar los reemplazados, registros cancelados y agregarlo desde el POS.

## Motivo

- La factura muchas veces llega después del pago, o se sube la foto equivocada. Sin esto había que cancelar y volver a capturar el gasto o la compra, y en una compra eso revierte el inventario.
- Desde que el comprobante se puede cambiar, ya no es siempre de quien registró; por eso se guarda quién lo subió y cuándo.

## Historias de usuario

- Como **supervisor**, quiero adjuntar la factura de un gasto o de una compra cuando me llega después de registrarlo, para tener el respaldo sin cancelar y volver a capturar.
- Como **almacenista**, quiero reemplazar el comprobante de una compra si subí la foto equivocada, para que el respaldo sea el correcto.
- Como **administrador**, quiero saber quién subió cada comprobante y cuándo, para revisar los cambios.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/services/expenseService.js`, `purchaseService.js` | `replaceReceipt`; quién subió el comprobante al registrar y en el detalle. |
| `backend/src/controllers/expenseController.js`, `purchaseController.js` | `replaceReceipt`: borra el archivo anterior después de guardar, o el nuevo si falla. |
| `backend/src/routes/expense_routes.js`, `purchase_routes.js` | `PUT /:id/receipt` con `read` y `create`. |
| `frontend/src/components/Expenses/expenseForm.js` | `uploadRecordReceipt(resource, id, file)`. |
| `frontend/src/components/Expenses/modals/ExpenseDetailModal.jsx`, `Purchases/modals/PurchaseDetailModal.jsx` | "Subido por", el botón y las props `canAttach` y `onReceiptSaved`. |
| `frontend/src/components/Expenses/Expenses.jsx`, `Purchases/Purchases.jsx` | Pasan `canAttach` (el permiso `create`) y recargan la lista al guardar el comprobante. |

## Archivos agregados

| Archivo | Qué es |
|---|---|
| `backend/migrations/016-add-expenses-receipt-uploader.sql`, `017-add-purchases-receipt-uploader.sql` | Columnas `receipt_uploaded_by` (con llave foránea a `users`) y `receipt_uploaded_at`, llenas con `created_by` y `created_at` en los comprobantes que ya existían. |
| `backend/tests/integration/migrations/016-…` y `017-….test.js` | Parten de una base migrada hasta la anterior, con datos de la forma vieja, y aplican el resto. |
| `backend/tests/integration/expenses/expense-receipt.test.js`, `purchases/purchase-receipt.test.js` | Quién lo subió al registrar, agregar, reemplazar (borra el archivo anterior), validaciones, alcance por sucursal y permisos. |
| `frontend/src/components/Expenses/ReceiptUploadButton.jsx` | El botón, la validación y la confirmación, para gastos y compras. |
| Tests del frontend | `ReceiptUploadButton.test.jsx`, y casos nuevos en `ExpenseDetailModal`, `PurchaseDetailModal`, `Expenses` y `Purchases`. |

## Tareas realizadas

- [x] Migraciones de quién subió el comprobante.
- [x] API para agregar o reemplazar el comprobante.
- [x] Botón en el detalle de gastos y compras.
- [x] Esta documentación.

## Criterios de aceptación

Implementada en smallpos-saas con la Spec 25 (`specs/25-receipt-after-saving.md`) el 2026-11-25. Las pruebas por la API se hicieron en `marksexpress` con usuarios reales, después de un backup que no se restauró (decisión del usuario). Los comprobantes se agregaron y se reemplazaron solo en compras de prueba de la Spec 24 y en gastos de prueba con `QA-25` en la descripción, que se cancelaron al final.

- [x] **Migraciones:** la `016` y la `017` se aplicaron a `marksexpress` y a `rbac09demo`, y la segunda corrida dijo "Al día":
  - los 2 gastos y las 6 compras con comprobante de `marksexpress` tomaron a quien los registró y la hora del registro. Los demás quedaron vacíos;
  - las demás columnas no cambiaron: la huella de las dos tablas fue la misma antes y después.
- [x] **Agregar en un gasto:** un Supervisor le agregó un PNG a un gasto de prueba sin comprobante:
  - la lista lo mostró con comprobante, y el detalle dijo quién lo subió y cuándo;
  - el archivo quedó en `storage/marksexpress/expense-receipts/` y se descargó con su nombre original.

  Un gasto registrado con un PDF quedó con quien lo registró y la hora del registro.
- [x] **Reemplazar en una compra:** un Almacenista de Sucursal Central le agregó un PNG a una compra sin comprobante y lo reemplazó con un PDF. El detalle mostró el nuevo y el PNG ya no estaba en el disco. La compra, sus líneas, el inventario, el costo y el stock no cambiaron.
- [x] **Lo que no se puede:**
  - un gasto o una compra cancelados responden 400 con sus mensajes, y la compra conserva su comprobante;
  - sin archivo, 400 *"Elige el comprobante."*; un `.txt` o un `.png` que no es imagen, 400;
  - el Cajero recibe 403 en los dos módulos, y el Almacenista en Gastos;
  - un Almacenista de Sucursal Norte recibe 404 con una compra y con un gasto de Central. Para el gasto se le dieron `expenses.read` y `expenses.create` como permisos extra, y al final se le quitaron;
  - ningún intento rechazado dejó un archivo en el disco;
  - un Supervisor con "Todas mis sucursales" sí cambió el de una compra de Sucursal Norte.
- [x] **Comprobantes que ya existían:** al terminar las pruebas por la API, los 8 seguían con el mismo SHA-256 y sus registros no habían cambiado.
- [x] **Pantalla:** el usuario la revisó en la app el 2026-11-25. Agregar y reemplazar el comprobante se ven y se usan bien en Gastos y en Compras, en escritorio (1366 px) y en el celular.
- [x] **Tests:**
  - **backend:** `expenses.test.js` (71), `purchases.test.js` (101), `rbacGuards`, `routeAudit`, `migrationFiles` y la matriz de rutas;
  - **frontend:** `ReceiptUploadButton` (6), y casos nuevos en `ExpenseDetailModal`, `PurchaseDetailModal`, `Expenses` y `Purchases`;
  - **resultado:** en Docker pasan los del backend (1540/1540, 65 suites) y los del frontend (754/754, 72 archivos).

**Diferencias con smallposv2:**
- **Migraciones `016` y `017`:** las tablas ya existían en los tenants (Specs 22 y 24 de saas), así que las columnas llegaron con una migración por tabla, como aquí. Se aplican con `migrate-tenants.js`.
- **Dos permisos con `allPerm`:** aquí se encadenan dos `requirePermission`. En saas, `createSecureRouter` declara un solo acceso por ruta, así que se agregó `{ allPerm: [...] }`, con el guard `requireAllPermissions`, y la matriz de rutas muestra los dos permisos.
- **Comprobantes por tenant:** el anterior se borra de la carpeta del tenant de la petición (`receiptPath`, con `basename`). No hay `PURCHASE_RECEIPTS_DIR`: la raíz es la de `STORAGE_DIR`.
- **Sucursales:**
  - el registro se busca y se bloquea con el alcance (`branch: 'scope'`), y con "Todas mis sucursales" se cambia el de cualquier sucursal del usuario;
  - un registro fuera del alcance responde 404, y una sucursal ajena en `X-Branch-Id`, 403;
  - `uploadRecordReceipt(resource, id, file, branchId)` manda el alcance de la pantalla.
- **Estilos:** cada módulo carga su CSS al abrirse, así que `ReceiptUploadButton` recibe las clases de botón del módulo (`exp-btn` o `pur-btn`). La confirmación usa `ConfirmDialog`.
- **Tests:**
  - los del backend simulan la base;
  - las migraciones se prueban revisando su SQL (`migrationFiles.test.js`), y contra MySQL al aplicarlas a los tenants locales;
  - los del frontend se adaptaron al `can()` de saas y a `BranchContext`.

## Notas para portar a smallpos-saas

- **Depende de los módulos de gastos y compras:** saas todavía no tiene [`feat-modulo-de-gastos.md`](feat-modulo-de-gastos.md) ni [`feat-modulo-de-compras.md`](feat-modulo-de-compras.md). Si se portan después de esta feat, las columnas `receipt_uploaded_by` y `receipt_uploaded_at` pueden nacer en las tablas `expenses` y `purchases`, sin las migraciones 016 y 017.
- **Esquema por tenant:** si las tablas ya existen en algún tenant, las columnas se agregan en cada uno con su propio paso (`scripts/migrate-*`).
- **Rutas con `createSecureRouter`:** `PUT /:id/receipt` con los dos permisos (`expenses.read` y `expenses.create`, o los de compras) y `branch: 'scope'`. Hay que revisar cómo se piden dos permisos a la vez; aquí se encadenan dos `requirePermission`.
- **Comprobantes por tenant:** el archivo anterior se borra de la carpeta del tenant del request.
- **Varias sucursales por usuario (Spec 12 de saas):** el registro se busca con `branchIds`, como el detalle.
- **Permisos de los roles:** en la copia de producción de smallposv2, el rol "Cajero" tiene además `expenses.read`, `expenses.cancel` y `expenses.categories`, que se le dieron desde Permisos; con eso también puede cambiar el comprobante de un gasto. Es un ajuste de datos, no del código.
