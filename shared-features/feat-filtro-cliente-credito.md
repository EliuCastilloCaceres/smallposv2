# feat: Filtro por cliente en Créditos

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Borrador** | feat | smallposv2 | smallpos-saas | `60aa180` | 2026-10-16 |

## Resumen

En el listado de **Créditos** se agregó un select **"Todos los clientes"** para filtrar por cliente.

- **Opciones:** solo aparecen los clientes que **tienen al menos un crédito**.
- **Endpoint nuevo:** `GET /api/credits/customers` llena el select.
  - Pide el permiso `credit:read`, el mismo que da acceso al módulo.
  - Respeta la sucursal seleccionada.
- **Cambio de sucursal:** la lista de clientes se recarga y la selección se borra, porque el cliente puede no tener créditos en la nueva sucursal.
- **Alcance del filtro:** afecta tanto al listado como al pie de totales.
- **Combinación con otros filtros:** se suma a los que ya existían (búsqueda, estado y sucursal).

## Motivo

Créditos solo tenía búsqueda libre por número, cliente o teléfono. Se pidió un filtro explícito por cliente para revisar todos los créditos de una persona.

Decisiones de diseño:
- **Tipo de control:** se eligió un **dropdown con solo clientes con crédito**, y no un buscador con autocompletar.
- **Endpoint propio:** no se reutilizó `GET /api/customers` porque exige `customers:read`. Un rol con acceso a Créditos pero sin ese permiso recibiría un 403.

## Historias de usuario

- Como **encargado de cobranza**, quiero filtrar los créditos de un cliente para revisar su estado de cuenta completo.
- Como **usuario**, quiero que el dropdown muestre solo clientes que tienen créditos para no buscar entre todo el catálogo de clientes.
- Como **usuario con acceso a varias sucursales**, quiero que la lista de clientes corresponda a la sucursal seleccionada para no elegir un cliente sin créditos ahí.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/services/creditService.js` | **`getActiveCreditsByBranch`:** nuevo parámetro `customerId` que agrega `cs.customer_id = ?`.<br>**`getCustomersWithCredits({ branchId })`:** función nueva con `SELECT DISTINCT` de clientes con créditos, opcionalmente por sucursal. |
| `backend/src/controllers/creditController.js` | **`getByBranch`:** lee `customer_id`.<br>**`getCustomers`:** controlador nuevo que usa `resolveUnrestrictedBranchId`. |
| `backend/src/routes/credit_routes.js` | Ruta nueva `GET /customers` con `credit:read`, declarada **antes** de `/:creditSaleId` para que Express no la tome como un id. |
| `frontend/src/components/Credits/Credits.jsx` | **Estado:** `customers` y `selectedCustomerId`.<br>**Carga:** efecto que recarga clientes al cambiar de sucursal.<br>**Handlers:** `handleCustomerChange` es nuevo; `handleBranchChange` ahora también borra la selección de cliente.<br>**Fetch:** envía `customer_id` y se agregó a los deps.<br>**UI:** select nuevo. |

## Archivos agregados

Ninguno. El endpoint y la función nuevos viven en archivos existentes.

## Tareas realizadas

- [x] Backend: filtro `customer_id` en `GET /api/credits`.
- [x] Backend: endpoint `GET /api/credits/customers`, bajo `credit:read` y respetando sucursal.
- [x] Backend: ruta declarada antes de `/:creditSaleId`.
- [x] Frontend: select de clientes, recarga al cambiar de sucursal y reset de la selección.
- [x] Frontend: reset a página 1 y refetch al cambiar el filtro.
- [x] Validar el SQL de clientes con crédito contra datos reales.
- [x] Prueba manual en la app.

## Criterios de aceptación

_Pendiente. Se llenan después de implementar._

## Notas para portar a smallpos-saas

- **Rutas:** saas usa `createSecureRouter` con otra sintaxis de permisos. La ruta queda así, y también **antes** de `/:creditSaleId`:
  ```js
  router.get('/customers', { perm: 'credit.read' }, ctrl.getCustomers);
  ```
- **Controlador:** `creditController.js` de saas ya importa `resolveUnrestrictedBranchId` y lo usa en `getByBranch`, así que `getCustomers` se porta igual.
- **Servicio:** `creditService.js` de saas tiene la misma `getActiveCreditsByBranch`. El cambio se porta tal cual.
- **Relación con otra feature:** comparte función y componente con [feat-totales-credito.md](feat-totales-credito.md). Conviene portarlas juntas.
