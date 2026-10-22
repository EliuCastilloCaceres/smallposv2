# 06 — Costo y margen en la tabla de productos

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Borrador** | 2026-10-22 | 2026-10-22 |

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
- La marca **"Sin costo"** en los productos con costo 0.
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
3. **Costo:** el `purchase_price` en pesos, con el mismo formato que Precio venta. Si es 0, en lugar de "$0.00" aparece la marca **"Sin costo"**, con color de advertencia.
4. **Margen:** (precio venta − costo) ÷ precio venta × 100, con un decimal y el signo %, igual que en el detalle del producto.
   - Sin costo, o con precio de venta 0, muestra **"—"**.
   - Si el costo es mayor que el precio, el margen sale negativo (por ejemplo, "−12.5%") y en rojo.
5. Los productos variables muestran el costo y el margen del producto, porque sus variantes no tienen costo propio.

### Móvil
6. Las tarjetas muestran **Costo** (o "Sin costo") y **Margen** junto a Venta y UM, con las mismas reglas de la tabla.

### Fórmula compartida
7. La fórmula del margen vive en un solo lugar del frontend y la usan la tabla, las tarjetas y el detalle del producto. Para un mismo producto, la tabla y el detalle muestran el mismo margen.

### Filtro "Sin costo"
8. Un selector nuevo en los filtros, con las opciones **"Con y sin costo"** (por defecto) y **"Sin costo"**. Se combina con la búsqueda, la categoría, el proveedor y el estado. Al cambiarlo se vuelve a la página 1, como con los demás filtros, y el contador "N productos encontrados" refleja el filtro.
9. `GET /api/products` acepta `no_cost=true`: devuelve solo los productos con `purchase_price = 0`, y el total de la paginación cuenta solo esos. Sin el parámetro, o con cualquier otro valor, la respuesta no cambia. Pide el mismo permiso de siempre (`products.read`).

### Documentación
10. `shared-features/feat-costo-en-tabla-productos.md` documenta la spec con la estructura de `sf-index.md` y se agrega al índice.

## Tareas

- [ ] **T1. Filtro `no_cost` en `GET /api/products`** (requisito 9).
  — tests de integración:
  - con `no_cost=true` solo vienen productos con costo 0, y el total de la paginación cuenta solo esos;
  - se combina con `is_active`, `category_id` y `search`;
  - sin el parámetro, o con `no_cost=false`, vienen todos, como antes;
  - un cajero, con `products.read`, lo puede usar.
- [ ] **T2. Fórmula de margen compartida** (requisitos 4 y 7).
  — tests: margen normal, negativo, sin costo y con precio 0, y el redondeo a un decimal. El detalle del producto usa la misma fórmula.
- [ ] **T3. Columnas, marca y filtro en Productos** (requisitos 1–6 y 8).
  — tests, con la API simulada:
  - la tabla muestra Costo y Margen en su lugar, también para un usuario sin `products.update`;
  - un producto con costo 0 muestra "Sin costo" y margen "—";
  - un margen negativo sale en rojo;
  - las tarjetas de móvil muestran costo y margen;
  - el filtro manda `no_cost=true`, vuelve a la página 1 y se combina con los demás filtros.
- [ ] **T4. Documentación en `shared-features/`** (requisito 10).
  — tests: no lleva tests de código.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | En Productos, la tabla muestra Costo y Margen, también a un usuario que solo tiene `products.read`. | _(se llena al cerrar)_ |
| 2 | Un producto con costo 0 muestra "Sin costo" y margen "—". | _(se llena al cerrar)_ |
| 3 | El margen de un producto en la tabla coincide con el de su detalle. | _(se llena al cerrar)_ |
| 4 | Un producto con costo mayor que su precio muestra el margen negativo en rojo. | _(se llena al cerrar)_ |
| 5 | En la base de desarrollo, el filtro "Sin costo" lista solo los productos sin costo, el contador coincide con un conteo en la base, y se combina con los demás filtros. | _(se llena al cerrar)_ |
| 6 | En móvil, las tarjetas muestran el costo y el margen. | _(se llena al cerrar)_ |
| 7 | `shared-features/feat-costo-en-tabla-productos.md` existe y está en el índice. | _(se llena al cerrar)_ |
| 8 | Los tests del backend y del frontend pasan. | _(se llena al cerrar)_ |

## Dudas abiertas

1. **El margen en el detalle del producto.** Hoy, sin costo, el detalle muestra un margen de 100.0%, y con precio de venta 0 muestra un valor inválido ("NaN%" o "-Infinity%"). Si comparte la fórmula con la tabla (requisito 7), en esos dos casos pasaría a mostrar "—". ¿Se cambia así? Propuesta: sí, para que la tabla y el detalle nunca digan cosas distintas.

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-22 | Antes de redactar se resolvieron 4 dudas:<br>1. Primero se cierra la spec 05.<br>2. Las columnas las ve todo el que ve Productos, como el costo en el detalle.<br>3. Además del costo: la marca "Sin costo", la columna de margen y el filtro "Sin costo".<br>4. Se documenta en `shared-features/`. | Usuario |
| 2026-10-22 | Creación de la spec, en **Borrador**, con 1 duda abierta. | — |
