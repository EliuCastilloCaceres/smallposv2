# feat: Totales en el listado de Créditos

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Borrador** | feat | smallposv2 | smallpos-saas | `60aa180` | 2026-10-16 |

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

_Pendiente. Se llenan después de implementar._

## Notas para portar a smallpos-saas

- **Servicio:** `getActiveCreditsByBranch` existe igual en `creditService.js` de saas. El cambio se porta tal cual.
- **Cancelados:** saas también hace `balance = total_amount` al cancelar (`cancelCreditSale`), así que la exclusión de cancelados en el saldo aplica igual.
- **Conexión:** `db` es tenant-aware en saas con la misma interfaz, así que la query no cambia.
- **Relación con otra feature:** si también se porta [feat-filtro-cliente-credito.md](feat-filtro-cliente-credito.md), las dos tocan la misma función y el mismo componente. Conviene portarlas juntas.
