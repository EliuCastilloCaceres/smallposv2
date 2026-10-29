# feat: Filtro por cliente en Créditos

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Implementada** | feat | smallposv2 | smallpos-saas | `60aa180` | 2026-10-16 |

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

Implementada en smallpos-saas con la Spec 15 (`specs/15-credits-totals-and-customer-filter.md`), el 2026-10-29, junto con [feat-totales-credito.md](feat-totales-credito.md).

- [x] El select solo ofrece clientes con créditos. En `marksexpress` aparece solo "samir castillo", de 3 clientes, y en `rbac09demo` los 2 que tienen créditos.
- [x] Al elegir un cliente, el listado y el pie son solo suyos. Al cambiar de sucursal, la lista se recarga y la selección se borra. Lo probó el usuario en `marksexpress` (2026-10-29).
- [x] Un usuario con `credit.read` y sin `customers.read` usa el filtro sin errores. Con un token que solo tiene `credit.read`:
  - `GET /api/credits/customers` (con sucursal y sin ella), `GET /api/credits?customer_id=8` y `GET /api/branches/list` responden 200;
  - `GET /api/customers` responde 403, como se espera.
- [x] La ruta va antes de `/:creditSaleId`: el test `does not reach getById` y la foto de accesos (`GET /api/credits/customers → perm credit.read`).
- [x] Tests en `creditList.test.js`: `cs.customer_id = ?` en el `WHERE` del conteo y del listado, un `customer_id` inválido se ignora, el endpoint con `credit.read`, el 403 sin él y `?branch_id`. En `Credits.test.jsx`: las opciones, elegir un cliente (página 1) y cambiar de sucursal.
- [x] Los tests del backend y del frontend pasan, en Docker: backend 877/877 (47 suites) y frontend 338/338 (37 archivos).

**Diferencias con smallposv2:**
- **Sucursal:** no hay `resolveUnrestrictedBranchId`. `?branch_id` se lee con `parseBranchId` como un filtro de los datos, no como la sucursal activa, porque Créditos es de todo el tenant (Spec 12 de saas, RF-5).
- **`customer_id`:** también se lee con `parseBranchId`, así que solo cuenta un entero positivo. En smallposv2, `parseInt` deja pasar `1.5` como 1 y `-3` como -3.
- **Ruta:** `createSecureRouter` con `{ perm: 'credit.read' }`, y también antes de `/:creditSaleId`.
- **Nombres repetidos:** igual que en smallposv2, solo "Nombre Apellido".
- **Tests:** saas los agrega, con la BD simulada en el backend.

## Notas para portar a smallpos-saas

- **Rutas:** saas usa `createSecureRouter` con otra sintaxis de permisos. La ruta queda así, y también **antes** de `/:creditSaleId`:
  ```js
  router.get('/customers', { perm: 'credit.read' }, ctrl.getCustomers);
  ```
- **Controlador:** `creditController.js` de saas ya importa `resolveUnrestrictedBranchId` y lo usa en `getByBranch`, así que `getCustomers` se porta igual.
- **Servicio:** `creditService.js` de saas tiene la misma `getActiveCreditsByBranch`. El cambio se porta tal cual.
- **Relación con otra feature:** comparte función y componente con [feat-totales-credito.md](feat-totales-credito.md). Conviene portarlas juntas.
