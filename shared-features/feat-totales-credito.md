# feat: Totales en el listado de Créditos

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Implementada** | feat | smallposv2 | smallpos-saas | `60aa180` | 2026-10-16 |

## Resumen

El listado de **Créditos** ahora tiene un pie de totales con el mismo estilo que el de Ventas:

- **Total:** suma de `total_amount`.
- **Pagado:** suma de `amount_paid`.
- **Saldo pendiente:** suma de `balance`, **sin contar los cancelados**.

Detalles:
- Los totales cubren **todo el resultado del filtro**, no solo la página actual, y no cambian al paginar.
- Se calculan en el backend, en la misma query del `COUNT(*)`, así que comparten exactamente el mismo `WHERE` que el listado.
- El bloque es uno solo para la vista de tabla y la de tarjetas (móvil). Aparece debajo del listado y antes de la paginación.

## Motivo

Ventas ya tenía pie de totales, Créditos no. No había forma de saber cuánto se debe en total, o cuánto se ha cobrado, con un filtro aplicado (estado, sucursal, cliente o búsqueda) sin sumarlo a mano página por página.

El saldo excluye los cancelados por esto: `cancelCreditSale` deja `balance = total_amount` en un crédito cancelado para cumplir el CHECK `balance = total_amount - amount_paid`. Sin excluirlos, el saldo de un crédito cancelado se vería como deuda real.

## Historias de usuario

- Como **encargado de cobranza**, quiero ver el saldo pendiente total de los créditos filtrados para saber cuánto falta por cobrar.
- Como **administrador**, quiero ver cuánto se ha vendido a crédito y cuánto se ha pagado en una sucursal o estado para medir la cartera.
- Como **usuario**, quiero que los totales no cambien al pasar de página para que reflejen todo el filtro y no solo lo visible.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/services/creditService.js` | `getActiveCreditsByBranch`: la query del `COUNT(*)` agrega `SUM(total_amount)`, `SUM(amount_paid)` y `SUM(CASE WHEN status <> 'cancelled' THEN balance ELSE 0 END)`. La respuesta incluye `totals: { total_amount, amount_paid, balance }`. |
| `frontend/src/components/Credits/Credits.jsx` | Estado `totals` (constante `EMPTY_TOTALS`), asignado desde la respuesta de `GET /api/credits`, y bloque `.crd-totals` en el JSX. |
| `frontend/src/components/Credits/credits.css` | Estilos `.crd-totals*`, copiados de `.sls-totals*` (`Orders/orders.css`) con las variables `--crd-*`. |

## Archivos agregados

Ninguno.

## Tareas realizadas

- [x] Backend: calcular los totales en la misma query del `COUNT` (mismo `WHERE`).
- [x] Backend: excluir cancelados del saldo.
- [x] Backend: devolver `totals` junto a `data` y `pagination`.
- [x] Frontend: pie de totales compartido entre tabla y tarjetas.
- [x] Frontend: estilos con las variables del módulo de Créditos.
- [x] Validar el SQL contra datos reales: activos $47 de saldo; pagados $885 total, $885 pagado y $0 de saldo.
- [x] Prueba manual en la app.

## Criterios de aceptación

Implementada en smallpos-saas con la Spec 15 (`specs/15-credits-totals-and-customer-filter.md`), el 2026-10-29, junto con [feat-filtro-cliente-credito.md](feat-filtro-cliente-credito.md).

- [x] En `marksexpress`, con cada filtro de estado, el pie muestra los mismos Total, Pagado y Saldo pendiente que una consulta directa a la base:
  - Activos y vencidos, y Activos: $227, $0 y $227 (2 créditos).
  - Vencidos: $0 en los tres.
  - Pagados: $885, $885 y $0 (10 créditos).
  - Cancelados: $180, $0 y $0 (1 crédito).
  - Se revisó por la API, con un token de solo lectura, y el usuario lo vio en la app (2026-10-29).
- [x] Con `limit=5`, todas las páginas de un mismo filtro devuelven los mismos totales. Por ejemplo, Pagados: 10 créditos en 2 páginas, con los mismos totales en las dos.
- [x] Un crédito cancelado cuenta en Total y en Pagado, pero no en el Saldo pendiente.
  - El usuario hizo una venta a crédito de prueba (90367, crédito #32, $180, Sucursal Norte) y la canceló.
  - Con "Cancelados", el pie muestra $180, $0 y $0, aunque en la base su `balance` es $180.
- [x] Tests en `creditList.test.js`: las tres sumas con `COALESCE`, el mismo `WHERE` y los mismos parámetros que el listado, y `totals` en la respuesta. En `Credits.test.jsx`: el pie muestra los totales de la respuesta y no aparece sin resultados.
- [x] Los tests del backend y del frontend pasan, en Docker: backend 877/877 (47 suites) y frontend 338/338 (37 archivos).

**Diferencias con smallposv2:**
- **Ninguna en el comportamiento:** la consulta, la respuesta, el pie y sus estilos son los mismos.
- **Tests:** saas los agrega, con la BD simulada en el backend.

## Notas para portar a smallpos-saas

- **Servicio:** `getActiveCreditsByBranch` existe igual en `creditService.js` de saas. El cambio se porta tal cual.
- **Cancelados:** saas también hace `balance = total_amount` al cancelar (`cancelCreditSale`), así que la exclusión de cancelados en el saldo aplica igual.
- **Conexión:** `db` es tenant-aware en saas con la misma interfaz, así que la query no cambia.
- **Relación con otra feature:** si también se porta [feat-filtro-cliente-credito.md](feat-filtro-cliente-credito.md), las dos tocan la misma función y el mismo componente. Conviene portarlas juntas.
