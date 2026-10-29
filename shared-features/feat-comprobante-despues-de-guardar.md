# feat: Comprobante después de guardar

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Borrador** | feat | smallposv2 | smallpos-saas | Commit de las specs 14 y 15 (un solo commit) | 2026-10-28 |

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

_Pendiente. Se llenan después de implementar._

## Notas para portar a smallpos-saas

- **Depende de los módulos de gastos y compras:** saas todavía no tiene [`feat-modulo-de-gastos.md`](feat-modulo-de-gastos.md) ni [`feat-modulo-de-compras.md`](feat-modulo-de-compras.md). Si se portan después de esta feat, las columnas `receipt_uploaded_by` y `receipt_uploaded_at` pueden nacer en las tablas `expenses` y `purchases`, sin las migraciones 016 y 017.
- **Esquema por tenant:** si las tablas ya existen en algún tenant, las columnas se agregan en cada uno con su propio paso (`scripts/migrate-*`).
- **Rutas con `createSecureRouter`:** `PUT /:id/receipt` con los dos permisos (`expenses.read` y `expenses.create`, o los de compras) y `branch: 'scope'`. Hay que revisar cómo se piden dos permisos a la vez; aquí se encadenan dos `requirePermission`.
- **Comprobantes por tenant:** el archivo anterior se borra de la carpeta del tenant del request.
- **Varias sucursales por usuario (Spec 12 de saas):** el registro se busca con `branchIds`, como el detalle.
- **Permisos de los roles:** en la copia de producción de smallposv2, el rol "Cajero" tiene además `expenses.read`, `expenses.cancel` y `expenses.categories`, que se le dieron desde Permisos; con eso también puede cambiar el comprobante de un gasto. Es un ajuste de datos, no del código.
