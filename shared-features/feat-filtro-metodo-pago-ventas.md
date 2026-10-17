# feat: Filtro por método de pago en Ventas

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Borrador** | feat | smallposv2 | smallpos-saas | `60aa180` | 2026-10-16 |

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

_Pendiente. Se llenan después de implementar._

## Notas para portar a smallpos-saas

- **Servicio:** `orderService.js` en saas tiene las mismas funciones (`buildOrdersFilter`, `getPaymentMethodTotals`, `getOrdersByBranchAndDateRange`). El cambio se puede portar casi tal cual.
- **Conexión:** en saas, `db` (`src/config/db.js`) resuelve el pool del tenant activo con AsyncLocalStorage y mantiene la misma interfaz (`db.query`). Las queries no cambian.
- **Endpoint de métodos:** `GET /api/payment-methods` en saas es `{ auth: true }`, igual que en smallposv2, así que cualquier usuario autenticado puede cargar el select.
- **IDs:** los `payment_method_id` cambian por tenant (ej. 8–11 en un tenant, 1–4 en otro). El frontend los toma del endpoint y no hay ids fijos en el código.
