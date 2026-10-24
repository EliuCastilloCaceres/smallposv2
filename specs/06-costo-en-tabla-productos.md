# 06 — Costo y margen en la tabla de productos

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Terminada** | 2026-10-22 | 2026-10-23 |

## Objetivo

Agrega a la tabla de **Productos** el costo de compra y el margen de cada producto, marca los productos sin costo y permite filtrarlos. Así se encuentran rápido los productos a los que les falta el costo y los que tienen un precio mal capturado.

En la copia de la base de producción (22 oct 2026), 844 de los 2,400 productos activos no tienen costo, y las líneas sin costo suman el 25% de la venta neta de los últimos 12 meses. Mientras falten esos costos, la utilidad de Ventas y utilidad y de Tendencia de ventas sale inflada.

**Base que ya existe:**
- `GET /api/products` ya devuelve `purchase_price` (`productService.getAllProducts`), con los filtros `search`, `category_id`, `provider_id` e `is_active`, paginado.
- La tabla de `frontend/src/components/Products/Products.jsx` muestra Producto, Categoría, Proveedor, UM, Precio venta y Estado; en móvil, tarjetas con Venta y UM.
- El detalle del producto (`Products/modals/ProductDetailModal.jsx`) ya muestra el costo ("Compra") y el margen a cualquiera que ve Productos (`products.read`).
- **Sin costo** significa `purchase_price = 0`, la misma regla de la spec 03 para las líneas de venta. La columna es `NOT NULL DEFAULT 0`, así que no hay costos nulos.
- Las variantes no tienen costo propio: al venderse toman el del producto (`backend/src/helpers/catalogCosts.js`).

## Historias de usuario

- Como **administrador**, quiero ver el costo y el margen de cada producto en la tabla, para revisar precios sin abrir producto por producto.
- Como **administrador**, quiero listar solo los productos sin costo, para capturar los que faltan y que la utilidad de los reportes sea confiable.
- Como **supervisor**, quiero distinguir de un vistazo los productos que se venden por debajo de su costo, para corregir su precio.

## Alcance

**Incluye**
- Columnas **Costo** y **Margen** en la tabla de Productos, y los mismos datos en las tarjetas de móvil.
- El costo de los productos con costo 0 se muestra como **"$0.00" en naranja**.
- El filtro **"Sin costo"** en la pantalla y el parámetro `no_cost` en `GET /api/products`.
- Una sola fórmula de margen, compartida por la tabla y el detalle del producto.
- Tests de todo lo anterior.
- **Documentación en `shared-features/`:** sí, como `feat-costo-en-tabla-productos.md` (decisión del usuario, 2026-10-22).

**No incluye**
- Cambiar quién ve el costo: lo sigue viendo todo el que tiene `products.read`, como hoy en el detalle (decisión 2).
- Ordenar la tabla por costo o por margen.
- Editar el costo desde la tabla: se sigue editando en el formulario del producto.
- Otras tablas con productos: Inventario → Existencias, el POS y el detalle de un proveedor.
- Capturar los costos que faltan: es una tarea de datos.
- Exportar la tabla.

## Requisitos

### Visibilidad
1. Las columnas, la marca y el filtro los ve cualquiera que entra a Productos (`products.read`), incluidos los cajeros, igual que el costo en el detalle del producto (decisión 2). No se agrega ni se cambia ningún permiso.

### Tabla
2. El orden de las columnas queda: Producto, Categoría, Proveedor, UM, **Costo**, Precio venta, **Margen**, Estado y las acciones.
3. **Costo:** el `purchase_price` en pesos, con el mismo formato que Precio venta. Si es 0, se muestra **"$0.00" en naranja** (color de advertencia), sin fondo, para que termine en el mismo borde que los demás montos; al pasar el cursor dice "Sin costo".
4. **Margen:** (precio venta − costo) ÷ precio venta × 100, con un decimal y el signo %, igual que en el detalle del producto.
   - Sin costo, o con precio de venta 0, muestra **"—"**.
   - Si el costo es mayor que el precio, el margen sale negativo (por ejemplo, "−12.5%") y en rojo.
5. Los productos variables muestran el costo y el margen del producto, porque sus variantes no tienen costo propio.

### Móvil
6. Las tarjetas muestran **Costo** (en naranja si es 0) y **Margen** junto a Venta y UM, con las mismas reglas de la tabla.

### Fórmula compartida
7. La fórmula del margen vive en un solo lugar del frontend y la usan la tabla, las tarjetas, el detalle del producto y el margen en vivo del formulario de crear o editar producto (duda 2). Para un mismo producto, todos muestran el mismo margen. El formulario conserva sus colores y leyendas ("Vendiendo a pérdida", "Margen bajo", etc.). En el detalle, sin costo o con precio de venta 0, el margen pasa a mostrar **"—"**, en lugar de 100.0% o de un valor inválido ("NaN%", "-Infinity%") (duda 1).

### Filtro "Sin costo"
8. Un selector nuevo en los filtros, con las opciones **"Con y sin costo"** (por defecto) y **"Sin costo"**. Se combina con la búsqueda, la categoría, el proveedor y el estado. Al cambiarlo se vuelve a la página 1, como con los demás filtros, y el contador "N productos encontrados" refleja el filtro.
9. `GET /api/products` acepta `no_cost=true`: devuelve solo los productos con `purchase_price = 0`, y el total de la paginación cuenta solo esos. Sin el parámetro, o con cualquier otro valor, la respuesta no cambia. Pide el mismo permiso de siempre (`products.read`).

### Documentación
10. `shared-features/feat-costo-en-tabla-productos.md` documenta la spec con la estructura de `sf-index.md` y se agrega al índice.

## Tareas

- [x] **T1. Filtro `no_cost` en `GET /api/products`** (requisito 9).
  — tests de integración:
  - con `no_cost=true` solo vienen productos con costo 0, y el total de la paginación cuenta solo esos;
  - se combina con `is_active`, `category_id` y `search`;
  - sin el parámetro, o con `no_cost=false`, vienen todos, como antes;
  - un cajero, con `products.read`, lo puede usar.
- [x] **T2. Fórmula de margen compartida** (requisitos 4 y 7).
  — tests: margen normal, negativo, sin costo y con precio 0, y el redondeo a un decimal. El detalle del producto usa la misma fórmula y muestra "—" sin costo o con precio 0. El formulario de producto muestra el margen de la fórmula compartida con su nivel ("Vendiendo a pérdida", "Margen bajo", etc.).
- [x] **T3. Columnas, marca y filtro en Productos** (requisitos 1–6 y 8).
  — tests, con la API simulada:
  - la tabla muestra Costo y Margen en su lugar, también para un usuario sin `products.update`;
  - un producto con costo 0 muestra "$0.00" en naranja y margen "—";
  - un margen negativo sale en rojo;
  - las tarjetas de móvil muestran costo y margen;
  - el filtro manda `no_cost=true`, vuelve a la página 1 y se combina con los demás filtros.
- [x] **T4. Documentación en `shared-features/`** (requisito 10).
  — tests: no lleva tests de código.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | En Productos, la tabla muestra Costo y Margen, también a un usuario que solo tiene `products.read`. | 2026-10-23: el usuario lo probó en el navegador con la copia de producción (`marksexpressv2`). Test `Products.test.jsx`: con solo `products.read`, los encabezados son Producto, Categoría, Proveedor, UM, Costo, Precio venta, Margen y Estado. En la copia, un cajero recibe 200 en `GET /api/products`, así que ve las columnas. |
| 2 | Un producto con costo 0 muestra "$0.00" en naranja y margen "—". | 2026-10-23: el usuario lo probó en el navegador después del cambio a "$0.00" en naranja. Test `Products.test.jsx`: el costo 0 sale como "$0.00" con la clase `prd-no-cost` y la ayuda "Sin costo", y su margen es "—", en la tabla y en las tarjetas. |
| 3 | El margen de un producto en la tabla coincide con el de su detalle, y un producto sin costo muestra "—" en los dos. | 2026-10-23: la tabla, las tarjetas, el detalle y el formulario calculan el margen con la misma función (`utils/productMargin.js`). En la copia, Recarga500 (costo $475, precio $502) da 5.4% en los dos. Tests `productMargin.test.js` (normal, negativo, sin costo, precio 0 y redondeo de 12.35% a 12.4%), `ProductDetailModal.test.jsx` ("—" sin costo o con precio 0) y `ProductModal.test.jsx`. |
| 4 | Un producto con costo mayor que su precio muestra el margen negativo en rojo. | 2026-10-23: en la copia, "bolsa de regalo desc suelt" (costo $76, precio $2) da −3700.0%. Test `Products.test.jsx`: un margen de −12.5% lleva la clase `prd-margin-value--negative` (rojo y negrita) y uno positivo no. |
| 5 | En la base de desarrollo, el filtro "Sin costo" lista solo los productos sin costo, el contador coincide con un conteo en la base, y se combina con los demás filtros. | 2026-10-23, copia de producción: `no_cost=true` devuelve 844 productos activos, igual que un conteo SQL de `purchase_price = 0`. Combinado con inactivos da 289, y con la categoría Accesorios (13), 172; los dos coinciden con SQL. Un cajero también lo puede usar (200). Tests `list-no-cost.test.js` (4 tests) y `Products.test.jsx` (manda `no_cost=true`, vuelve a la página 1 y conserva la categoría). |
| 6 | En móvil, las tarjetas muestran el costo y el margen. | 2026-10-23: test `Products.test.jsx`: las tarjetas muestran "Costo $60.00" y "Margen 40.0%", y el costo 0 en naranja con margen "—". `.prd-card__prices` pasa a otra línea si los cuatro datos no caben. No se revisó en un teléfono. |
| 7 | `shared-features/feat-costo-en-tabla-productos.md` existe y está en el índice. | 2026-10-23: el archivo existe y está en la tabla del índice (`sf-index.md`). Se commitea junto con el resto de la spec. |
| 8 | Los tests del backend y del frontend pasan. | 2026-10-23: backend 111/111 (20 archivos), frontend 100/100 (18 archivos). |

## Dudas abiertas

- _Ninguna._

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-22 | Antes de redactar se resolvieron 4 dudas:<br>1. Primero se cierra la spec 05.<br>2. Las columnas las ve todo el que ve Productos, como el costo en el detalle.<br>3. Además del costo: la marca "Sin costo", la columna de margen y el filtro "Sin costo".<br>4. Se documenta en `shared-features/`. | Usuario |
| 2026-10-22 | Creación de la spec, en **Borrador**, con 1 duda abierta. | — |
| 2026-10-23 | Se resuelve la duda: el detalle del producto comparte la fórmula de la tabla y muestra "—" sin costo o con precio de venta 0 (requisito 7). | Usuario |
| 2026-10-23 | Se aprueba la spec: pasa a **Lista**. | Usuario |
| 2026-10-23 | Duda 2, surgida al implementar T2 y resuelta en el momento: el formulario de crear o editar producto calculaba su propio margen en vivo. Pasa a usar también la fórmula compartida y conserva sus colores y leyendas (requisito 7). | Usuario |
| 2026-10-23 | T1 terminada: `productService.getAllProducts` acepta `no_cost` y filtra `p.purchase_price = 0`. | Usuario |
| 2026-10-23 | T2 terminada: `frontend/src/utils/productMargin.js` (`productMargin` y `fmtMargin`), que usan el detalle y el formulario del producto. El redondeo se hace en centavos, porque en punto flotante (100 − 87.65) / 100 da 0.12349…, y 12.35% redondeaba a 12.3% en lugar de 12.4%. | Usuario |
| 2026-10-23 | T3 terminada: columnas Costo y Margen, marca "Sin costo", margen negativo en rojo y filtro "Sin costo" en `Products.jsx`, también en las tarjetas de móvil, que ahora pasan a otra línea si no caben. | Usuario |
| 2026-10-23 | T4 terminada: `shared-features/feat-costo-en-tabla-productos.md`, agregado al índice. Sus notas para portar se revisaron contra smallpos-saas: no depende de otras specs, no necesita permiso ni migración, y el cajero de saas también tiene `products.read`. | Usuario |
| 2026-10-23 | Ajuste de T3 a pedido del usuario: la columna Costo se veía desalineada, porque la marca "Sin costo" tenía fondo y padding y su texto no terminaba en el mismo borde que los montos. Pasa a texto en color de advertencia, sin fondo. | Usuario |
| 2026-10-23 | Cambio del requisito 3 a pedido del usuario: la columna se seguía viendo desalineada con el texto "Sin costo". En su lugar, un costo 0 se muestra como "$0.00" en naranja, con la ayuda "Sin costo" al pasar el cursor. Se actualizan el alcance, los requisitos 3 y 6, los tests de T3 y el criterio 2. | Usuario |
| 2026-10-23 | Se llena la evidencia de los criterios de aceptación con la copia de la base de producción, después de que el usuario probó la pantalla. Pasa a **Terminada**. | Usuario |
