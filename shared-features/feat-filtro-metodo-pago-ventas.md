# feat: Filtro por método de pago en Ventas

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Implementada** | feat | smallposv2 | smallpos-saas | `60aa180` | 2026-10-16 |

## Resumen

En **Ventas** (pantalla Ventas, pestaña "Ventas") se agregó un select **"Todos los métodos"** para filtrar por método de pago.

- **Listado:** muestra las ventas que tienen **al menos un pago** con el método elegido.
  - Una venta con pago mixto (ej. efectivo + tarjeta) aparece una sola vez.
  - El contador de ventas no se infla. El filtro usa `EXISTS` y no `JOIN`.
- **Pie de totales:** con el filtro activo suma **solo lo cobrado con ese método**.
  - Ejemplo: de una venta de $500 pagada con $300 en efectivo y $200 con tarjeta, al filtrar por Tarjeta solo cuentan los $200.
  - También descuenta solo los reembolsos hechos con ese método.
- **Opciones del select:** incluye los métodos **desactivados**, para poder revisar ventas viejas.
- El filtro se combina con los que ya existían: fechas, sucursal, estado, cajero y búsqueda.

## Motivo

Ventas solo se podía filtrar por fecha, sucursal, estado, cajero y búsqueda. No había forma de ver qué ventas se cobraron con un método específico, ni cuánto entró por ese método en un rango. Ese dato hace falta para cuadrar contra la terminal bancaria o las transferencias recibidas.

## Historias de usuario

- Como **supervisor**, quiero filtrar las ventas por método de pago para ver solo las cobradas con tarjeta (o transferencia, crédito, etc.).
- Como **administrador**, quiero ver en el pie cuánto se cobró con un método en el rango filtrado para conciliarlo con la terminal o el banco.
- Como **administrador**, quiero poder filtrar también por métodos que ya están desactivados para revisar ventas históricas.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/controllers/ordersController.js` | `getOrdersByDateRange` lee `payment_method_id` del query y lo pasa como `paymentMethodId`. |
| `backend/src/services/orderService.js` | **`buildOrdersFilter`:** nuevo parámetro `paymentMethodId` que agrega `AND EXISTS (SELECT 1 FROM order_payments opf WHERE opf.order_id = o.order_id AND opf.payment_method_id = ?)`.<br>**`getPaymentMethodTotals`:** recibe `paymentMethodId` y restringe la suma (`op.payment_method_id = ?`) y los reembolsos (`r.payment_method_id = ?`).<br>**`getOrdersByBranchAndDateRange`:** propaga el parámetro a las dos funciones. |
| `frontend/src/components/Orders/tabs/SalesTab.jsx` | Estado `paymentMethods` y `selectedPaymentMethodId`, carga con `GET /api/payment-methods` (sin `is_active`), select nuevo, envío de `payment_method_id` y deps de `useCallback`/`useEffect`. |

## Archivos agregados

Ninguno.

## Tareas realizadas

- [x] Backend: aceptar `payment_method_id` en `GET /api/orders`.
- [x] `buildOrdersFilter`: condición `EXISTS` (alias `opf`, para no chocar con `op` de la query de totales).
- [x] `getPaymentMethodTotals`: sumar solo el método filtrado y restar solo sus reembolsos.
- [x] Frontend: select de métodos de pago, incluidos los inactivos.
- [x] Frontend: reset a página 1 y refetch al cambiar el filtro.
- [x] Validar el SQL contra datos reales con una venta mixta (tarjeta $20 + efectivo $3).
- [x] Prueba manual en la app.

## Criterios de aceptación

Implementada en smallpos-saas con la Spec 16 (`specs/16-sales-payment-method-filter.md`), el 2026-10-29.

- [x] En `marksexpress`, del 2026-09-01 al 2026-10-29, con cada método el conteo de ventas y el pie coinciden con una consulta directa a la base:
  - Efectivo: 4 786 ventas y $169,605.68;
  - Tarjeta: 113 ventas y $7,026;
  - Transferencia Bancaria: 1 venta y $35;
  - Crédito: 13 ventas y $1,112.
  - Las ventas mixtas 87957 (tarjeta $20 y efectivo $3) y 90364 (efectivo $150 y tarjeta $200) aparecen una vez con Efectivo, una vez con Tarjeta y ninguna con los otros dos métodos.
- [x] En todo el historial (90 365 ventas), el pie filtrado por cada método es igual a la fila de ese método en el pie sin filtro: Efectivo $2,855,880.18, Tarjeta $21,248, Crédito $1,112 y Transferencia Bancaria $35.
- [x] En la app, al filtrar por Tarjeta el 2026-10-27, solo aparece la 90364, con $350 en su fila, y el pie suma $200. Lo probó el usuario (2026-10-29).
- [x] Un método desactivado sigue en el select, como "Transferencia Bancaria (inactivo)", y su venta (88322, $35) se filtra. Lo probó el usuario.
- [x] `EXPLAIN` del conteo con el filtro, en todo el historial, usa el índice `fk_op_method` de `order_payments`. Con Tarjeta tarda 16 ms. Con Efectivo, igual que sin filtro, tarda cerca de 1.5 s.
- [x] Tests en `salesList.test.js` (16) y `SalesTab.test.jsx` (4). Los tests del backend y del frontend pasan, en Docker: backend 893/893 (48 suites) y frontend 342/342 (38 archivos).

**Diferencias con smallposv2:**
- **Reembolsos con un método que la venta no usó:**
  - En saas se restan del pie filtrado: las consultas de totales no llevan el `EXISTS` del listado, así que el pie filtrado siempre es igual a la fila de ese método sin filtro.
  - En smallposv2, los totales solo cuentan las ventas que tienen un pago con el método.
  - Las dos solo difieren en esos reembolsos.
- **Métodos desactivados:** aparecen como "Nombre (inactivo)". En smallposv2, solo con el nombre.
- **`payment_method_id`:** se lee con `parseBranchId`, así que solo cuenta un entero positivo. En smallposv2, `parseInt` deja pasar `1.5` como 1 y `-3` como -3.
- **Sucursal:**
  - El filtro respeta el alcance de la Spec 12 de saas (`branchIds` y `X-Branch-Id`), no `resolveOptionalBranchId`.
  - El método elegido se conserva al cambiar de alcance.
- **Estilos:** en escritorio, los filtros de Ventas pasan a otra línea cuando no caben (`orders.css`, desde 768 px). Ventas de saas tiene siete controles, contando el selector de alcance, y el último quedaba cortado. En smallposv2, la fila sigue sin salto de línea.
- **Tests:** saas los agrega.

## Notas para portar a smallpos-saas

- **Servicio:** `orderService.js` en saas tiene las mismas funciones (`buildOrdersFilter`, `getPaymentMethodTotals`, `getOrdersByBranchAndDateRange`). El cambio se puede portar casi tal cual.
- **Conexión:** en saas, `db` (`src/config/db.js`) resuelve el pool del tenant activo con AsyncLocalStorage y mantiene la misma interfaz (`db.query`). Las queries no cambian.
- **Endpoint de métodos:** `GET /api/payment-methods` en saas es `{ auth: true }`, igual que en smallposv2, así que cualquier usuario autenticado puede cargar el select.
- **IDs:** los `payment_method_id` cambian por tenant (ej. 8–11 en un tenant, 1–4 en otro). El frontend los toma del endpoint y no hay ids fijos en el código.
