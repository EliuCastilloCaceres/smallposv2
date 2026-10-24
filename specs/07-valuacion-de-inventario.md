# 07 — Valuación del inventario

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Borrador** | 2026-10-23 | 2026-10-23 |

## Objetivo

Es la **spec 3** del orden de [`docs/reportes-borrador.md`](../docs/reportes-borrador.md) (§6), con las decisiones #14–#18 de §3.4. Agrega al módulo de Reportes la pestaña **Valuación de inventario**, que responde "¿cuántos productos tengo, cuánto valen y cuánto ganaría si los vendo?". Es para supervisores, almacenistas y administradores.

**Datos de la copia de producción** (2026-10-23, una sola sucursal con stock):
- 2,177 artículos activos con stock (1,967 productos; las variantes cuentan aparte) y 18,594 unidades: 17,989 pza, 600 par, 4 paq y 1 kg.
- Valor al costo: $347,926.59. Valor a precio de venta: $633,796.46.
- 940 de esos artículos no tienen costo y valen $254,570 a precio de venta. Con ellos, la utilidad estimada da $285,870 (45.1%); sin ellos, $31,300 (8.3%).
- 8 artículos tienen precio menor al costo; varios parecen tener el costo de la caja y el precio de la pieza (por ejemplo, "bolsa de regalo desc suelt": costo $76, precio $2, 288 en stock).
- 158 artículos inactivos tienen stock: 901 unidades y $10,107.37 al costo.
- La categoría Recargas (14 artículos) es el 54% del valor al costo: $189,425.25.
- No hay apartados ni categorías ocultas.

**Base que ya existe:**
- **Spec 04:**
  - el módulo de Reportes tiene pestañas por permiso (`frontend/src/components/Reports/reportTabs.js`);
  - `resolveOptionalBranchId` (`backend/src/helpers/helper.js`) aplica el alcance por sucursal;
  - Ventas y utilidad ya tiene el patrón de tabla agrupable, ordenable y paginada, y el aviso y el filtro "Excluir ventas sin costo".
- **Spec 06:** Productos muestra un costo 0 como "$0.00" en naranja y un margen negativo en rojo.
- **Inventario:** `inventoryService.getStockByBranch` define qué stock cuenta:
  - el producto debe estar activo;
  - en un producto variable cuentan las filas de sus variantes activas, y en uno simple, la fila sin variante;
  - oculta las categorías marcadas como ocultas para la sucursal (`branch_hidden_categories`).
- **Stock:** `inventory_stock.quantity` es `decimal(12,3)` y no puede ser negativo. Un traspaso mueve el stock de las dos sucursales al confirmarse, así que no hay mercancía "en tránsito".
- **Apartados:** al crear un apartado su stock se descuenta (`layaway_reserve`). Desde la spec 03, `layaway_details.purchase_price` guarda el costo de ese día.

## Historias de usuario

- Como **supervisor**, quiero saber cuántos productos y unidades tengo y cuánto valen al costo y a precio de venta, para conocer el dinero que tengo en mercancía.
- Como **supervisor**, quiero ver la utilidad estimada del inventario por categoría, proveedor y producto, para saber dónde está el dinero y qué deja más.
- Como **administrador central**, quiero ver el inventario consolidado y el de cada sucursal, para comparar cuánto tiene cada una.
- Como **almacenista**, quiero encontrar los productos con stock sin costo, con precio menor al costo o inactivos, para corregirlos.
- Como **supervisor**, quiero ver la utilidad estimada sin los productos sin costo y sin categorías que no son mercancía (como Recargas), para no confiar en una cifra inflada.

## Alcance

**Incluye**
- Permiso `reports.inventory`, asignado por defecto a superadmin, admin, supervisor y almacenista, por migración.
- Endpoint `GET /api/reports/inventory` con KPIs, apartado, total en tienda, alertas y tabla agrupable.
- Pestaña **Valuación de inventario** con:
  - KPIs del inventario disponible y un resumen con lo apartado;
  - tabla agrupable por producto, categoría, proveedor y sucursal;
  - filtros de sucursal, categoría, proveedor, búsqueda, categorías excluidas y "Excluir productos sin costo";
  - tarjetas de alerta que filtran la tabla.
- Tests de todo lo anterior.
- **Documentación en `shared-features/`:** sí, como `feat-valuacion-de-inventario.md` (decisión del usuario, 2026-10-23).

**No incluye**
- Valuación a una fecha pasada: el reporte muestra las existencias y los precios del momento en que se consulta.
- Costo promedio ponderado: llega con el módulo de compras. Cuando exista, `products.purchase_price` será ese costo y el reporte no cambia (decisión #14).
- Lotes o FIFO (decisión #14).
- Precio de mayoreo o listas de precios: no existen.
- Stock bajo o stock mínimo por producto.
- Exportar a CSV o imprimir (decisión #30).
- Recordar los filtros entre visitas.
- Portar la pestaña a smallpos-saas: aquí solo se documenta.

## Requisitos

### Permiso y acceso
1. Una migración crea el permiso `reports.inventory` (módulo `reports`, acción `inventory`, descripción "Reporte de valuación de inventario") y lo asigna a los roles **superadmin, admin, supervisor y almacenista**, buscándolos por nombre, igual que las migraciones 003 y 004. No se asigna al cajero ni a roles creados por el usuario (decisión #29b).
2. La pantalla de permisos (`Settings/modals/PermissionsModal.jsx`) muestra la acción `inventory` como **"Inventario"**.
3. La pestaña **Valuación de inventario** se agrega a `reportTabs.js` después de Tendencia de ventas, con el permiso `reports.inventory`. El almacenista, que hoy no tiene ningún permiso de reportes, ve el menú Reportes con esta pestaña (spec 04).
4. `GET /api/reports/inventory` exige `reports.inventory` y responde 403 sin él.

### Alcance por sucursal
5. Igual que el Dashboard y las otras pestañas de reportes (decisión #18):
   - un usuario con sucursal asignada ve solo la suya; el backend la fuerza aunque mande otro `branch_id`;
   - el administrador central ve el consolidado y puede filtrar por una sucursal.

### Qué cuenta como inventario
6. Un **artículo** es un producto simple o una variante de un producto variable (decisión #17). Su costo y su precio son los del producto (`products.purchase_price` y `products.sale_price`); las variantes no tienen precio propio.
7. El **inventario disponible** son los artículos activos con stock mayor a 0, con las reglas de `getStockByBranch` (decisión #16):
   - el producto está activo;
   - en un producto variable cuentan sus variantes activas, y en uno simple, la fila sin variante. El stock que no siga esa regla (por ejemplo, una fila sin variante en un producto variable) no cuenta, igual que en Inventario.
8. A diferencia de Inventario, **sí cuentan las categorías ocultas** para la sucursal, porque es mercancía que está ahí (decisión 6 de esta spec). Si una sucursal tiene categorías ocultas, sus unidades no cuadran con la lista de Inventario.
9. Se cuenta el stock de todas las sucursales con stock, aunque la sucursal esté inactiva.

### KPIs del inventario disponible
10. Las tarjetas muestran:
    - **Artículos:** artículos distintos con stock. En el consolidado, un artículo con stock en dos sucursales cuenta una vez.
    - **Unidades,** desglosadas por unidad de medida (`products.uom`) y ordenadas de mayor a menor (decisión #17b); por ejemplo, "17,989 pza · 600 par · 4 paq · 1 kg". Las cantidades se muestran sin decimales de sobra ("85.5 kg"). Un producto sin unidad se agrupa como "sin unidad".
    - **Valor al costo:** Σ stock × costo.
    - **Valor a precio de venta:** Σ stock × precio de venta.
    - **Utilidad estimada:** valor a venta − valor al costo, con su **margen**: utilidad ÷ valor a venta × 100, calculado como en Ventas y utilidad. Con valor a venta 0, el margen es "—".
11. La pestaña dice que son las existencias y los precios al momento de consultar, con la fecha y la hora de México.

### Apartado y total en tienda
12. Un resumen debajo de los KPIs tiene tres renglones: **Disponible**, **Apartado** y **Total en tienda** (decisión #15). Cada uno con artículos, unidades por unidad de medida, valor al costo, valor a venta y utilidad estimada.
13. **Apartado** son las líneas de los apartados con estado `active` de la sucursal (o de todas, en el consolidado). Su stock ya se descontó al apartar, así que no está en el disponible.
    - Se valoran con el **costo y el precio de venta actuales** del producto, como el disponible, y no con el costo congelado ni el precio pactado del apartado (decisión 4 de esta spec).
    - Siguen las mismas reglas que el disponible: producto activo, variante activa y los mismos filtros.
14. **Total en tienda** = disponible + apartado. Los artículos se cuentan una vez aunque estén en los dos.

### Productos sin costo
15. Un artículo es **"sin costo"** cuando `products.purchase_price = 0`, la misma regla que Productos (spec 06).
16. El filtro **"Excluir productos sin costo"** empieza **apagado**, como "Excluir ventas sin costo" de la spec 04 (decisión 1 de esta spec):
    - **apagado:** todo cuenta. Si hay artículos sin costo en el resultado, un aviso dice cuántos son, cuánto valen a precio de venta y que su utilidad cuenta completa;
    - **encendido:** salen de los KPIs, del resumen y de la tabla.
17. En la tabla, al agrupar por producto, el costo de un producto sin costo se muestra como "$0.00" en naranja, como en Productos. En las demás agrupaciones, las filas que incluyen artículos sin costo dicen cuántos.

### Tabla agrupable
18. Selector **"Agrupar por"** (decisión 2 de esta spec): **producto** (por defecto), **categoría**, **proveedor** y **sucursal**. La agrupación por sucursal solo la ve el administrador central.
19. **Columnas:**
    - por producto: nombre, SKU, **unidades** con su unidad de medida, valor al costo, valor a venta, utilidad y margen;
    - en las demás: nombre del grupo, **artículos**, valor al costo, valor a venta, utilidad y margen.
20. Al agrupar por producto, las variantes se suman en su producto, como en Ventas y utilidad.
21. Por categoría, los productos sin categoría van en un grupo "Sin categoría". Por proveedor se usa el proveedor actual del producto (decisión #12).
22. Un margen negativo se muestra en rojo, como en Productos.
23. Orden por valor al costo (por defecto, de mayor a menor), valor a venta, utilidad o margen. Un empate se resuelve por nombre, y un margen sin valor va al final.
24. Paginada de 20 en 20. Los KPIs, el resumen y las alertas no cambian entre páginas.

### Filtros
25. Filtros (decisión 5 de esta spec), que se combinan entre sí y aplican a los KPIs, al resumen, a las alertas y a la tabla:
    - **Sucursal:** solo para el administrador central.
    - **Categoría:** una categoría o todas.
    - **Proveedor:** uno o todos.
    - **Búsqueda:** por nombre o SKU del producto, o SKU de una variante activa, igual que Inventario. Si coincide, cuenta el producto con todas sus variantes.
    - **Excluir categorías:** una o varias categorías que salen de todos los cálculos; por ejemplo, Recargas (decisión 7 de esta spec). Solo se pueden excluir categorías existentes, no "Sin categoría". Ver la duda 2 sobre cómo convive con el filtro de categoría.
    - **Excluir productos sin costo:** ver requisito 16. Es el único filtro que no cambia las alertas.
26. Al cambiar un filtro o la agrupación, la tabla vuelve a la página 1.

### Alertas
27. Tres tarjetas de alerta (decisión 3 de esta spec), con los filtros aplicados:
    - **Sin costo:** artículos activos con stock y costo 0, con su valor a precio de venta.
    - **Precio menor al costo:** artículos activos con stock y precio de venta menor al costo (incluye precio 0 con costo mayor a 0), con su valor al costo.
    - **Inactivos con stock:** artículos con stock cuyo producto o variante está inactivo, con sus unidades y su valor al costo. No entran en los KPIs ni en el resumen.
28. Al darle clic a una tarjeta, la tabla pasa a agrupar por producto y muestra solo esos artículos, con una etiqueta que dice qué alerta se está viendo y permite quitarla. En esa vista, cada fila suma solo los artículos de la alerta. Los KPIs y el resumen no cambian. Ver la duda 1 sobre la tarjeta "Sin costo" con el filtro de excluir encendido.
29. Una tarjeta en 0 se muestra deshabilitada.

### Endpoint
30. `GET /api/reports/inventory` recibe:
    - `branch_id`, `category_id`, `provider_id` y `search`;
    - `exclude_category_ids`: ids separados por coma;
    - `exclude_no_cost`: `true` o `1`;
    - `group_by`: `product`, `category`, `provider` o `branch`; por defecto `product`;
    - `alert`: `no_cost`, `below_cost` o `inactive`; solo con `group_by=product`;
    - `sort_by`: `cost_value`, `sale_value`, `profit` o `margin`; por defecto `cost_value`. `sort_dir`: `asc` o `desc`; por defecto `desc`;
    - `page` y `limit`.

    Responde 400 con una agrupación, alerta u orden desconocidos, con `group_by=branch` pedido por un usuario de sucursal, con `alert` y otra agrupación, o con ids que no sean enteros positivos.
31. La respuesta trae:
    - los KPIs del disponible;
    - los renglones disponible, apartado y total en tienda;
    - los artículos sin costo del resultado (cuántos y su valor a venta), para el aviso;
    - las tres alertas;
    - las filas de la página y la paginación.

### Documentación
32. `shared-features/feat-valuacion-de-inventario.md` documenta la spec con la estructura de `sf-index.md` y se agrega al índice. Sus notas para portar cubren el permiso en el catálogo de smallpos-saas y el alcance de varias sucursales por usuario.

## Tareas

- [ ] **T1. Permiso `reports.inventory`** (requisitos 1 y 2).
  — tests: después de migrar, `reports.inventory` existe y lo tienen superadmin, admin, supervisor y almacenista, pero no el cajero ni un rol creado por el usuario.
- [ ] **T2. Endpoint `GET /api/reports/inventory`** (requisitos 4–31, parte del backend).
  — tests, con stock conocido en dos sucursales:
  - **KPIs:** artículos, unidades por unidad de medida (incluidos kg con decimales), valor al costo, valor a venta, utilidad y margen cuadran con el cálculo a mano. No cuentan: una fila con stock 0, un producto inactivo, una variante inactiva ni una fila sin variante de un producto variable.
  - **Consolidado:** un artículo con stock en dos sucursales cuenta una vez en artículos y suma sus unidades.
  - **Apartado:** cuentan las líneas de un apartado activo, con el costo y el precio actuales; uno liquidado o cancelado no. El total en tienda es disponible + apartado.
  - **Sin costo:** se cuentan para el aviso; con `exclude_no_cost` salen de los KPIs, del resumen y de la tabla, y la alerta no cambia.
  - **Filtros:** categoría, proveedor, búsqueda por SKU de variante y categorías excluidas. Una categoría oculta para la sucursal sí cuenta.
  - **Tabla:** las cuatro agrupaciones (unidades por producto, artículos en las demás), las variantes sumadas en su producto, "Sin categoría", el orden con empates y margen sin valor, y la paginación (los KPIs no cambian entre páginas).
  - **Alertas:** los tres conteos, y la vista de cada alerta muestra solo sus artículos, incluidos los inactivos.
  - **Alcance:** un usuario de sucursal no ve otras aunque mande `branch_id`, y recibe 400 al agrupar por sucursal.
  - **Otros:** las respuestas 400 del requisito 30; el cajero recibe 403 y el almacenista 200.
- [ ] **T3. Pestaña Valuación de inventario** (requisitos 3 y 10–29, parte del frontend).
  — tests, con la respuesta de la API simulada:
  - **Arranque:** la pestaña aparece solo con `reports.inventory`, y un usuario con solo ese permiso ve Reportes en el menú.
  - **KPIs y resumen:** las unidades por unidad de medida ("17,989 pza · 600 par"), el margen "—" con valor a venta 0 y los renglones disponible, apartado y total en tienda.
  - **Sin costo:** el filtro empieza apagado y manda su parámetro al encenderlo; el aviso aparece; un producto sin costo muestra "$0.00" en naranja.
  - **Tabla:** unidades solo al agrupar por producto; margen negativo en rojo; el selector de sucursal y la agrupación por sucursal solo para el administrador central.
  - **Filtros:** mandan sus parámetros y vuelven a la página 1, incluidas las categorías excluidas.
  - **Alertas:** al darle clic a una tarjeta se agrupa por producto y se manda `alert`; la etiqueta la quita; una tarjeta en 0 está deshabilitada.
- [ ] **T4. Documentación en `shared-features/`** (requisito 32).
  — tests: no lleva tests de código.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | Un supervisor y un almacenista ven la pestaña Valuación de inventario; un cajero no. En la base de desarrollo, `reports.inventory` lo tienen superadmin, admin, supervisor y almacenista, y en Configuración → Roles aparece "Inventario" dentro de Reportes. | _(se llena al cerrar)_ |
| 2 | En la base de desarrollo, los artículos, las unidades, el valor al costo y el valor a venta coinciden con un cálculo SQL, y las unidades de una sucursal sin categorías ocultas coinciden con el stock de Inventario. | _(se llena al cerrar)_ |
| 3 | Cada variante cuenta como un artículo en los KPIs, y al agrupar por producto se suma en su producto. | _(se llena al cerrar)_ |
| 4 | Lo apartado aparece en su renglón, valorado con el costo y el precio actuales, y el total en tienda es disponible + apartado. | _(se llena al cerrar)_ |
| 5 | Con artículos sin costo aparece el aviso, y con "Excluir productos sin costo" dejan de contar en los KPIs, el resumen y la tabla, sin cambiar la alerta. | _(se llena al cerrar)_ |
| 6 | Cada tarjeta de alerta muestra su conteo y, al darle clic, la tabla muestra solo esos artículos. Los inactivos con stock no cuentan en los KPIs. | _(se llena al cerrar)_ |
| 7 | Los filtros de categoría, proveedor, búsqueda y categorías excluidas cambian los KPIs, el resumen, las alertas y la tabla. | _(se llena al cerrar)_ |
| 8 | Un usuario con sucursal asignada no ve el inventario de otra sucursal, ni mandando otro `branch_id`. El administrador central ve el consolidado y el desglose por sucursal. | _(se llena al cerrar)_ |
| 9 | La pestaña se ve y se usa bien en móvil. | _(se llena al cerrar)_ |
| 10 | `shared-features/feat-valuacion-de-inventario.md` existe y está en el índice. | _(se llena al cerrar)_ |
| 11 | Los tests del backend y del frontend pasan. | _(se llena al cerrar)_ |

## Dudas abiertas

1. **Tarjeta "Sin costo" con "Excluir productos sin costo" encendido.** Con el filtro encendido, esos artículos no están en la tabla, así que la vista de la alerta saldría vacía. Propuesta: al darle clic a la tarjeta se apaga el filtro de excluir y la tabla muestra esos artículos. La otra opción es deshabilitar la tarjeta mientras el filtro esté encendido, con la explicación al pasar el cursor.
2. **"Categoría" y "Excluir categorías" juntos.** Elegir una categoría y a la vez excluir otras no tiene sentido. Propuesta: "Excluir categorías" solo se habilita con "Todas las categorías"; al elegir una categoría se limpian las exclusiones, y el backend responde 400 si recibe los dos.
3. **Nombre de la pestaña.** §5 del borrador la llama "Inventario", que es el mismo nombre del módulo de Inventario del menú. Propuesta: "Valuación de inventario", y "Inventario" solo en la pantalla de permisos, dentro de Reportes.

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-23 | Antes de redactar se resolvieron 8 dudas:<br>1. Los productos sin costo se tratan como en la spec 04: filtro "Excluir productos sin costo", apagado por defecto, con aviso.<br>2. Tabla agrupable por producto, categoría, proveedor y sucursal, como en la spec 04, con las variantes sumadas en su producto.<br>3. Las alertas son tarjetas que filtran la tabla.<br>4. Lo apartado se valora con el costo y el precio actuales del producto.<br>5. Filtros de categoría, proveedor y búsqueda.<br>6. Las categorías ocultas para una sucursal sí cuentan.<br>7. Opción para excluir categorías de los cálculos, por ejemplo Recargas.<br>8. Se documenta en `shared-features/`. | Usuario |
| 2026-10-23 | Creación de la spec, en **Borrador**, con 3 dudas abiertas que surgieron al redactar. | — |
