# feat: Filtro de costo en Productos

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Borrador** | feat | smallposv2 | smallpos-saas | Commit de la spec 09 (un solo commit) | 2026-10-26 |

## Resumen

Amplía el filtro de costo de **Productos** para encontrar, además de los productos sin costo, los que tienen el **costo mayor al precio** de venta, y marca esos costos en la tabla.

- **Regla:** costo mayor al precio = `purchase_price > sale_price`. Incluye un precio de venta 0 con costo. Un producto sin costo nunca la cumple. Es la misma regla de la alerta de Valuación de inventario.
- **Selector "Costo"** con cuatro opciones: Todos los costos, Sin costo, Costo mayor al precio, y Sin costo o costo mayor al precio. Se combina con los demás filtros y vuelve a la página 1.
- **Endpoint:** `GET /api/products` acepta `cost_issue` (`no_cost`, `above_price` o `any`), con su total de paginación. Con otro valor responde 400. `no_cost=true` (spec 06) sigue funcionando.
- **Marca:** un costo mayor al precio sale en rojo con la ayuda "Costo mayor al precio de venta", en la tabla y en las tarjetas. El costo 0 sigue en naranja.
- **Nombre unificado:** la alerta "Precio menor al costo" de Valuación de inventario pasa a llamarse "Costo mayor al precio".

Spec completa: [`specs/09-filtro-de-costo-en-productos.md`](../specs/09-filtro-de-costo-en-productos.md).

## Motivo

- En la base de producción hay 844 productos activos sin costo y 8 con el costo mayor al precio. Varios de estos últimos parecen tener el costo de la caja y el precio de la pieza; por ejemplo, una bolsa de regalo con costo $76 y precio $2.
- Los dos errores desfiguran la utilidad de los reportes, y para encontrar los de costo mayor al precio había que revisar el margen fila por fila.

## Historias de usuario

- Como **administrador**, quiero listar los productos con el costo mayor al precio de venta, para corregir el costo o el precio.
- Como **administrador**, quiero ver juntos los productos sin costo y los de costo mayor al precio, para revisar en una sola lista todo lo que está mal capturado.
- Como **supervisor**, quiero distinguir en la tabla los costos mayores al precio, para no tener que fijarme en el margen.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/services/productService.js` | `getAllProducts` acepta `cost_issue` (`COST_ISSUE_CONDITIONS`), validado con `Object.hasOwn`; 400 con otro valor. |
| `frontend/src/components/Products/Products.jsx` | Selector "Costo" con cuatro opciones, que manda `cost_issue`. `CostValue` marca en rojo un costo mayor al precio. |
| `frontend/src/components/Products/products.css` | `.prd-cost-above`: costo en rojo. |
| `frontend/src/components/Products/Products.test.jsx` | Las cuatro opciones, su `cost_issue` y el costo en rojo en la tabla y en las tarjetas. |
| `frontend/src/components/Reports/tabs/InventoryTab.jsx` y su test | La alerta se llama "Costo mayor al precio". |

## Archivos agregados

| Archivo | Qué es |
|---|---|
| `backend/tests/integration/products/list-cost-issue.test.js` | Las tres opciones con su total, precio 0 y costo igual al precio, combinación con estado, categoría y búsqueda, `no_cost` sin cambios, 400 con un valor desconocido y uso por un cajero. |

## Tareas realizadas

- [x] Parámetro `cost_issue` en `GET /api/products`.
- [x] Selector de costo con cuatro opciones y costo en rojo en Productos.
- [x] Nombre "Costo mayor al precio" en la alerta de Valuación de inventario.

## Criterios de aceptación

_Pendiente. Se llenan después de implementar._

## Notas para portar a smallpos-saas

Revisado contra el código de smallpos-saas el 2026-10-26 (`db79cc7`).

- **Depende de la spec 06:** usa el selector de costo, `CostValue` y el filtro `no_cost` que agrega [`feat-costo-en-tabla-productos.md`](feat-costo-en-tabla-productos.md), que saas todavía no tiene. Conviene portar las dos juntas.
- **Mismo servicio:** `productService.getAllProducts` de saas tiene los mismos filtros y `products.purchase_price` y `sale_price` son `NOT NULL`, así que `COST_ISSUE_CONDITIONS` se aplica igual.
- **Permisos:** `GET /products` ya pide `products.read`; no hace falta un permiso nuevo ni pasos por tenant. El Cajero de saas también lo tiene.
- **Valuación de inventario:** el cambio de nombre de la alerta aplica cuando se porte [`feat-valuacion-de-inventario.md`](feat-valuacion-de-inventario.md).
- **Tests:** los del backend de saas simulan `db`, así que el de integración se reescribe con esas simulaciones (con `cost_issue=above_price` la consulta lleva `p.purchase_price > p.sale_price`). Los del frontend se adaptan cambiando el mock de `useUser` por el `can()` de saas.
