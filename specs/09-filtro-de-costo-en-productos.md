# 09 — Filtro de costo en Productos

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Terminada** | 2026-10-26 | 2026-10-26 |

## Objetivo

Amplía el filtro de costo de **Productos** para encontrar, además de los productos sin costo, los que tienen el **costo mayor al precio** de venta, y marca esos costos en la tabla. Son los dos errores de captura que inflan o desfiguran la utilidad de los reportes. Lo pidió el usuario el 2026-10-26.

**Datos de la copia de producción** (2026-10-26):
- Activos: 844 sin costo y 8 con el costo mayor al precio (uno de ellos con precio de venta 0).
- Inactivos: 289 sin costo y 5 con el costo mayor al precio.
- Varios de los de costo mayor al precio parecen tener el costo de la caja y el precio de la pieza (por ejemplo, "bolsa de regalo desc suelt": costo $76, precio $2).

**Base que ya existe:**
- **Spec 06:**
  - Productos tiene un selector de costo con "Con y sin costo" y "Sin costo", que manda `no_cost=true` a `GET /api/products` (`productService.getAllProducts`);
  - en la tabla y en las tarjetas, un costo 0 se muestra como "$0.00" en naranja con la ayuda "Sin costo", y un margen negativo en rojo (`Products.jsx`, `CostValue` y `MarginValue`).
- **Spec 07:** Valuación de inventario usa la misma regla en su alerta "Precio menor al costo" (`p.sale_price < p.purchase_price`, `alert=below_cost`).

## Historias de usuario

- Como **administrador**, quiero listar los productos con el costo mayor al precio de venta, para corregir el costo o el precio.
- Como **administrador**, quiero ver juntos los productos sin costo y los de costo mayor al precio, para revisar en una sola lista todo lo que está mal capturado.
- Como **supervisor**, quiero distinguir en la tabla los costos mayores al precio, para no tener que fijarme en el margen.

## Alcance

**Incluye**
- El selector de costo de Productos pasa a tener cuatro opciones: todos, sin costo, costo mayor al precio, y los dos casos juntos.
- El parámetro `cost_issue` en `GET /api/products`.
- El costo en rojo cuando es mayor al precio, en la tabla y en las tarjetas.
- La alerta "Precio menor al costo" de Valuación de inventario pasa a llamarse "Costo mayor al precio".
- Tests de todo lo anterior.
- **Documentación en `shared-features/`:** sí, como `feat-filtro-de-costo-en-productos.md` (decisión del usuario, 2026-10-26).

**No incluye**
- Cambiar quién ve el costo o los permisos: sigue siendo `products.read`, como en la spec 06.
- Ordenar la tabla por costo o por margen.
- Editar el costo o el precio desde la tabla: se editan en el formulario, como hoy.
- Corregir los costos y precios mal capturados: es una tarea de datos.
- Otras pantallas, salvo el nombre de la alerta de Valuación.

## Requisitos

### Regla
1. Un producto tiene el **costo mayor al precio** cuando `purchase_price > sale_price`. Incluye un precio de venta 0 con costo mayor a 0. Es la misma regla de la alerta de Valuación de inventario. Un producto sin costo (`purchase_price = 0`) nunca cumple esta regla.

### Filtro en Productos
2. El selector de costo (con la etiqueta accesible "Costo") tiene cuatro opciones; la primera es la de por defecto:
   - **Todos los costos**;
   - **Sin costo**;
   - **Costo mayor al precio**;
   - **Sin costo o costo mayor al precio**.
3. Se combina con la búsqueda, la categoría, el proveedor y el estado. Al cambiarlo se vuelve a la página 1, y el contador "N productos encontrados" refleja el filtro, como en la spec 06.

### Endpoint
4. `GET /api/products` acepta `cost_issue`:
   - `no_cost`: solo los productos con `purchase_price = 0`;
   - `above_price`: solo los de costo mayor al precio;
   - `any`: los que cumplen cualquiera de las dos.

   El total de la paginación cuenta solo esos. Sin el parámetro, la respuesta no cambia. Con otro valor responde 400. Pide el mismo permiso de siempre (`products.read`).
5. `no_cost=true` sigue funcionando igual (spec 06). La pantalla pasa a usar `cost_issue`.

### Marca en la tabla
6. En la tabla y en las tarjetas de móvil, un costo mayor al precio se muestra **en rojo**, con la ayuda "Costo mayor al precio de venta" al pasar el cursor. El margen sigue en rojo como hoy, y el costo 0 sigue en naranja con "Sin costo".

### Nombre en Valuación de inventario
7. La alerta "Precio menor al costo" de Valuación de inventario, y su aviso "Mostrando solo", pasan a decir **"Costo mayor al precio"**. Solo cambia el texto: el parámetro `alert=below_cost` y el cálculo no cambian. Se anota en el historial de la spec 07.

### Documentación
8. `shared-features/feat-filtro-de-costo-en-productos.md` documenta la spec con la estructura de `sf-index.md` y se agrega al índice. En `feat-valuacion-de-inventario.md` se actualiza el nombre de la alerta.

## Tareas

- [x] **T1. Parámetro `cost_issue` en `GET /api/products`** (requisitos 1, 4 y 5).
  — tests de integración:
  - `no_cost`, `above_price` y `any` devuelven solo esos productos, y el total cuenta solo esos; `above_price` incluye uno con precio 0 y excluye uno con el costo igual al precio;
  - se combina con `is_active`, `category_id` y `search`;
  - sin el parámetro vienen todos, y `no_cost=true` sigue funcionando;
  - un valor desconocido responde 400;
  - un cajero, con `products.read`, lo puede usar.
- [x] **T2. Filtro y marca en Productos** (requisitos 2, 3 y 6).
  — tests, con la API simulada:
  - el selector tiene las cuatro opciones y empieza en "Todos los costos";
  - cada opción manda su `cost_issue`, vuelve a la página 1 y se combina con la categoría;
  - un costo mayor al precio sale en rojo con su ayuda, en la tabla y en las tarjetas; un costo 0 sigue en naranja y un costo normal no se marca.
- [x] **T3. Nombre de la alerta en Valuación** (requisito 7).
  — tests: `InventoryTab.test.jsx` usa el nombre nuevo en el acceso y en el aviso "Mostrando solo".
- [x] **T4. Documentación** (requisito 8).
  — tests: no lleva tests de código.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | En la base de desarrollo, "Sin costo", "Costo mayor al precio" y "Sin costo o costo mayor al precio" listan solo esos productos, y el contador coincide con un conteo en la base. | 2026-10-26, copia de producción (`marksexpressv2`): con `cost_issue`, la API da 844 sin costo, 8 con el costo mayor al precio y 852 con los dos, igual que un conteo SQL de los productos activos (`purchase_price = 0`, `purchase_price > sale_price` y la unión). En pantalla, "Costo mayor al precio" muestra "8 productos encontrados", entre ellos "vive100 ultra" (costo $12.00, precio $0.00). El usuario lo probó en el navegador. Tests `list-cost-issue.test.js` (las tres opciones con su total, precio 0, costo igual al precio que no cuenta y sin costo que no cuenta como costo mayor al precio). |
| 2 | El filtro se combina con la búsqueda, la categoría, el proveedor y el estado. | 2026-10-26, copia de producción: "Costo mayor al precio" con los inactivos da 5 productos, igual que SQL. Tests `list-cost-issue.test.js` (estado, categoría y búsqueda) y `Products.test.jsx` (vuelve a la página 1 y conserva la categoría). |
| 3 | Un costo mayor al precio se ve en rojo con su ayuda, en la tabla y en las tarjetas; el costo 0 sigue en naranja. | 2026-10-26: revisado en pantalla (Edge sin ventana, 1366 px y 390 px) sobre la copia de producción: los 8 costos salen en rojo en la tabla y en las tarjetas, junto con el margen negativo. Test `Products.test.jsx`: el costo mayor al precio lleva `prd-cost-above` y la ayuda "Costo mayor al precio de venta" en la tabla y en las tarjetas; el costo 0 sigue con `prd-no-cost` y un costo normal no se marca. |
| 4 | En Valuación de inventario, la alerta dice "Costo mayor al precio" y sigue contando lo mismo. | 2026-10-26: el acceso y el aviso "Mostrando solo" de Valuación dicen "Costo mayor al precio"; `alert=below_cost` y el cálculo no cambiaron. Test `InventoryTab.test.jsx` (30 tests) con el nombre nuevo. |
| 5 | `no_cost=true` sigue funcionando como en la spec 06. | 2026-10-26, copia de producción: `no_cost=true` sigue dando 844 productos. Los 4 tests de `list-no-cost.test.js` (spec 06) pasan sin cambios, y `list-cost-issue.test.js` lo comprueba otra vez. |
| 6 | El filtro se ve y se usa bien en móvil. | 2026-10-26: revisado en Edge sin ventana con el ancho de un teléfono (390 px): las tarjetas muestran el costo en rojo. El selector "Costo" está en la fila de filtros de Productos, que en móvil se desliza de lado como los demás filtros (comportamiento de antes de esta spec). No se revisó en un teléfono real. |
| 7 | `shared-features/feat-filtro-de-costo-en-productos.md` existe y está en el índice. | 2026-10-26: el archivo existe y está en la tabla del índice (`sf-index.md`). `feat-valuacion-de-inventario.md` tiene el nombre nuevo de la alerta. |
| 8 | Los tests del backend y del frontend pasan. | 2026-10-26: backend 156/156 (23 archivos), frontend 159/159 (21 archivos); `vite build` compila. |

## Dudas abiertas

- _Ninguna._

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-26 | Antes de redactar se resolvieron 5 dudas:<br>1. Primero se cierra la spec 08.<br>2. El selector de costo tiene cuatro opciones: todos, sin costo, costo mayor al precio y los dos juntos.<br>3. El costo mayor al precio se marca en rojo, además del margen.<br>4. Se documenta en `shared-features/`.<br>5. El nombre es "Costo mayor al precio", también en la alerta de Valuación de inventario. | Usuario |
| 2026-10-26 | Creación de la spec, en **Borrador**. | — |
| 2026-10-26 | Se aprueba la spec: pasa a **Lista**. | Usuario |
| 2026-10-26 | T1 terminada: `productService.getAllProducts` acepta `cost_issue` (`no_cost`, `above_price` o `any`) y responde 400 con otro valor. El valor se valida con `Object.hasOwn`, para que una clave heredada como `toString` no pase. | Usuario |
| 2026-10-26 | T2 terminada: el selector "Costo" de `Products.jsx` tiene las cuatro opciones y manda `cost_issue`; `CostValue` muestra en rojo (`.prd-cost-above`) un costo mayor al precio, en la tabla y en las tarjetas. | Usuario |
| 2026-10-26 | T3 terminada: la alerta de Valuación dice "Costo mayor al precio", en el acceso y en el aviso "Mostrando solo". Anotado en el historial de la spec 07 y en `feat-valuacion-de-inventario.md`. | Usuario |
| 2026-10-26 | T4 terminada: `shared-features/feat-filtro-de-costo-en-productos.md`, agregado al índice. Sus notas para portar se revisaron contra smallpos-saas: depende de portar antes la spec 06. | Usuario |
| 2026-10-26 | Se llena la evidencia de los 8 criterios de aceptación con la copia de la base de producción, después de que el usuario lo probó en el navegador. Pasa a **Terminada**. | Usuario |
