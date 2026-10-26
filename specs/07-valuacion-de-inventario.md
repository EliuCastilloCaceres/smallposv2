# 07 — Valuación del inventario

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Terminada** | 2026-10-23 | 2026-10-26 |

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
  - filtros arriba: sucursal, categoría, proveedor, búsqueda y "Excluir del cálculo" (categorías y productos sin costo);
  - resumen del inventario disponible, con lo apartado y el total en tienda;
  - sección "Revisar captura", con accesos que filtran la tabla;
  - desglose agrupable por producto, categoría, proveedor y sucursal, ordenable desde los encabezados;
  - editar un producto desde el desglose, con el mismo formulario de Productos.
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
3. La pestaña **Valuación de inventario** se agrega a `reportTabs.js` después de Tendencia de ventas, con el permiso `reports.inventory`. No se llama "Inventario", como en §5 del borrador, para no confundirla con el módulo Inventario del menú (duda 3). El almacenista, que hoy no tiene ningún permiso de reportes, ve el menú Reportes con esta pestaña (spec 04).
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

### Resumen del inventario disponible
10. Una tarjeta de resumen muestra, con el **valor al costo** como cifra principal y el valor a venta y la utilidad junto a ella:
    - **Artículos:** artículos distintos con stock. En el consolidado, un artículo con stock en dos sucursales cuenta una vez.
    - **Unidades,** desglosadas por unidad de medida (`products.uom`) y ordenadas de mayor a menor (decisión #17b); por ejemplo, "17,989 pza · 600 par · 4 paq · 1 kg". Las cantidades se muestran sin decimales de sobra ("85.5 kg"). Un producto sin unidad se agrupa como "sin unidad".
    - **Valor al costo:** Σ stock × costo.
    - **Valor a precio de venta:** Σ stock × precio de venta.
    - **Utilidad estimada:** valor a venta − valor al costo, con su **margen**: utilidad ÷ valor a venta × 100, calculado como en Ventas y utilidad. Con valor a venta 0, el margen es "—".
11. La pestaña dice que son las existencias y los precios al momento de consultar, con la fecha y la hora de México. De arriba abajo tiene:
    1. **Filtros** (requisito 25);
    2. **Resumen** del disponible, con el aviso de productos sin costo, el apartado y el total en tienda (requisitos 10, 12 y 16);
    3. **Revisar captura**, con las alertas (requisitos 27–29);
    4. **Desglose**: el selector "Ver por", la tabla y la paginación (requisitos 18–24).

    Cada dato aparece una sola vez: los valores del disponible no se repiten en otra tabla.

### Apartado y total en tienda
12. Al pie del resumen van **Apartado** y **Total en tienda** (decisión #15), cada uno con artículos, unidades por unidad de medida, valor al costo y valor a venta. Sin apartados activos dice "Sin apartados activos" y no muestra el total en tienda, que sería igual al disponible.
13. **Apartado** son las líneas de los apartados con estado `active` de la sucursal (o de todas, en el consolidado). Su stock ya se descontó al apartar, así que no está en el disponible.
    - Se valoran con el **costo y el precio de venta actuales** del producto, como el disponible, y no con el costo congelado ni el precio pactado del apartado (decisión 4 de esta spec).
    - Siguen las mismas reglas que el disponible: producto activo, variante activa y los mismos filtros.
14. **Total en tienda** = disponible + apartado. Los artículos se cuentan una vez aunque estén en los dos.

### Productos sin costo
15. Un artículo es **"sin costo"** cuando `products.purchase_price = 0`, la misma regla que Productos (spec 06).
16. El filtro **"Productos sin costo"**, dentro de "Excluir del cálculo", empieza **apagado**, como "Excluir ventas sin costo" de la spec 04 (decisión 1 de esta spec):
    - **apagado:** todo cuenta. Si hay artículos sin costo en el resultado, un aviso dentro del resumen, junto a la utilidad, dice cuántos son, cuánto valen a precio de venta y que su utilidad cuenta completa, con el botón **"Excluirlos"**, que enciende el filtro;
    - **encendido:** salen del resumen y de la tabla. El resumen dice cuántos artículos sin costo no está contando, con el botón **"Incluirlos"**, que lo apaga.
17. En la tabla, al agrupar por producto, el costo de un producto sin costo se muestra como "$0.00" en naranja, como en Productos. En las demás agrupaciones, las filas que incluyen artículos sin costo dicen cuántos.

### Tabla agrupable
18. Arriba de la tabla, un selector de botones **"Ver por"** (decisión 2 de esta spec): **producto** (por defecto), **categoría**, **proveedor** y **sucursal**, con el número de filas a un lado ("1,967 productos"). La agrupación por sucursal solo la ve el administrador central.
19. **Columnas:**
    - por producto: nombre, SKU (no se repite si es igual al nombre), **unidades** con su unidad de medida, valor al costo, valor a venta, utilidad y margen;
    - en las demás: nombre del grupo, **artículos**, valor al costo, valor a venta, utilidad y margen.
20. Al agrupar por producto, las variantes se suman en su producto, como en Ventas y utilidad.
21. Por categoría, los productos sin categoría van en un grupo "Sin categoría". Por proveedor se usa el proveedor actual del producto (decisión #12).
22. Un margen negativo se muestra en rojo, como en Productos.
23. Orden por valor al costo (por defecto, de mayor a menor), valor a venta, utilidad o margen, con un clic en el encabezado de la columna; otro clic en la misma columna invierte el orden, y la columna ordenada muestra una flecha. En móvil, donde la tabla se ve como tarjetas, se ordena con un selector "Ordenar". Un empate se resuelve por nombre, y un margen sin valor va al final.
24. Paginada de 20 en 20. Los KPIs, el resumen y las alertas no cambian entre páginas.

### Filtros
25. Filtros (decisión 5 de esta spec), arriba de todo, que se combinan entre sí y aplican al resumen, a las alertas y a la tabla. En una fila van la búsqueda, la sucursal, la categoría y el proveedor; en otra, **"Excluir del cálculo"**, con las categorías excluidas (como etiquetas que se pueden quitar) y "Productos sin costo". En móvil se ve solo la búsqueda y un botón **"Filtros"** con el número de filtros activos, que muestra los demás:
    - **Sucursal:** solo para el administrador central.
    - **Categoría:** una categoría o todas.
    - **Proveedor:** uno o todos.
    - **Búsqueda:** por nombre o SKU del producto, o SKU de una variante activa, igual que Inventario. Si coincide, cuenta el producto con todas sus variantes.
    - **Excluir categorías:** una o varias categorías que salen de todos los cálculos; por ejemplo, Recargas (decisión 7 de esta spec). Solo se pueden excluir categorías existentes, no "Sin categoría". Solo se usa con "Todas las categorías": al elegir una categoría, las exclusiones se limpian y el control queda deshabilitado (duda 2).
    - **Productos sin costo:** ver requisito 16. Es el único filtro que no cambia las alertas.
26. Al cambiar un filtro o la agrupación, la tabla vuelve a la página 1.

### Alertas
27. La sección **"Revisar captura"** tiene tres accesos de alerta (decisión 3 de esta spec), con su conteo, su valor y los filtros aplicados:
    - **Sin costo:** artículos activos con stock y costo 0, con su valor a precio de venta.
    - **Precio menor al costo:** artículos activos con stock y precio de venta menor al costo (incluye precio 0 con costo mayor a 0), con su valor al costo.
    - **Inactivos con stock:** artículos con stock cuyo producto o variante está inactivo, con sus unidades y su valor al costo. No entran en los KPIs ni en el resumen.
28. Al darle clic a un acceso, la pantalla baja al desglose, que pasa a agrupar por producto y muestra solo esos artículos. Un aviso arriba de la tabla dice qué alerta se está viendo, aclara que el resumen no cambia y tiene el botón **"Ver todos"** para quitarla. En esa vista, cada fila suma solo los artículos de la alerta.
    - Si "Productos sin costo" está excluido, al darle clic al acceso **"Sin costo"** se apaga la exclusión y la tabla muestra esos artículos; el resumen vuelve a incluirlos (duda 1).
29. Un acceso en 0 se muestra deshabilitado.

### Endpoint
30. `GET /api/reports/inventory` recibe:
    - `branch_id`, `category_id`, `provider_id` y `search`;
    - `exclude_category_ids`: ids separados por coma;
    - `exclude_no_cost`: `true` o `1`;
    - `group_by`: `product`, `category`, `provider` o `branch`; por defecto `product`;
    - `alert`: `no_cost`, `below_cost` o `inactive`; solo con `group_by=product`;
    - `sort_by`: `cost_value`, `sale_value`, `profit` o `margin`; por defecto `cost_value`. `sort_dir`: `asc` o `desc`; por defecto `desc`;
    - `page` y `limit`.

    Responde 400 con una agrupación, alerta u orden desconocidos, con `group_by=branch` pedido por un usuario de sucursal, con `alert` y otra agrupación, con `category_id` y `exclude_category_ids` juntos, o con ids que no sean enteros positivos.
31. La respuesta trae:
    - los KPIs del disponible;
    - los renglones disponible, apartado y total en tienda;
    - los artículos sin costo del resultado (cuántos y su valor a venta), para el aviso;
    - las tres alertas;
    - las filas de la página y la paginación.

### Documentación
32. `shared-features/feat-valuacion-de-inventario.md` documenta la spec con la estructura de `sf-index.md` y se agrega al índice. Sus notas para portar cubren el permiso en el catálogo de smallpos-saas y el alcance de varias sucursales por usuario.

### Editar productos
33. Al ver por producto, incluidas las vistas de "Revisar captura", cada fila tiene un botón **Editar** que abre el mismo formulario de crear o editar producto de Productos (`Products/modals/ProductModal.jsx`), con sus validaciones. Así se capturan los costos que faltan y se corrigen precios sin salir del reporte.
    - El botón solo lo ve quien tiene `products.update`. El guardado usa `PUT /api/products/:id`, que ya pide ese permiso; no cambia ningún permiso.
    - El formulario se llena con el producto completo (`GET /api/products/:id`), igual que al editar desde Productos.
    - Al guardar, se cierra el formulario y la valuación se vuelve a pedir con los mismos filtros, orden y página, así que el resumen, las alertas y la fila reflejan el cambio.
    - En las demás agrupaciones (categoría, proveedor y sucursal) no hay botón, porque cada fila junta varios productos.
    - Esta edición se pidió después de aprobar la spec (decisión 9 de esta spec).

## Tareas

- [x] **T1. Permiso `reports.inventory`** (requisitos 1 y 2).
  — tests: después de migrar, `reports.inventory` existe y lo tienen superadmin, admin, supervisor y almacenista, pero no el cajero ni un rol creado por el usuario.
- [x] **T2. Endpoint `GET /api/reports/inventory`** (requisitos 4–31, parte del backend).
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
- [x] **T3. Pestaña Valuación de inventario** (requisitos 3 y 10–29, parte del frontend).
  — tests, con la respuesta de la API simulada:
  - **Arranque:** la pestaña aparece solo con `reports.inventory`, y un usuario con solo ese permiso ve Reportes en el menú.
  - **Resumen:** las unidades por unidad de medida ("17,989 pza · 600 par"), el margen "—" con valor a venta 0, el apartado y el total en tienda, y "Sin apartados activos" sin el total cuando no hay apartados.
  - **Sin costo:** el filtro empieza apagado y manda su parámetro al encenderlo; el aviso aparece con "Excluirlos", y encendido el resumen ofrece "Incluirlos"; un producto sin costo muestra "$0.00" en naranja.
  - **Tabla:** unidades solo al agrupar por producto; margen negativo en rojo; el SKU no se repite si es igual al nombre; el selector de sucursal y la agrupación por sucursal solo para el administrador central.
  - **Orden:** un clic en el encabezado ordena por esa columna de mayor a menor y otro lo invierte; el selector de móvil manda la columna y la dirección.
  - **Filtros:** mandan sus parámetros y vuelven a la página 1, incluidas las categorías excluidas. Al elegir una categoría, las exclusiones se limpian y el control queda deshabilitado. El botón "Filtros" muestra cuántos hay activos.
  - **Alertas:** al darle clic a un acceso se agrupa por producto y se manda `alert`; "Ver todos" la quita; un acceso en 0 está deshabilitado. Con "Productos sin costo" excluido, el clic en "Sin costo" lo vuelve a incluir.
- [x] **T4. Documentación en `shared-features/`** (requisito 32).
  — tests: no lleva tests de código.
- [x] **T5. Editar productos desde la valuación** (requisito 33). Incluye agregarlo a `shared-features/feat-valuacion-de-inventario.md`.
  — tests, con la API simulada:
  - el botón Editar aparece al ver por producto y en la vista de una alerta, y no aparece sin `products.update` ni al ver por categoría;
  - abre el formulario con el producto que devuelve `GET /api/products/:id`;
  - al guardar, se cierra el formulario y la valuación se vuelve a pedir con los mismos parámetros.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | Un supervisor y un almacenista ven la pestaña Valuación de inventario; un cajero no. En la base de desarrollo, `reports.inventory` lo tienen superadmin, admin, supervisor y almacenista, y en Configuración → Roles aparece "Inventario" dentro de Reportes. | 2026-10-26, en la base de desarrollo con la copia de producción (`marksexpressv2`), después de la migración `005`: `reports.inventory` lo tienen superadmin, admin, supervisor y almacenista; Cajero, Supervisor_Ventas y Cajero N3 no. La API responde 200 a un supervisor y a un almacenista, y 403 a un cajero (probados con tokens firmados para la prueba, porque la copia no tiene usuarios activos con esos roles). `PermissionsModal.jsx` muestra `inventory` como "Inventario". Tests `005-add-reports-inventory-permission.test.js`, `Reports.test.jsx` (la pestaña aparece con `reports.inventory`, también para un almacenista con solo ese permiso de reportes), `App.test.jsx` y `inventory.test.js` (cajero 403, almacenista 200). |
| 2 | En la base de desarrollo, los artículos, las unidades, el valor al costo y el valor a venta coinciden con un cálculo SQL, y las unidades de una sucursal sin categorías ocultas coinciden con el stock de Inventario. | 2026-10-26, copia de producción: la API da 2,177 artículos, 17,989 pza · 600 par · 4 paq · 1 kg, $347,926.59 al costo y $633,796.46 a venta, igual que un cálculo SQL sobre `inventory_stock`. Las 18,594 unidades coinciden con la suma que hace `getStockByBranch` (Inventario) en la sucursal 1, que no tiene categorías ocultas. Por categoría también coincide con SQL; por ejemplo, Abarrotes: 630 artículos y $40,217.03. |
| 3 | Cada variante cuenta como un artículo en los KPIs, y al agrupar por producto se suma en su producto. | 2026-10-26, copia de producción: el producto 10109 tiene 8 tallas con stock. Buscándolo, los KPIs cuentan 8 artículos y la tabla por producto tiene una sola fila con sus 10 unidades. En total hay 2,177 artículos en 1,967 filas de producto. Test `inventory.test.js` (la talla 28 inactiva no cuenta y la fila sin variante de un producto variable tampoco). |
| 4 | Lo apartado aparece en su renglón, valorado con el costo y el precio actuales, y el total en tienda es disponible + apartado. | 2026-10-26: la copia de producción no tiene apartados, así que el resumen dice "Sin apartados activos" y no repite el total en tienda. Test `inventory.test.js`: con un apartado activo en cada sucursal, otro liquidado y otro cancelado, el apartado da 3 artículos, 3 pza + 1 kg, $340 al costo y $660 a venta con el costo y el precio de hoy (no los del apartado), y el total en tienda, 6 artículos, $1,588 y $2,900. Test `InventoryTab.test.jsx`: muestra el apartado y el total, o "Sin apartados activos" sin el total. |
| 5 | Con artículos sin costo aparece el aviso, y con "Excluir productos sin costo" dejan de contar en los KPIs, el resumen y la tabla, sin cambiar la alerta. | 2026-10-26, copia de producción: el aviso dice que la utilidad incluye 940 artículos sin costo, que valen $254,570.00 a precio de venta. Al excluirlos, el resumen pasa a 1,237 artículos, $347,926.59 al costo, $379,226.46 a venta y 8.25% de margen (antes 45.1%), y la alerta sigue en 940. Tests `inventory.test.js` y `InventoryTab.test.jsx` ("Excluirlos" e "Incluirlos"). |
| 6 | Cada tarjeta de alerta muestra su conteo y, al darle clic, la tabla muestra solo esos artículos. Los inactivos con stock no cuentan en los KPIs. | 2026-10-26, copia de producción: sin costo 940 artículos ($254,570.00 a venta), precio menor al costo 8 ($38,481.50 al costo) e inactivos con stock 158 ($10,107.37 al costo). La vista de inactivos tiene 157 filas de producto y el resumen sigue en 2,177 artículos. Revisado en pantalla (Edge sin ventana, 1366 px): al tocar "Precio menor al costo" la pantalla baja al desglose, que muestra los 8 productos con el aviso "Mostrando solo" y "Ver todos". Tests `inventory.test.js` y `InventoryTab.test.jsx`. |
| 7 | Los filtros de categoría, proveedor, búsqueda y categorías excluidas cambian los KPIs, el resumen, las alertas y la tabla. | 2026-10-26, copia de producción: categoría Abarrotes, 630 artículos y $40,217.03 (14 inactivos); proveedor Barcel, 43 artículos y $2,070.64 (7 inactivos); búsqueda "10109", 8 artículos; excluyendo Recargas, 1,926 artículos, $338,393.71 al costo y 778 sin costo. Tests `inventory.test.js` (filtros sobre el resumen, el apartado, las alertas y la tabla) y `InventoryTab.test.jsx` (parámetros, página 1 y exclusiones solo con "Todas las categorías"). |
| 8 | Un usuario con sucursal asignada no ve el inventario de otra sucursal, ni mandando otro `branch_id`. El administrador central ve el consolidado y el desglose por sucursal. | 2026-10-26, copia de producción: un supervisor de la sucursal 1 que manda `branch_id=5` recibe lo mismo que la sucursal 1 vista por el administrador central (2,177 artículos, $347,926.59), y responde 400 si pide agrupar por sucursal. El administrador central ve el consolidado; por sucursal, una fila (Sucursal Central), y la sucursal 5 (Sucursal Norte, inactiva y sin stock) da 0. Test `inventory.test.js` con stock en dos sucursales. |
| 9 | La pestaña se ve y se usa bien en móvil. | 2026-10-26: revisado en Edge sin ventana con el ancho de un teléfono (390 px) sobre la copia de producción: la búsqueda y el botón "Filtros" arriba, el resumen en dos columnas, los accesos de "Revisar captura" apilados y el desglose como tarjetas, con el selector "Ordenar". No se revisó en un teléfono real. |
| 10 | `shared-features/feat-valuacion-de-inventario.md` existe y está en el índice. | 2026-10-26: el archivo existe, está en la tabla del índice (`sf-index.md`) y describe también la pantalla reestructurada y la edición de productos. |
| 11 | Los tests del backend y del frontend pasan. | 2026-10-26: backend 147/147 (22 archivos), frontend 133/133 (19 archivos); `vite build` compila. |
| 12 | Con `products.update`, un producto se edita desde el desglose con el formulario de Productos y, al guardar, la valuación se actualiza; sin ese permiso no aparece el botón. | 2026-10-26: revisado en pantalla sobre la copia de producción: cada fila por producto tiene el botón Editar, y en "bolsa de regalo desc suelt" abre el formulario de Productos con su información completa y el aviso "Vendiendo a pérdida". No se guardó ningún cambio en la copia. Test `InventoryTab.test.jsx`: el botón aparece al ver por producto y en la vista de una alerta, no aparece sin `products.update` ni al ver por categoría, abre el producto de `GET /api/products/:id`, y al guardar se cierra el formulario y la valuación se vuelve a pedir con los mismos parámetros. |

## Dudas abiertas

- _Ninguna._

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-23 | Antes de redactar se resolvieron 8 dudas:<br>1. Los productos sin costo se tratan como en la spec 04: filtro "Excluir productos sin costo", apagado por defecto, con aviso.<br>2. Tabla agrupable por producto, categoría, proveedor y sucursal, como en la spec 04, con las variantes sumadas en su producto.<br>3. Las alertas son tarjetas que filtran la tabla.<br>4. Lo apartado se valora con el costo y el precio actuales del producto.<br>5. Filtros de categoría, proveedor y búsqueda.<br>6. Las categorías ocultas para una sucursal sí cuentan.<br>7. Opción para excluir categorías de los cálculos, por ejemplo Recargas.<br>8. Se documenta en `shared-features/`. | Usuario |
| 2026-10-23 | Creación de la spec, en **Borrador**, con 3 dudas abiertas que surgieron al redactar. | — |
| 2026-10-23 | Se resuelven las 3 dudas:<br>1. Con "Excluir productos sin costo" encendido, el clic en la tarjeta "Sin costo" apaga el filtro y la tabla muestra esos artículos (requisito 28).<br>2. "Excluir categorías" solo se usa con "Todas las categorías": al elegir una categoría se limpian las exclusiones, y el backend responde 400 si recibe los dos (requisitos 25 y 30).<br>3. La pestaña se llama "Valuación de inventario", y la acción del permiso se muestra como "Inventario" (requisito 3). | Usuario |
| 2026-10-23 | Se aprueba la spec: pasa a **Lista**. | Usuario |
| 2026-10-23 | T1 terminada: migración `005-add-reports-inventory-permission.sql` y la etiqueta "Inventario" en Permisos. | Usuario |
| 2026-10-23 | T2 terminada: `GET /api/reports/inventory` en `reportService.getInventoryReport`. La vista de una alerta muestra los mismos artículos que cuenta su tarjeta, así que, como la tarjeta, no la cambia "Excluir productos sin costo" (requisitos 25 y 28). | Usuario |
| 2026-10-23 | T3 terminada: `Reports/tabs/InventoryTab.jsx` y la pestaña en `reportTabs.js`. Los tests encontraron un error: al cambiar la agrupación, la tabla se volvía a dibujar con las filas anteriores antes de que llegara la respuesta y fallaba. Ahora se dibuja con la agrupación de las filas que ya llegaron. | Usuario |
| 2026-10-23 | T4 terminada: `shared-features/feat-valuacion-de-inventario.md`, agregado al índice. Sus notas para portar se revisaron contra smallpos-saas: depende de la spec 04 por las pestañas de Reportes, no de la 03, y el permiso va también en la plantilla de Almacenista. | Usuario |
| 2026-10-23 | Reestructuración de la pantalla a pedido del usuario, que la encontró confusa: la tabla quedaba hasta abajo, los valores del disponible se repetían tres veces (tarjetas, renglón "Disponible" y "Total en tienda" sin apartados), los filtros estaban a la mitad aunque cambian todo lo de arriba y las alertas se veían como KPIs. Ahora van, de arriba abajo, filtros, un resumen con el valor al costo como cifra principal (con el aviso de sin costo, el apartado y el total), "Revisar captura" y el desglose con "Ver por" y orden desde los encabezados. En móvil, los filtros se abren con un botón. No cambian el endpoint ni los cálculos. Se actualizan el alcance, los requisitos 10–12, 16, 18, 19, 23, 25 y 27–29, y los tests de T3. | Usuario |
| 2026-10-26 | Se agrega la edición de productos desde el desglose (requisito 33, T5 y criterio 12), a pedido del usuario. Se resolvieron 2 dudas:<br>9. Se edita con el mismo formulario de Productos, con un botón Editar por producto, solo con `products.update`; al guardar, la valuación se recalcula.<br>10. El rediseño de las pestañas Ventas y utilidad y Tendencia de ventas, pedido en el mismo mensaje, va en su propia spec (08), después de cerrar esta. | Usuario |
| 2026-10-26 | T5 terminada: botón Editar en cada producto del desglose, que abre `Products/modals/ProductModal.jsx` y al guardar vuelve a pedir la valuación. Como las variables de `products.css` viven en `.prd-root`, la pestaña importa ese CSS y envuelve el formulario en un `div.prd-root`, para que se vea igual que en Productos. Agregado a `shared-features/feat-valuacion-de-inventario.md`. | Usuario |
| 2026-10-26 | Se llena la evidencia de los 12 criterios de aceptación con la copia de la base de producción. Queda en **Lista** hasta que el usuario apruebe pasarla a Terminada. | — |
| 2026-10-26 | Se aprueba el cierre: pasa a **Terminada**. | Usuario |
| 2026-10-26 | La spec 09 (`specs/09-filtro-de-costo-en-productos.md`) cambia el nombre de la alerta "Precio menor al costo" a **"Costo mayor al precio"**, el mismo que usa Productos. Solo cambia el texto: `alert=below_cost` y el cálculo siguen igual. | Usuario |
