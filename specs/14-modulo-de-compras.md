# 14 — Módulo de compras

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Terminada** | 2026-10-28 | 2026-10-28 |

## Objetivo

Es la primera parte del **paso 6** del orden de [`docs/reportes-borrador.md`](../docs/reportes-borrador.md) (§6), con las decisiones #5–#8b y #33–#38 de §3.2. El paso 6 se divide en dos specs (decisión 1 de esta spec):
- **esta spec (14):** el módulo para registrar compras, su entrada al inventario y el costo promedio ponderado del producto;
- **la spec 16:** la pestaña de reporte de compras por proveedor y "con quién gasto más", con el permiso `reports.purchases`.

Hoy las entradas de mercancía no guardan costo ni proveedor: "Compra a proveedor" es solo un motivo del ajuste de inventario, y el costo del producto se captura a mano en Productos. Además, el cajero paga al repartidor desde su caja y lo registra como un gasto "Pago a proveedor (mercancía)", sin los productos que recibió. Es para supervisores, almacenistas, administradores y cajeros.

**Datos de producción** (dump del 2026-10-21; al redactar no se pudo consultar la copia de producción, porque Docker estaba apagado):
- **Entradas con el motivo "Compra a proveedor":** 1,132, desde agosto, de 558 productos, todas de la sucursal 1.
  - 675 son `purchase` (ajuste individual y producto agotado del POS) y 457 son `entry` (ajuste masivo, que siempre graba `entry` o `exit`).
  - Todas tienen `reference_type = 'adjustment'`, sin costo ni proveedor.
- **Pagos de mercancía desde caja:** unas 271 de las 343 salidas de caja históricas eran pagos a proveedores hechos por el cajero desde el POS (spec 12). Desde la spec 12 se registran como gasto con la categoría "Pago a proveedor (mercancía)".

**Base que ya existe:**
- **Inventario:** `stockService.applyStockMovement` bloquea la fila de stock, valida que no quede negativo (`InsufficientStockError`, 409) y escribe el movimiento en `inventory_movements` con `reference_id` y `reference_type`. "Compra a proveedor" está en cinco lugares: `AdjustDrawer.jsx`, `BulkAdjustModal.jsx`, `Pos/modals/OutOfStockModal.jsx`, `inventoryService.ADJUSTMENT_REASONS` y `stockService.manualAdjustment`, que convierte ese motivo en `purchase`.
- **Costo:** un solo `products.purchase_price` por producto (`decimal(12,2)`); las variantes usan el del producto. Las ventas congelan el costo en `order_details.purchase_price` y los apartados en `layaway_details.purchase_price` (spec 03). Los costos estimados de la spec 11 no están marcados.
- **Gastos (spec 12):**
  - el comprobante privado (`middlewares/uploadExpenseReceipt.js`);
  - la caja abierta con bloqueo (`expenseService.lockOpenSession`);
  - la salida de caja ligada y el reingreso al cancelar;
  - las listas de tipos de caja en `helpers/cashMovements.js`;
  - el endpoint de opciones con `requireAnyPermission`;
  - el gasto desde el POS en `Pos/modals/CashMovementsModal.jsx`.
- **Proveedores:** el genérico es el id 1 ("Proveedor generico"). Al desactivar un proveedor, sus productos pasan al genérico.
- **Búsqueda de productos:** `BulkAdjustModal.jsx` busca en `GET /inventory/stock`, que pide `inventory.read` y no trae el costo, y con Enter resuelve el SKU exacto, que es como funciona el lector de códigos de barras.

## Historias de usuario

- Como **almacenista**, quiero registrar cada compra con su proveedor y los productos, cantidades y costos que recibí, para que el inventario suba y el costo del producto se actualice solo.
- Como **cajero**, quiero registrar desde el POS la compra que le pago al repartidor con el efectivo de mi caja, para que el inventario, el costo y el corte queden bien sin capturar dos veces.
- Como **supervisor**, quiero que el costo del producto sea el promedio ponderado de lo que tengo y de lo que compro, para que la utilidad y la valuación usen un costo real.
- Como **supervisor**, quiero cancelar una compra mal capturada con su motivo, para que el inventario se revierta sin borrar el registro.
- Como **administrador**, quiero que las compras solo se registren en Compras, para que toda entrada de mercancía tenga proveedor y costo.

## Alcance

**Incluye**
- Compras: tablas de compras y de sus líneas, API, módulo **Compras** en el menú (lista, filtros, registro, detalle y cancelación) y comprobante adjunto.
- La entrada al inventario de cada línea y el **costo promedio ponderado global** del producto.
- **Pagado desde caja:** la compra genera su salida de caja, desde el módulo o desde el POS.
- **Compra desde el POS** para el cajero.
- Tipos de movimiento nuevos: `purchase` y `purchase_refund` en caja, y `purchase_cancelled` en inventario.
- Quitar el motivo "Compra a proveedor" de Inventario y del POS.
- Desactivar la categoría de gasto "Pago a proveedor (mercancía)".
- Permisos `purchases.read`, `purchases.create` y `purchases.cancel`.
- Tests de todo lo anterior.
- **Documentación en `shared-features/`:** sí, como `feat-modulo-de-compras.md` (decisión 12 del usuario, 2026-10-28).

**No incluye**
- La pestaña de reporte de compras por proveedor, "con quién gasto más" y el permiso `reports.purchases`: van en la spec 16. Ahí los gastos "Pago a proveedor (mercancía)" no se suman, para no contar doble (decisión 3).
- Cuentas por pagar (decisión #7): toda compra se considera pagada al registrarla.
- Editar una compra: se cancela y se vuelve a capturar (decisión #34). El comprobante solo se adjunta al registrar; agregarlo o reemplazarlo después lo cubre la [spec 15](15-comprobante-despues-de-guardar.md).
- Cambiar el proveedor del producto (`products.provider_id`) o su precio de venta al comprar (decisión 5).
- IVA desglosado y descuentos globales de la factura (decisión 4).
- Importar las líneas desde un CSV (decisión 10).
- Convertir en compras las entradas históricas "Compra a proveedor" o los gastos "Pago a proveedor (mercancía)" (decisiones 3 y 9).
- Recalcular el costo al cancelar una compra (decisión #34) o el costo de las ventas ya hechas.
- Costo propio por variante.
- Bloquear la edición manual del costo en Productos: sigue como hoy.
- Exportación (decisión #30).
- Portar el módulo a smallpos-saas: aquí solo se documenta.

## Requisitos

### Compra
1. Cada compra guarda (decisión #37):
   - **proveedor**, obligatorio y activo; puede ser el genérico;
   - **fecha** de la compra (requisito 5);
   - **sucursal** y **método de pago**;
   - **folio** de factura o ticket, opcional, hasta 50 caracteres;
   - **comprobante**, opcional (requisito 11);
   - **notas**, opcionales, hasta 255 caracteres;
   - **total**: la suma de los subtotales de sus líneas (decisión 4);
   - quién la registró y cuándo.
2. Cada **línea** guarda:
   - **producto**, activo. Si el producto es variable, lleva una **variante** activa suya, obligatoria; un producto no variable no lleva variante (decisión 6);
   - **cantidad**, mayor a 0, con hasta 3 decimales, como el inventario;
   - **costo unitario**, mayor a 0, con centavos. Es lo que de verdad se pagó por unidad, con IVA incluido (decisión 4);
   - **subtotal**: cantidad × costo unitario, redondeado al centavo;
   - el **costo del producto antes y después** de la compra (requisito 10), para el detalle.
3. Una compra tiene de 1 a 200 líneas y no repite la misma combinación de producto y variante.
4. **Método de pago:** los métodos activos, excepto Crédito (decisión #38).
5. **Fecha** (decisión 7): por defecto hoy, en hora de México. Puede ser una fecha pasada, pero nunca futura. Una compra pagada desde caja siempre es de hoy. La entrada al inventario y el costo nuevo se aplican al registrar la compra, aunque su fecha sea pasada.
6. **Sucursal:** un usuario con sucursal asignada registra y ve solo las compras de la suya; el backend la fuerza. El administrador central elige la sucursal al registrar y ve todas.
7. **Validaciones:** el proveedor, el método de pago, la sucursal, los productos y las variantes deben estar activos. Un dato inválido responde 400 con un mensaje en español; si es de una línea, el mensaje dice cuál (por ejemplo, *"Línea 3: la variante no existe o está inactiva"*).

### Inventario
8. Al registrar la compra, en la misma transacción, cada línea genera su **entrada** en la sucursal de la compra con `stockService.applyStockMovement`:
   - `operation_type = 'purchase'`, `reference_type = 'purchase'` y `reference_id` = la compra;
   - el motivo es "Compra #id – proveedor".

### Costo promedio ponderado
9. Al registrar la compra, el costo (`products.purchase_price`) de cada producto de la compra se recalcula **una sola vez, con todas sus líneas** (decisiones #6 y 6):

   `costo nuevo = (E × C + Σ cantidad × costo unitario) / (E + Σ cantidad)`

   - **E:** la existencia total del producto **antes** de las entradas de esta compra: la suma de `inventory_stock` de todas las sucursales y de todas sus variantes. Lo apartado no entra, porque ya salió del stock y su costo quedó congelado al apartar (spec 03).
   - **C:** el costo actual del producto.
   - Si **E ≤ 0** o **C = 0**, el costo nuevo es el promedio de las líneas: `Σ cantidad × costo unitario / Σ cantidad`. Así, un producto sin costo toma el de su compra.
   - Se redondea al centavo.
   - Ejemplos:
     - Hay 10 pza a $8.00 entre dos sucursales y se compran 20 a $9.50: (10 × 8 + 20 × 9.50) / 30 = **$9.00**.
     - Una playera tiene 4 pza en la variante CH y 6 en la M, a $50.00, y se compran 10 CH a $56.00: (10 × 50 + 10 × 56) / 20 = **$53.00**.
10. Cada línea guarda el costo del producto antes y después de la compra. Las líneas de un mismo producto guardan los mismos dos valores.
11. El cálculo bloquea la fila del producto (`FOR UPDATE`), para que dos compras del mismo producto no se crucen.
12. Las ventas ya hechas conservan su costo; las ventas nuevas toman el costo nuevo, porque el servidor lo lee de `products` al vender (spec 03).

### Comprobante
13. Igual que en gastos (spec 12, requisito 10):
    - es una foto o un PDF (jpg, png, webp o pdf), de hasta 5 MB;
    - se guarda fuera de la carpeta pública, con un nombre generado, en su propia carpeta (`backend/storage/purchase-receipts`);
    - se descarga con `GET /api/purchases/:id/receipt`, que pide `purchases.read` y respeta el alcance por sucursal;
    - en producción, la carpeta es un volumen de `docker-compose.prod.yml`.

### Pagado desde caja
14. Una compra con método **Efectivo** se puede marcar como **"Pagado desde caja"** (decisión #8b):
    - se elige una caja con sesión abierta de la sucursal de la compra (desde el POS, es la caja del POS);
    - al registrarla, en la misma transacción se crea su salida en `cash_movements`, de tipo `purchase`, por el total, ligada a la compra. La descripción es "Compra #id: proveedor", recortada a 100 caracteres;
    - la salida resta del efectivo esperado.
15. Una compra que no se paga desde caja no crea ningún movimiento de caja.

### Cancelación
16. Una compra **no se edita**: se cancela con motivo y se vuelve a capturar (decisión #34).
    - Cancelar pide `purchases.cancel` y un **motivo** obligatorio, de hasta 255 caracteres.
    - Se guarda quién la canceló, cuándo y el motivo; la compra queda en la lista como cancelada.
    - Una compra cancelada no se puede volver a cancelar.
17. **Reversión del inventario** (decisión 8): en la misma transacción, cada línea genera una **salida** en la sucursal de la compra, con `operation_type = 'purchase_cancelled'`, `reference_type = 'purchase'` y el motivo "Cancelación de la compra #id".
    - Es todo o nada: si alguna línea no tiene stock suficiente, no se cancela nada y responde 409 con el mensaje *"No hay stock suficiente de «producto» para revertir la compra."*
18. **El costo no se recalcula** al cancelar (decisión #34): el producto se queda con el costo que tenga. El detalle de una compra cancelada lo avisa: *"El costo de los productos no se revirtió. Si quedó mal, corrígelo en Productos."*
19. **Reingreso** de una compra pagada desde caja, igual que en gastos (spec 12, requisito 14):
    - si su sesión de caja **sigue abierta**, la cancelación crea en esa sesión un movimiento `purchase_refund` ("Reingreso de la compra #id") por el total, que suma al efectivo esperado;
    - si la sesión **ya se cerró**, se cancela sin reingreso. La pantalla avisa: *"La sesión de caja ya se cerró, así que no se registró el reingreso. Si el dinero regresó, regístralo como Ingreso manual en la caja abierta."*

### Movimientos de caja y de inventario
20. **Tipos nuevos** en `cash_movements`, que se agregan a `helpers/cashMovements.js`:

    | Tipo | Qué es | Etiqueta | Efectivo esperado |
    |---|---|---|---|
    | `purchase` | Compra pagada desde caja, ligada a su compra | Compra | Resta |
    | `purchase_refund` | Reingreso de una compra cancelada | Reingreso de compra | Suma |

    `POST /api/cash-registers/:registerId/movements` sigue aceptando solo `income` y `withdrawal`.
21. **Etiquetas de caja:** el POS (`CashMovementsModal.jsx`), el reporte impreso del corte (`printCorteReport.js`) y el detalle de Sesiones de caja (`CashSessionDetailModal.jsx`) muestran las del requisito 20.
22. **Inventario:** en Movimientos, `purchase` conserva la etiqueta "Compra", también para los movimientos históricos, y `purchase_cancelled` se muestra como **"Compra cancelada"**, como salida. El filtro por tipo incluye los dos.

### Motivo "Compra a proveedor"
23. Se quita de los tres formularios que lo ofrecen (decisiones #35 y 9): el ajuste individual (`AdjustDrawer.jsx`), el ajuste masivo (`BulkAdjustModal.jsx`) y el producto agotado del POS (`OutOfStockModal.jsx`).
24. El backend rechaza ese motivo en el ajuste individual y en el masivo con 400: *"Las compras se registran en el módulo Compras."* `stockService.manualAdjustment` ya no lo convierte en `purchase`; los demás motivos no cambian.
25. Los movimientos históricos no cambian.

### Categoría "Pago a proveedor (mercancía)"
26. Una migración desactiva la categoría de gasto **"Pago a proveedor (mercancía)"** (decisión 3), porque desde esta spec los pagos de mercancía se registran como compras:
    - ya no aparece al registrar un gasto, ni en el módulo ni en el POS;
    - los gastos que ya la tienen la conservan, y Gastos y los reportes de la spec 13 los siguen mostrando igual (no cuentan en la utilidad neta).

### Compra desde el POS
27. En **Movimientos de caja** del POS se agrega una cuarta opción, **Compra**, que solo ve quien tiene `purchases.create`. Abre el formulario de compra (requisito 33) con estos datos fijos: la caja del POS, Efectivo, pagado desde caja, hoy y la sucursal del POS. Lleva:
    - proveedor y líneas;
    - folio, notas y comprobante opcionales; en un teléfono, el comprobante se puede tomar con la cámara.

    Al guardarla, aparece en la lista de movimientos de la sesión como "Compra", y el POS vuelve a leer el stock.
28. **Cajero** (decisión 2): tiene `purchases.create`, pero no `purchases.read`, así que no ve el menú Compras. El backend acepta una compra de un usuario sin `purchases.read` solo si es pagada desde caja, en efectivo y de una caja con sesión abierta de su sucursal.

### Módulo Compras
29. Entrada **Compras** en el menú, después de Gastos, con `purchases.read` (decisión #33).
30. **Filtros**, arriba, que se combinan entre sí:
    - periodo con los presets de Gastos y las fechas que cubre;
    - sucursal, solo para el administrador central;
    - proveedor y método de pago;
    - estado: **Activas** (por defecto), Canceladas o Todas;
    - búsqueda por folio, notas o producto (nombre o SKU de alguna de sus líneas).
31. **Lista**, paginada de 20 en 20 y ordenada por fecha de la compra (la más reciente primero, y luego por hora de registro). Columnas:
    - fecha, proveedor y folio;
    - número de líneas;
    - método de pago, con la marca "Desde caja";
    - total;
    - sucursal, solo para el administrador central en el consolidado;
    - un ícono si tiene comprobante.

    Una compra cancelada se ve tachada, con la etiqueta "Cancelada". En móvil, la lista se ve como tarjetas.
32. Arriba de la lista, el **total** y el número de compras **activas** del filtro.
33. **Registrar:** el botón "Nueva compra", con `purchases.create`, abre el formulario.
    - **Encabezado:** los datos de los requisitos 1 y 4–6. "Pagado desde caja" solo aparece con Efectivo, y entonces pide la caja abierta.
    - **Líneas** (decisión 10):
      - se agregan con un buscador por nombre o SKU;
      - Enter con un SKU exacto, como lo manda el lector de códigos de barras, agrega el producto o la variante. Con el SKU de un producto variable, muestra sus variantes para elegir;
      - si el producto o la variante ya está en la compra, suma 1 a su cantidad en lugar de agregar otra línea;
      - cada línea muestra la unidad de medida y el costo actual del producto, y su costo unitario empieza con ese costo si es mayor a 0;
      - se ve el subtotal de cada línea y el total de la compra, y una línea se puede quitar.
    - En móvil, las líneas se ven como tarjetas.
34. **Detalle:** al tocar una compra se abre con todos sus datos:
    - quién la registró y cuándo;
    - el comprobante, para verlo o descargarlo;
    - sus líneas, con cantidad, unidad, costo unitario, subtotal y el costo del producto antes y después ("$8.00 → $9.00");
    - su salida de caja, si se pagó desde caja;
    - si está cancelada: quién la canceló, cuándo, el motivo, si hubo reingreso y el aviso del requisito 18.

    Con `purchases.cancel`, una compra activa tiene el botón **"Cancelar compra"**, que pide el motivo y confirma. Si no hay stock suficiente, muestra el mensaje del requisito 17.

### Endpoints
35. Endpoints:

    | Endpoint | Permiso | Qué hace |
    |---|---|---|
    | `GET /api/purchases` | `purchases.read` | Lista con filtros, paginación y el total de las activas |
    | `GET /api/purchases/:id` | `purchases.read` | Detalle, con sus líneas |
    | `GET /api/purchases/:id/receipt` | `purchases.read` | Descarga del comprobante |
    | `GET /api/purchases/options` | `purchases.create` o `purchases.read` | Proveedores activos, métodos de pago sin Crédito y cajas abiertas de la sucursal; al administrador central, también las sucursales activas |
    | `GET /api/purchases/products` | `purchases.create` o `purchases.read` | Hasta 10 productos activos por nombre, SKU o SKU de variante, con sus variantes activas, la unidad, el costo actual y el stock en la sucursal. Así el formulario no depende de otros permisos. |
    | `POST /api/purchases` | `purchases.create` | Registra la compra (multipart: encabezado, líneas en el campo `items` como JSON y comprobante) |
    | `POST /api/purchases/:id/cancel` | `purchases.cancel` | Cancela con motivo |

    Todos respetan el alcance por sucursal.

### Permisos
36. Una migración crea `purchases.read` ("Ver compras"), `purchases.create` ("Registrar compras") y `purchases.cancel` ("Cancelar compras") y los asigna por nombre de rol (decisiones #33, 2 y 11):

    | Rol | read | create | cancel |
    |---|---|---|---|
    | superadmin y admin | ✓ | ✓ | ✓ |
    | supervisor | ✓ | ✓ | ✓ |
    | cajero | | ✓ | |
    | almacenista | ✓ | ✓ | |

    No se asignan a roles creados por el usuario.
37. La pantalla de permisos muestra el módulo `purchases` como **"Compras"**.

### Migraciones
38. Cada migración hace un cambio acotado (`docs/migraciones.md`):
    1. tablas de compras y de sus líneas;
    2. permisos (requisito 36), en una transacción;
    3. desactivar la categoría "Pago a proveedor (mercancía)" (requisito 26), en una transacción.

    Los tipos de movimiento nuevos no necesitan migración: `cash_movements.movement_type` y `inventory_movements.operation_type` son texto.

### Documentación
39. `shared-features/feat-modulo-de-compras.md` documenta la spec con la estructura de `sf-index.md` y se agrega al índice.

## Tareas

- [x] **T1. Tablas de compras** (requisitos 1–3 y 38.1).
  — tests: la migración crea las dos tablas con sus llaves foráneas.
- [x] **T2. Permisos y menú** (requisitos 29, 36, 37 y 38.2).
  — tests: la migración asigna cada permiso a los roles de la tabla y a ningún rol creado por el usuario; el menú muestra Compras solo con `purchases.read`; la etiqueta en Permisos.
- [x] **T3. Tipos de movimiento** (requisitos 20–22).
  — tests:
  - el efectivo esperado resta `purchase` y suma `purchase_refund` en el cierre, el estado de la sesión, Sesiones de caja (lista y detalle) y el Dashboard;
  - `POST /cash-registers/:id/movements` responde 400 con `purchase`;
  - las etiquetas del POS, del corte impreso, del detalle de Sesiones de caja y de Movimientos de inventario.
- [x] **T4. Motivo "Compra a proveedor" y categoría de gasto** (requisitos 23–26 y 38.3).
  — tests:
  - el ajuste individual y el masivo responden 400 con "Compra a proveedor", y "Devolución de cliente" sigue grabando `return`;
  - los tres formularios ya no ofrecen el motivo;
  - la migración desactiva solo esa categoría, y sus gastos no cambian.
- [x] **T5. API de compras: registro, inventario y costo** (requisitos 1–15 y 28).
  — tests:
  - registro con y sin comprobante, y las validaciones: proveedor, método de pago (Crédito), fecha futura, producto o variante inactivos, variante faltante o sobrante, cantidad, costo, líneas repetidas y más de 200 líneas;
  - cada línea crea su entrada ligada a la compra y sube el stock de la sucursal;
  - el costo promedio: los dos ejemplos del requisito 9, la existencia de varias sucursales, existencia 0, costo 0, el redondeo y el costo antes y después en las líneas;
  - pagado desde caja: crea su salida ligada, exige Efectivo, caja abierta de la sucursal y fecha de hoy;
  - un usuario sin `purchases.read` solo puede registrar compras pagadas desde caja;
  - alcance por sucursal en el registro;
  - respuestas 403 por permiso.
- [x] **T6. API de compras: lista, detalle, productos y cancelación** (requisitos 16–19 y 35).
  — tests:
  - lista con cada filtro, incluida la búsqueda por producto, paginación y el total de las activas;
  - detalle con sus líneas, comprobante y búsqueda de productos;
  - cancelación: motivo obligatorio, revierte el stock, el costo no cambia, 409 sin cancelar nada si falta stock en una línea, reingreso con la sesión abierta, sin reingreso con la sesión cerrada, y 400 al cancelar dos veces;
  - alcance por sucursal en la lista, el detalle, el comprobante y la cancelación;
  - respuestas 403 por permiso.
- [x] **T7. Módulo Compras** (requisitos 29–34).
  — tests, con la API simulada: filtros y sus parámetros, lista y estado cancelado, total de activas, formulario (buscador, SKU exacto, variantes, suma de cantidad al repetir, costo inicial, subtotales y total, Pagado desde caja solo con Efectivo y con la caja), detalle con el costo antes y después, y cancelación con motivo, incluidos los avisos sin reingreso y de stock insuficiente; botones según los permisos.
- [x] **T8. Compra desde el POS** (requisito 27).
  — tests, con la API simulada: la opción "Compra" solo con `purchases.create`, la compra se manda con la caja del POS, Efectivo y pagada desde caja, aparece en la lista de movimientos y el POS vuelve a leer el stock.
- [x] **T9. Volumen de comprobantes y documentación** (requisitos 13 y 39).
  — tests: no lleva tests de código.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | Un almacenista registra en Compras una compra con varias líneas, una de ellas de una variante, y con comprobante. El stock de la sucursal sube, el costo de cada producto queda en el promedio ponderado, y la compra aparece en la lista y en su detalle con el costo antes y después. | 2026-10-28, copia de producción (`marksexpressv2`) con un almacenista temporal y productos temporales:<br>- **API:** registró una compra de "Proveedor QA spec 14" con un PNG: 20 refrescos a $9.50 y 10 playeras CH a $56.00, por $750.00. El stock de la sucursal subió de 4 a 24 y de 4 a 14; el costo del refresco quedó en $9.00 y el de la playera en $53.00. Salió en la lista, el detalle mostró "8→9" y "50→53", y el comprobante se descargó como `image/png`.<br>- **Pantalla** (Edge sin ventana, 1366 px): un supervisor registró una compra escaneando `QA14-REF` y eligiendo la variante M desde el SKU del producto variable, con comprobante; salió en la lista y su detalle mostró el costo antes y después.<br>Tests `create-purchase`, `list-purchases`, `Purchases.test`, `PurchaseFormModal.test` y `PurchaseDetailModal.test`. |
| 2 | El costo promedio usa la existencia de todas las sucursales y variantes; con existencia 0 o costo 0, el producto toma el costo de la compra. | 2026-10-28, copia de producción: el refresco tenía 4 pza en la Sucursal Central y 6 en una sucursal temporal, a $8.00; con 20 comprados a $9.50 quedó en $9.00, el ejemplo del requisito 9. La playera (CH 4 y M 6, a $50.00) quedó en $53.00 con 10 CH a $56.00. Un producto con costo 0 tomó $7.50 y uno sin existencia, $12.34. Tests `create-purchase` ("weighted average cost"). |
| 3 | Un cajero registra desde el POS una compra pagada desde su caja: el stock sube, el efectivo esperado del corte la resta y no ve el menú Compras. | 2026-10-28, copia de producción con un cajero temporal y una caja temporal abierta con $500:<br>- **API:** una compra desde caja de $45.00 dejó el esperado en $455.00 y el stock subió de 24 a 29. Su lista y una compra por transferencia respondieron 403. Con otra compra de $18.00, el corte contó $482.00 y cuadró con diferencia $0.<br>- **POS** (390 px y 1366 px): Movimientos de efectivo muestra Ingreso, Retiro, Gasto y Compra; la compra escaneando `QA14-REF`, con comprobante, salió como "Compra #9: Proveedor QA spec 14" y el esperado bajó de $300.00 a $246.00. La cuadrícula del POS pasó de 54 a 55 pza después de otra compra, sin recargar.<br>- **Menú del cajero:** sin Compras.<br>Tests `create-purchase`, `CashMovementsModal.test` y `App.test`. |
| 4 | Un supervisor cancela una compra con motivo: el stock se revierte, el costo no cambia, y el reingreso se registra solo con la sesión abierta. Si a una línea le falta stock, no se cancela nada. | 2026-10-28, copia de producción:<br>- con la sesión abierta, cancelar la compra de $45.00 registró el reingreso y el esperado volvió a $500.00; el stock bajó de 29 a 24 y el costo se quedó en $9.00;<br>- después de sacar 2 de las 3 pza de un producto, cancelar su compra respondió 409 con "No hay stock suficiente de «QA Nuevo spec 14» para revertir la compra.", la compra siguió activa y la otra línea no se revirtió;<br>- después del corte, cancelar la compra de $18.00 respondió `refund: session_closed`.<br>Tests `cancel-purchase` y `PurchaseDetailModal.test`. |
| 5 | "Compra a proveedor" ya no aparece en Inventario ni en el POS, el backend lo rechaza, y los movimientos históricos no cambian. | 2026-10-28, copia de producción: el ajuste individual y el masivo con "Compra a proveedor" respondieron 400 con "Las compras se registran en el módulo Compras.", y las 1,132 entradas históricas con ese motivo siguen igual antes y después de la QA. Tests `adjustment-reasons`, `AdjustDrawer.test`, `BulkAdjustModal.test` y `OutOfStockModal.test`. |
| 6 | La categoría "Pago a proveedor (mercancía)" queda inactiva y no aparece al registrar un gasto; los gastos que la tienen se ven igual en Gastos y en los reportes. | 2026-10-28: la `015` se aplicó sola en la copia de producción a las 13:14:04 (hora del servidor). Contra la foto de antes, la categoría 7 quedó inactiva y sus 3 gastos (2 activos por $4,250.00 y 1 cancelado) no cambiaron. Ya no aparece en las opciones del gasto; el reporte de gastos de octubre sigue mostrando "Pago a proveedor (mercancía)" con 2 gastos por $4,250.00, y Gastos sigue listando los 4. Tests `015-deactivate-merchandise-expense-category`, `list-expenses` y `expense-categories`. |
| 7 | Los permisos por defecto son los del requisito 36, y un usuario de sucursal no ve, registra ni cancela compras de otra sucursal. | 2026-10-28, copia de producción después de la `014`:<br>- superadmin, admin y supervisor tienen read, create y cancel; almacenista, read y create; "Cajero", create;<br>- los roles creados por el usuario ("Supervisor_Ventas" y "Cajero N3") no tienen ninguno.<br>Con una sucursal temporal: el supervisor recibe 404 en el detalle y en la cancelación de una compra de esa sucursal, su lista no la trae aunque la pida, y su registro se guarda en la suya. El admin central la filtra. El almacenista recibe 403 al cancelar. Tests `014-add-purchases-permissions`, `list-purchases`, `create-purchase` y `cancel-purchase`. |
| 8 | El módulo Compras y la compra del POS se ven y se usan bien en móvil. | 2026-10-28, capturas a 390 px de la lista como tarjetas, el formulario con las líneas como tarjetas, las variantes del buscador, el detalle y la compra del POS. Las capturas encontraron que, con la cuarta opción (Compra), los botones de Movimientos de efectivo no cabían a 390 px y "Compra" se cortaba; se corrigió en `pos.css` (dos filas en pantallas de hasta 560 px) y se volvió a revisar a 390 y 1366 px. |
| 9 | `shared-features/feat-modulo-de-compras.md` existe y está en el índice. | `shared-features/feat-modulo-de-compras.md`, en la tabla de `sf-index.md`. |
| 10 | Los tests del backend y del frontend pasan. | 2026-10-28: backend 406/406 (46 archivos), frontend 291/291 (40 archivos). |

## Dudas abiertas

- _Ninguna._

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-28 | Antes de redactar se resolvieron 12 dudas:<br>1. El paso 6 del borrador se divide en dos specs: esta (el módulo) y la 15 (el reporte de compras y "con quién gasto más").<br>2. El cajero registra desde el POS compras pagadas desde su caja, con sus líneas, y no ve el menú Compras. Cambia la decisión #33 del borrador, que solo les daba compras al supervisor y al almacenista.<br>3. La categoría de gasto "Pago a proveedor (mercancía)" se desactiva. Los gastos que ya la tienen la conservan y no se suman en "con quién gasto más" (spec 15).<br>4. El costo unitario es lo que de verdad se pagó, con IVA; no hay descuento global, y el total es la suma de las líneas.<br>5. La compra no cambia el proveedor ni el precio de venta del producto.<br>6. Costo promedio: con existencia 0 o menos toma el costo de la compra; las variantes suman su cantidad al producto; no se compran productos ni variantes inactivos; se redondea al centavo.<br>7. Fecha: hoy o una pasada, nunca futura; pagada desde caja, hoy. La entrada y el costo se aplican al registrar.<br>8. La cancelación es todo o nada: si a una línea le falta stock, no se cancela; el costo no se recalcula.<br>9. Las entradas históricas "Compra a proveedor" no se convierten en compras; el motivo se quita de los tres formularios y el backend lo rechaza. El reporte de la spec 15 avisa desde cuándo hay compras.<br>10. Las líneas se capturan con un buscador por nombre o SKU y con el lector de códigos de barras; no se importan desde un CSV.<br>11. El almacenista tiene `purchases.read` y `purchases.create`, sin `cancel`.<br>12. Se documenta en `shared-features/`. | Usuario |
| 2026-10-28 | Creación de la spec, en **Borrador**. | — |
| 2026-10-28 | Se aprueba la spec, con las decisiones que se agregaron al redactarla (costo 0, costo unitario mayor a 0, costo inicial de la línea, máximo de 200 líneas, búsqueda propia de productos, 409 al cancelar sin stock): pasa a **Lista**. | Usuario |
| 2026-10-28 | T1 terminada: migración `013-add-purchases.sql` (tablas `purchases` y `purchase_items`, con `variant_key` como en `inventory_stock` para no repetir un producto con la misma variante), con su test. | — |
| 2026-10-28 | T2 terminada: migración `014-add-purchases-permissions.sql`, entrada Compras en el menú y etiqueta "Compras" en Permisos. | — |
| 2026-10-28 | T3 terminada: `purchase` y `purchase_refund` en `helpers/cashMovements.js` y en las etiquetas del POS, del corte impreso y del detalle de Sesiones de caja; "Compra cancelada" en Movimientos de inventario. | — |
| 2026-10-28 | T4 terminada:<br>- los ajustes individual y masivo rechazan "Compra a proveedor", sin importar mayúsculas, y los tres formularios ya no lo ofrecen;<br>- migración `015-deactivate-merchandise-expense-category.sql`.<br>Antes de escribir la `015` se guardó una foto de las categorías y los gastos de la copia de producción: la categoría 7 tenía 3 gastos (2 activos, $4,250.00, y 1 cancelado). Nodemon aplicó la `013`, la `014` y la `015` en la copia a las 13:09, 13:10 y 13:14 (hora del servidor); la categoría quedó inactiva y sus 3 gastos, idénticos.<br>Se actualizaron cuatro tests de la spec 12 que esperaban la categoría activa o los tipos de caja de antes (`list-expenses`, `expense-categories`, `008-add-expense-categories` y `cashMovements`): ahora prueban el estado de los requisitos 20 y 26. | — |
| 2026-10-28 | T5 y T6 terminadas: API `/api/purchases` (`purchaseService`, `purchaseController`, `purchase_routes`) y comprobante privado en `backend/storage/purchase-receipts`.<br>- Las validaciones, la caja abierta y el reingreso que comparten gastos y compras pasaron a `helpers/cashOutflows.js`, y `expenseService` los usa con los mismos mensajes.<br>- El middleware del comprobante pasó a `middlewares/uploadReceipt.js` (`createReceiptUpload`, `sendReceipt`); `uploadExpenseReceipt.js` y `uploadPurchaseReceipt.js` solo eligen su carpeta.<br>- `tests/setup/env.js` fija `PURCHASE_RECEIPTS_DIR`.<br>Backend 406/406. | — |
| 2026-10-28 | T7 y T8 terminadas: módulo Compras (`components/Purchases/`) y la opción Compra en Movimientos de efectivo del POS, que abre el mismo formulario (`PurchaseFormModal` con `posRegister`).<br>- `PurchaseLines.jsx`: buscador con el SKU exacto del lector de códigos de barras y lista de líneas, que en móvil se ve como tarjetas.<br>- `purchaseForm.js` comparte las líneas, el total y el FormData; el comprobante usa `openRecordReceipt` y `downloadRecordReceipt` de `expenseForm.js`.<br>- `PosContext` tiene `stockVersion` y `notifyStockChanged`, y la cuadrícula del POS se vuelve a leer cuando cambia (requisito 27).<br>- `purchases.css` define sus variables también en `.pur-overlay`, porque el formulario se abre en el POS, fuera de `.pur-root`. | — |
| 2026-10-28 | T9 terminada: volumen `./backend/storage/purchase-receipts` en `docker-compose.prod.yml` (la carpeta ya estaba fuera de git y de la imagen por `backend/storage/`), `PURCHASE_RECEIPTS_DIR` en `docs/tests.md` y `shared-features/feat-modulo-de-compras.md`. | — |
| 2026-10-28 | Verificación en la copia de producción con usuarios temporales (`claude_qa14_admin`, `claude_qa14_sup`, `claude_qa14_alm` y `claude_qa14_caj`), la sucursal "Sucursal QA spec 14", la caja "Caja QA spec 14", el proveedor "Proveedor QA spec 14" y cuatro productos temporales, para no mover el costo de productos reales. 28 revisiones por la API y capturas a 1366 y 390 px. **Hallazgo:** con cuatro opciones, los botones de Movimientos de efectivo no cabían a 390 px; se corrigió en `pos.css`. Al terminar se borraron las 10 compras y sus líneas, los movimientos de inventario y de caja, las sesiones, la caja, los productos y variantes, los usuarios con sus refresh tokens, la sucursal, el proveedor y los 4 comprobantes. Se llena la evidencia de los 10 criterios de aceptación. Queda en **Lista** hasta que el usuario apruebe pasarla a Terminada. | — |
| 2026-10-28 | Se aprueba el cierre: pasa a **Terminada**. | Usuario |
| 2026-10-28 | Cambio de alcance: agregar o reemplazar el comprobante después de registrar la compra, que aquí quedó fuera, lo cubre la [spec 15](15-comprobante-despues-de-guardar.md). Por eso el reporte de compras por proveedor pasa a la spec 16 (en el Objetivo y en "No incluye"). | Usuario |
