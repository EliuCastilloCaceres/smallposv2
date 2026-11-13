# feat: Filtro de costo en Productos

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Implementada** | feat | smallposv2 | smallpos-saas | Commit de la spec 09 (un solo commit) | 2026-10-26 |

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

Implementada en smallpos-saas con la Spec 17 (`specs/17-product-cost-and-margin.md`), junto con [`feat-costo-en-tabla-productos.md`](feat-costo-en-tabla-productos.md), el 2026-11-12. El nombre de la alerta de Valuación queda pendiente: saas todavía no tiene Valuación de inventario, y su plan lo deja para la Spec 20.

- [x] En `marksexpress`, por la API, las tres opciones de `cost_issue` dan lo mismo que una consulta directa a la base:
  - activos: 850 sin costo, 10 con el costo mayor al precio y 860 con alguno de los dos;
  - inactivos: 289, 4 y 293.
- [x] El filtro se combina con el estado, la categoría y la búsqueda. Por ejemplo, con la búsqueda "bolsa" da 2 con el costo mayor al precio y 32 con alguno de los dos, igual que SQL. Al cambiarlo, la pantalla vuelve a la página 1 y conserva la categoría.
- [x] Un costo mayor al precio sale en rojo, con la ayuda "Costo mayor al precio de venta", en la tabla y en las tarjetas. Incluye un precio 0: "vive100 ultra" muestra $12.00 en rojo y margen "—". El costo 0 sigue en naranja. Lo probó el usuario (2026-11-12).
- [x] En escritorio (1366 px) los cinco filtros se ven completos, y en el celular las tarjetas muestran el costo en rojo. Lo probó el usuario.
- [x] Un valor desconocido o vacío responde 400 *"cost_issue debe ser no_cost, above_price o any"*.
- [ ] En Valuación de inventario, la alerta dice "Costo mayor al precio". Entra con la Spec 20 de saas.
- [x] Los tests del backend y del frontend pasan, en Docker: backend 903/903 (49 suites) y frontend 367/367 (42 archivos).

**Diferencias con smallposv2:**
- **`no_cost=true`:** no existe en saas; se ignora como cualquier parámetro desconocido. `cost_issue=no_cost` hace lo mismo.
- **Valuación de inventario:** el nombre de la alerta todavía no aplica (Spec 20 de saas).
- **Tests:** el del backend simula la base (`productList.test.js`) en lugar de ser de integración, y los del frontend usan el `can()` de saas.

## Notas para portar a smallpos-saas

Revisado contra el código de smallpos-saas el 2026-10-26 (`db79cc7`).

- **Depende de la spec 06:** usa el selector de costo, `CostValue` y el filtro `no_cost` que agrega [`feat-costo-en-tabla-productos.md`](feat-costo-en-tabla-productos.md), que saas todavía no tiene. Conviene portar las dos juntas.
- **Mismo servicio:** `productService.getAllProducts` de saas tiene los mismos filtros y `products.purchase_price` y `sale_price` son `NOT NULL`, así que `COST_ISSUE_CONDITIONS` se aplica igual.
- **Permisos:** `GET /products` ya pide `products.read`; no hace falta un permiso nuevo ni pasos por tenant. El Cajero de saas también lo tiene.
- **Valuación de inventario:** el cambio de nombre de la alerta aplica cuando se porte [`feat-valuacion-de-inventario.md`](feat-valuacion-de-inventario.md).
- **Tests:** los del backend de saas simulan `db`, así que el de integración se reescribe con esas simulaciones (con `cost_issue=above_price` la consulta lleva `p.purchase_price > p.sale_price`). Los del frontend se adaptan cambiando el mock de `useUser` por el `can()` de saas.
