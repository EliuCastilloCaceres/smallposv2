# 15 — Comprobante después de guardar

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Terminada** | 2026-10-28 | 2026-10-29 |

## Objetivo

Hoy el comprobante de un gasto ([spec 12](12-modulo-de-gastos.md)) o de una compra ([spec 14](14-modulo-de-compras.md)) solo se adjunta al registrarlo. Si la factura llega después, o si se subió la foto equivocada, no hay forma de agregarlo ni de corregirlo: habría que cancelar y volver a capturar, y en una compra eso revierte el inventario. Las dos specs lo dejaron fuera de su alcance.

Esta spec permite **agregar o reemplazar el comprobante desde el detalle**, en Gastos y en Compras, y guarda quién lo subió y cuándo. Es para supervisores, administradores y almacenistas.

**Datos de producción** (copia `marksexpressv2`, 2026-10-28): 5 gastos, 3 con comprobante, y 4 compras, 1 con comprobante. Todos los registró el usuario 1.

**Base que ya existe:**
- **Tablas:** `expenses` y `purchases` guardan un solo comprobante: `receipt_file` (el nombre generado en disco) y `receipt_name` (el nombre original). No guardan quién lo subió ni cuándo; hoy siempre es quien registró, al registrar.
- **Subida:**
  - `middlewares/uploadReceipt.js` (`createReceiptUpload`) valida el formato y el tamaño (jpg, png, webp o pdf, hasta 5 MB) y el contenido real del archivo;
  - `uploadExpenseReceipt.js` y `uploadPurchaseReceipt.js` eligen la carpeta de cada módulo;
  - `removeFile` (`uploadImage.js`) borra un archivo del disco.
- **Pantalla:**
  - el detalle (`ExpenseDetailModal.jsx` y `PurchaseDetailModal.jsx`) muestra "Ver comprobante" y "Descargar", o "Sin comprobante";
  - el formulario valida el archivo antes de mandarlo con `receiptError` (`Expenses/expenseForm.js`);
  - la lista muestra un clip si el registro tiene comprobante.
- **Nginx de producción:** ya acepta 6 MB por petición en `/api/` (spec 12).

## Historias de usuario

- Como **supervisor**, quiero adjuntar la factura de un gasto o de una compra cuando me llega después de registrarlo, para tener el respaldo sin cancelar y volver a capturar.
- Como **almacenista**, quiero reemplazar el comprobante de una compra si subí la foto equivocada, para que el respaldo sea el correcto.
- Como **administrador**, quiero saber quién subió cada comprobante y cuándo, para revisar los cambios.

## Alcance

**Incluye**
- Agregar el comprobante a un gasto o a una compra activos que no tienen, y reemplazarlo si ya tienen, desde su detalle.
- Quién subió el comprobante y cuándo, en gastos y en compras, también al registrar.
- Una migración por tabla con las columnas nuevas, que llena los comprobantes que ya existen.
- Tests de todo lo anterior.
- **Documentación en `shared-features/`:** sí, como `feat-comprobante-despues-de-guardar.md` (decisión 7 del usuario, 2026-10-28).

**No incluye**
- Varios comprobantes por gasto o por compra (decisión 3): una factura de varias hojas va en un PDF.
- Quitar el comprobante sin poner otro (decisión 2).
- Conservar los comprobantes reemplazados o su historial: el anterior se borra, y solo queda quién subió el actual y cuándo.
- Gastos y compras cancelados (decisión 5).
- Agregar el comprobante desde el POS: el cajero no ve las listas (decisión 4), así que lo agrega después el supervisor.
- Cambiar otro dato del gasto o de la compra: siguen sin editarse; se cancelan y se vuelven a capturar (decisión #34 del borrador).
- Ingresos, retiros y los demás movimientos de caja: no tienen comprobante.

## Requisitos

### Quién subió el comprobante
1. `expenses` y `purchases` guardan quién subió el comprobante (`receipt_uploaded_by`, un usuario) y cuándo (`receipt_uploaded_at`). Sin comprobante, los dos quedan vacíos.
2. Al registrar un gasto o una compra con comprobante, son quien registró y la hora del registro.
3. Los comprobantes que ya existen toman quién registró el gasto o la compra y cuándo (`created_by` y `created_at`), con la migración del requisito 11 (decisión 6).

### Agregar o reemplazar
4. **Endpoints**, con el alcance por sucursal de hoy:

    | Endpoint | Permiso | Qué hace |
    |---|---|---|
    | `PUT /api/expenses/:id/receipt` | `expenses.read` y `expenses.create` | Agrega o reemplaza el comprobante del gasto (multipart, campo `receipt`) |
    | `PUT /api/purchases/:id/receipt` | `purchases.read` y `purchases.create` | Agrega o reemplaza el comprobante de la compra (multipart, campo `receipt`) |

    Con los permisos de las specs 12 y 14 (decisión 4): superadmin, admin y supervisor pueden en los dos módulos; el almacenista, solo en Compras; el cajero, en ninguno, porque no tiene `read`.
5. **El archivo** sigue las reglas de hoy (spec 12, requisito 10, y spec 14, requisito 13): foto o PDF (jpg, png, webp o pdf) de hasta 5 MB, con el contenido real validado, guardado con un nombre generado en la carpeta de su módulo.
6. **Validaciones:**
    - sin archivo: 400 *"Elige el comprobante."*;
    - formato o tamaño inválidos: los mensajes de hoy;
    - un gasto o una compra cancelados: 400 *"No se puede cambiar el comprobante de un gasto cancelado."* o *"…de una compra cancelada."*;
    - un registro que no existe o es de otra sucursal: 404, como el detalle.

    Si no se guarda, el archivo recién subido se borra.
7. **Al guardar:**
    - el gasto o la compra queda con el comprobante nuevo, quién lo subió y la hora;
    - si ya tenía uno, su archivo se borra del disco después de guardar (decisión 2);
    - la fila se bloquea (`FOR UPDATE`), para que dos subidas al mismo tiempo no dejen un archivo sin registro;
    - responde el detalle actualizado.
8. **Detalle:** `GET /api/expenses/:id` y `GET /api/purchases/:id` devuelven también el nombre de quién subió el comprobante y cuándo.

### Pantalla
9. En el detalle de un gasto o de una compra, la sección **Comprobante**:
    - con comprobante, muestra "Ver comprobante" y "Descargar" como hoy, y debajo *"Subido por Nombre · fecha y hora"*;
    - en un registro activo y con el permiso `create` del módulo, tiene el botón **"Agregar comprobante"** si no tiene, o **"Reemplazar"** si ya tiene. Abre el selector de archivos; en un teléfono, el comprobante se puede tomar con la cámara;
    - el archivo se valida antes de subirlo, con los mensajes del formulario (`receiptError`);
    - **reemplazar** pide confirmación: *"¿Reemplazar el comprobante? El anterior se borra y no se puede recuperar."*;
    - mientras sube, el botón se desactiva. Al guardar se ve *"Comprobante guardado."*, el detalle se actualiza y la lista se vuelve a leer, para que aparezca el clip.
10. Se ve y se usa bien en móvil (390 px).

### Migraciones
11. Una migración por tabla, cada una con un cambio acotado (`docs/migraciones.md`): agrega `receipt_uploaded_by` (con su llave foránea a `users`) y `receipt_uploaded_at`, y llena los comprobantes que ya existen con `created_by` y `created_at` (requisito 3).
    1. `expenses`;
    2. `purchases`.

### Documentación
12. `shared-features/feat-comprobante-despues-de-guardar.md` documenta la spec con la estructura de `sf-index.md` y se agrega al índice.

## Tareas

- [x] **T1. Migraciones** (requisitos 1, 3 y 11).
  — tests: cada migración agrega las dos columnas con su llave foránea, llena los registros que ya tienen comprobante con quién los registró y cuándo, y deja vacíos los que no tienen.
- [x] **T2. API** (requisitos 2 y 4–8).
  — tests, en gastos y en compras:
  - registrar con comprobante guarda quién lo subió y cuándo; sin comprobante, quedan vacíos;
  - agregar un comprobante a un registro que no tiene, y descargarlo;
  - reemplazarlo borra el archivo anterior del disco;
  - las validaciones: sin archivo, formato, tamaño, registro cancelado y otra sucursal (404); si falla, el archivo nuevo se borra;
  - 403 sin `read` o sin `create` (el cajero, y el almacenista en Gastos);
  - el detalle devuelve quién subió el comprobante y cuándo.
- [x] **T3. Pantalla** (requisitos 9 y 10).
  — tests, con la API simulada, en los dos detalles: los botones según el permiso, el estado y si ya hay comprobante; agregar; reemplazar con confirmación; la validación antes de subir; el mensaje, la recarga de la lista y "Subido por".
- [x] **T4. Documentación** (requisito 12).
  — tests: no lleva tests de código.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | Un supervisor agrega un comprobante a un gasto sin comprobante desde su detalle: la lista muestra el clip, y el detalle, quién lo subió y cuándo. | 2026-10-28, copia de producción (`marksexpressv2`) con un supervisor temporal de una sucursal temporal:<br>- **API:** a un gasto sin comprobante le agregó un PNG (200); el detalle dijo "QA sup" con la hora, la lista lo trajo con comprobante, el archivo quedó en `storage/expense-receipts` y se descargó como `image/png`. Un gasto registrado con comprobante quedó con quien lo registró y la misma hora del registro.<br>- **Pantalla** (Edge sin ventana, 1366 y 390 px): "Agregar comprobante" → "Comprobante guardado." y "Subido por QA sup · 28 oct 2026, 02:35 p.m."; al cerrar el detalle, la fila de la lista ya tenía el clip.<br>Tests `expense-receipt`, `ExpenseDetailModal.test`, `ReceiptUploadButton.test` y `Expenses.test`. |
| 2 | Un almacenista agrega el comprobante a una compra sin comprobante y después lo reemplaza: el detalle muestra el nuevo, con él como quien lo subió, y el archivo anterior ya no está en el disco. | 2026-10-28, copia de producción con un almacenista temporal y un producto temporal:<br>- **API:** agregó un PNG a una compra sin comprobante ("QA alm") y lo reemplazó con un PDF: el detalle mostró "factura QA.pdf" subido por "QA alm", el PNG ya no estaba en `storage/purchase-receipts`, el PDF sí, y se descargó como `application/pdf`. En gastos, el reemplazo de un administrador también borró el archivo anterior.<br>- **Pantalla** (1366 y 390 px): "Reemplazar" pidió la confirmación "¿Reemplazar el comprobante? El anterior se borra y no se puede recuperar." y, al confirmar, mostró "Comprobante guardado." con el clip en la lista.<br>Tests `purchase-receipt`, `PurchaseDetailModal.test`, `ReceiptUploadButton.test` y `Purchases.test`. |
| 3 | No se puede cambiar el comprobante de un gasto o de una compra cancelados ni de otra sucursal; el cajero recibe 403 en los dos módulos y el almacenista en Gastos. | 2026-10-28, copia de producción:<br>- un gasto y una compra cancelados respondieron 400 con sus mensajes, sin dejar el archivo en el disco;<br>- un gasto y una compra de otra sucursal temporal respondieron 404 al supervisor y al almacenista, y el admin central sí cambió el de la compra;<br>- el almacenista recibió 403 en Gastos;<br>- sin archivo, 400 "Elige el comprobante."; con un `.txt`, 400 y el comprobante no cambió.<br>**Hallazgo:** el rol "Cajero" de la copia tiene además `expenses.read`, `expenses.cancel` y `expenses.categories`, que se le dieron desde Permisos después de la spec 12, así que puede cambiar el comprobante de un gasto (200), como dice el requisito 4. Con un rol temporal con los permisos por defecto del cajero (`expenses.create` y `purchases.create`), recibió 403 en los dos módulos. En Compras, el "Cajero" de la copia sí recibió 403.<br>Tests `expense-receipt` y `purchase-receipt`. |
| 4 | En la copia de producción, después de migrar, los 3 gastos y la compra con comprobante tienen como quien lo subió a quien los registró, con la hora del registro; los demás quedan vacíos y ningún otro dato cambia. | 2026-10-28: nodemon aplicó la `016` y la `017` en la copia de producción a las 20:23:14 y 20:23:15 (hora del servidor). Antes se guardó una foto de los 5 gastos y las 4 compras:<br>- los gastos 1, 3 y 4 y la compra 12 quedaron con el usuario 1 y su `created_at`;<br>- los gastos 2 y 5 y las compras 11, 13 y 14 quedaron vacíos;<br>- las demás columnas son idénticas a la foto, también al terminar la QA, y sus 4 archivos siguen en el disco.<br>Tests `016-add-expenses-receipt-uploader` y `017-add-purchases-receipt-uploader`. |
| 5 | Agregar y reemplazar se ven y se usan bien a 390 px y a 1366 px. | 2026-10-28, capturas de Gastos (supervisor) y de Compras (almacenista) a 1366 y 390 px: el detalle sin comprobante con "Agregar comprobante", el comprobante agregado con "Subido por", la confirmación del reemplazo, el comprobante reemplazado y la lista con el clip. A 390 px, "Reemplazar" pasa a la segunda fila de botones y la confirmación se abre abajo, como las demás ventanas en móvil. |
| 6 | `shared-features/feat-comprobante-despues-de-guardar.md` existe y está en el índice. | `shared-features/feat-comprobante-despues-de-guardar.md`, en la tabla de `sf-index.md`. |
| 7 | Los tests del backend y del frontend pasan. | 2026-10-28: backend 439/439 (50 archivos), frontend 314/314 (41 archivos). El frontend compila con `vite build`. |

## Dudas abiertas

- _Ninguna._

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-28 | Antes de redactar se resolvieron 7 dudas:<br>1. Esta spec es la 15, después de cerrar la 14; el reporte de compras por proveedor pasa a la 16. El cambio de alcance se anota en el historial de las specs 12 y 14.<br>2. El comprobante se agrega si no hay y se reemplaza si ya hay; el anterior se borra, y no se puede quitar sin poner otro.<br>3. Un solo comprobante por gasto o compra, como hoy.<br>4. Lo pueden agregar quienes tienen `read` y `create` del módulo, desde el detalle; el cajero no.<br>5. Solo en gastos y compras activos.<br>6. Se guarda quién subió el comprobante y cuándo; los que ya existen toman a quien registró el gasto o la compra.<br>7. Se documenta en `shared-features/`. | Usuario |
| 2026-10-28 | Creación de la spec, en **Borrador**. | — |
| 2026-10-28 | Se aprueba la spec, con las decisiones que se agregaron al redactarla (confirmación al reemplazar, mensajes, "Subido por" en todos los comprobantes, recarga de la lista y una migración por tabla): pasa a **Lista**. | Usuario |
| 2026-10-28 | T1 terminada: migraciones `016-add-expenses-receipt-uploader.sql` y `017-add-purchases-receipt-uploader.sql`, con sus tests. Los tests parten de una base migrada hasta la anterior, con datos de la forma vieja, y aplican el resto. Antes de escribirlas se guardó una foto de los gastos y las compras de la copia de producción; nodemon las aplicó a las 20:23 (hora del servidor) en cuanto se crearon los tests. | — |
| 2026-10-28 | T2 terminada: `PUT /api/expenses/:id/receipt` y `PUT /api/purchases/:id/receipt` (`replaceReceipt` en los services y en los controllers), y quién subió el comprobante al registrar y en el detalle. El controller borra el archivo anterior después de guardar, o el nuevo si no se guardó. | — |
| 2026-10-28 | T3 terminada: `Expenses/ReceiptUploadButton.jsx` (selector de archivos, validación con `receiptError` y confirmación con `ConfirmDialog`), usado por `ExpenseDetailModal` y `PurchaseDetailModal` con las props `canAttach` y `onReceiptSaved`; `uploadRecordReceipt` en `expenseForm.js`. | — |
| 2026-10-28 | T4 terminada: `shared-features/feat-comprobante-despues-de-guardar.md` y su fila en `sf-index.md`. | — |
| 2026-10-28 | Verificación en la copia de producción con usuarios temporales (`claude_qa15_admin`, `claude_qa15_sup`, `claude_qa15_alm`, `claude_qa15_caj` y `claude_qa15_caj2`), el rol `qa_cajero_spec15`, las sucursales "Sucursal QA spec 15" y "Sucursal QA spec 15 B", el proveedor "Proveedor QA spec 15" y un producto temporal: 27 revisiones por la API, más 4 con un rol temporal, y 12 en pantalla. En la primera corrida fallaron 2: el cajero cambió el comprobante de un gasto, y por eso la revisión del formato inválido comparaba con un archivo que ya no estaba, con capturas a 1366 y 390 px. **Hallazgo:** el rol "Cajero" de la copia tiene `expenses.read`, `expenses.cancel` y `expenses.categories` (criterio 3). Al terminar se borraron los 6 gastos y las 5 compras de QA con sus líneas, los movimientos y el stock del producto, el producto, los usuarios con sus refresh tokens, el rol, las sucursales, el proveedor y los 8 comprobantes. Los 5 gastos, las 4 compras y los 4 comprobantes reales no cambiaron. Se llena la evidencia de los 7 criterios de aceptación. Queda en **Lista** hasta que el usuario apruebe pasarla a Terminada. | — |
| 2026-10-29 | Se aprueba el cierre: pasa a **Terminada**. | Usuario |
