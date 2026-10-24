# feat: Costo y margen en la tabla de productos

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Borrador** | feat | smallposv2 | smallpos-saas | Commit de la spec 06 (un solo commit) | 2026-10-23 |

## Resumen

Agrega a la tabla de **Productos** el costo de compra y el margen de cada producto, marca los productos sin costo y permite filtrarlos.

- **Columnas:** el orden queda UM, **Costo**, Precio venta, **Margen**. Las tarjetas de móvil muestran lo mismo.
- **Sin costo** (`purchase_price = 0`, la misma regla que las líneas de venta): el costo se muestra como "$0.00" en naranja, sin fondo para no romper la alineación de la columna, con la ayuda "Sin costo" al pasar el cursor. El margen queda en "—".
- **Margen:** (precio venta − costo) ÷ precio venta × 100, con un decimal. Si es negativo, sale en rojo. Sin costo o con precio de venta 0, muestra "—".
- **Filtro "Sin costo"** en la pantalla, y el parámetro `no_cost=true` en `GET /api/products`. Se combina con los demás filtros.
- **Una sola fórmula de margen** (`utils/productMargin.js`), que usan la tabla, las tarjetas, el detalle del producto y el margen en vivo del formulario.
  - **Detalle:** sin costo mostraba 100.0%, y con precio 0, "NaN%" o "-Infinity%"; ahora muestra "—".
  - **Formulario:** conserva sus colores y leyendas ("Vendiendo a pérdida", "Margen bajo", etc.).
  - **Redondeo:** se hace en centavos, para que no dependa del error de punto flotante (12.35% redondea a 12.4%, no a 12.3%).
- **Visibilidad:** lo ve todo el que entra a Productos (`products.read`), igual que el costo en el detalle. No cambia ningún permiso.

Spec completa: [`specs/06-costo-en-tabla-productos.md`](../specs/06-costo-en-tabla-productos.md).

## Motivo

- En la base de producción, 844 de los 2,400 productos activos no tienen costo, y sus líneas suman el 25% de la venta neta de los últimos 12 meses, así que la utilidad de los reportes sale inflada. Para encontrarlos había que abrir producto por producto.
- El detalle del producto mostraba un margen de 100% para los productos sin costo y un valor inválido con precio 0. El formulario calculaba su propio margen y a veces difería en 0.1.

## Historias de usuario

- Como **administrador**, quiero ver el costo y el margen de cada producto en la tabla, para revisar precios sin abrir producto por producto.
- Como **administrador**, quiero listar solo los productos sin costo, para capturar los que faltan y que la utilidad de los reportes sea confiable.
- Como **supervisor**, quiero distinguir de un vistazo los productos que se venden por debajo de su costo, para corregir su precio.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/services/productService.js` | `getAllProducts` acepta `no_cost` (`'true'` o `'1'`) y filtra `p.purchase_price = 0`. El total de la paginación cuenta solo esos. |
| `frontend/src/components/Products/Products.jsx` | Columnas Costo y Margen, con `CostValue` y `MarginValue`, en la tabla y en las tarjetas. Selector "Con y sin costo" / "Sin costo", que manda `no_cost`. |
| `frontend/src/components/Products/products.css` | `.prd-no-cost` (costo 0 en naranja, sin fondo), `.prd-margin-value--negative` (rojo), y las tarjetas pasan a otra línea si no caben. |
| `frontend/src/components/Products/modals/ProductDetailModal.jsx` | El margen sale de `productMargin` y `fmtMargin`, y la fila siempre se muestra. |
| `frontend/src/components/Products/modals/ProductModal.jsx` | El margen en vivo sale de `productMargin` y `fmtMargin`. Los niveles y las leyendas no cambian. |

## Archivos agregados

| Archivo | Qué es |
|---|---|
| `frontend/src/utils/productMargin.js` | `productMargin(product)`: el margen con un decimal, o `null` sin costo o sin precio. `fmtMargin(margin)`: "40.0%" o "—". |
| `frontend/src/utils/productMargin.test.js` | Margen normal, negativo, sin costo y con precio 0, redondeo y montos como texto. |
| `backend/tests/integration/products/list-no-cost.test.js` | `no_cost=true` y su total; combinado con estado, categoría y búsqueda; sin el parámetro o con `false`; un cajero lo puede usar. |
| `frontend/src/components/Products/Products.test.jsx` | Orden de las columnas con solo `products.read`, costo 0 como "$0.00" en naranja, margen negativo en rojo, tarjetas de móvil y filtro (vuelve a la página 1 y se combina con la categoría). |
| `frontend/src/components/Products/modals/ProductDetailModal.test.jsx` | El detalle muestra el margen compartido, y "—" sin costo o con precio 0. |
| `frontend/src/components/Products/modals/ProductModal.test.jsx` | El formulario muestra el margen compartido con su nivel, y lo oculta sin costo o sin precio. |

## Tareas realizadas

- [x] Filtro `no_cost` en `GET /api/products`.
- [x] Fórmula de margen compartida por la tabla, el detalle y el formulario. Que el formulario también la usara fue una duda que surgió al implementar.
- [x] Columnas, costo 0 en naranja y filtro en Productos, también en las tarjetas de móvil. Al principio un costo 0 se marcaba con "Sin costo" en una pastilla con fondo, pero desalineaba la columna, así que quedó como "$0.00" en naranja.

## Criterios de aceptación

_Pendiente. Se llenan después de implementar._

## Notas para portar a smallpos-saas

Revisado contra el código de smallpos-saas el 2026-10-23 (`db79cc7`).

- **Sin dependencias:** no usa nada de las specs 04 ni 05, así que se puede portar sola.
- **Mismos archivos:** saas tiene los mismos `Products.jsx`, `ProductDetailModal.jsx`, `ProductModal.jsx` y `productService.getAllProducts`, con los mismos filtros. `products.purchase_price` también es `NOT NULL DEFAULT 0`, así que la regla de "sin costo" es la misma. Los cambios se aplican casi igual.
- **Permisos:**
  - `GET /products` ya pide `{ perm: 'products.read' }`, así que no hace falta un permiso nuevo ni pasos por tenant.
  - En saas, el Cajero también tiene `products.read`, así que verá el costo y el margen, como hoy ve el costo en el detalle. Ocultárselo requeriría un permiso nuevo en `rbac/catalog.js`; es una decisión aparte.
  - En saas, `Products.jsx` usa `can('products.update')` y `canAct` (editar o `products.status`) para la columna de acciones. Las columnas nuevas no dependen de eso.
- **Sin migración:** el filtro solo lee; no cambia el esquema ni los datos.
- **Tests:**
  - los del backend de saas simulan `db`, así que el de integración se reescribe con esas simulaciones (con `no_cost` la consulta lleva `p.purchase_price = 0`, y sin él no);
  - `productMargin.test.js` se porta tal cual;
  - los de los componentes se adaptan cambiando el mock de `useUser` por el `can()` de saas.
