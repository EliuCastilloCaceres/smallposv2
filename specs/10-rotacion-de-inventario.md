# 10 — Rotación de inventario

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Terminada** | 2026-10-26 | 2026-10-27 |

## Objetivo

Es la **spec 4** del orden de [`docs/reportes-borrador.md`](../docs/reportes-borrador.md) (§6), con las decisiones #23–#28 de §3.6. Agrega al módulo de Reportes la pestaña **Rotación de inventario**, que responde "¿qué productos llevan tiempo sin venderse, cuánto dinero tengo detenido en ellos y qué puedo hacer para moverlos?". Es para supervisores, almacenistas y administradores.

**Datos de la copia de producción** (2026-10-26):
- Hay una sola sucursal activa con stock (Sucursal Central). Sucursal Norte está inactiva y sin stock, así que hoy no saldría ninguna sugerencia de traspaso.
- Las órdenes empiezan en abril de 2024 (91,175), pero los movimientos de inventario empiezan el **2026-08-25**, cuando arrancó este sistema. Antes de esa fecha, las ventas no tienen movimiento.
- Antes del 2026-08-25, las ventas de productos con variantes no guardan la variante (976 líneas); desde entonces sí (44 de 47).
- Hay 1,968 productos con stock disponible, que valen $338,040.27 al costo.
- **Sin venta en 30 días o más:** 1,298 productos con $193,750.36 al costo. Con 60 días son 1,069; con 90, 924, y con 180, 718.
  - 302 nunca se han vendido en la sucursal. 266 de ellos no tienen un movimiento que marque su llegada, porque su stock ya estaba antes del 2026-08-25.
- **Recargas:** 5 productos sin movimiento valen $106,362.00 al costo, el 55% del total. Por ejemplo, "Recarga500" tiene 105 piezas y nunca se ha vendido.
- **Sin Recargas:** son 1,293 productos y $87,388.36 al costo, el 59% del inventario disponible al costo ($148,615.02). De ellos:
  - 610 no tienen costo; valen $201,487.50 a precio de venta;
  - 675 tienen margen para una rebaja;
  - 8 tienen el costo mayor o igual al precio.
  - En el tramo de 90 días o más, 270 de los 438 productos con costo tienen un margen menor al 30%, así que su rebaja se detiene en el costo.

**Base que ya existe:**
- **Spec 03:** el índice `idx_invmov_branch_product_created` en `inventory_movements`, pensado para esta pestaña, y los índices de fecha de `orders`.
- **Spec 05:** `getTrendReport` recibe la fecha de hoy, así que sus tests no dependen del reloj.
- **Spec 07:** las reglas del inventario disponible (requisito 7), los filtros con "Excluir del cálculo" (requisito 25), el aviso de productos sin costo (requisito 16) y la edición de productos desde el desglose (requisito 33).
- **Spec 08:** las piezas compartidas de Reportes en `frontend/src/components/Reports/components/`: la tarjeta de filtros con su botón "Filtros" de móvil, los botones de grupo, el encabezado ordenable y el aviso del resumen.
- **Zona horaria:** `createdAtMx` y `todayInMexico` (`backend/src/utils/timezone.js`).

## Historias de usuario

- Como **supervisor**, quiero ver qué productos llevan tiempo sin venderse y cuánto dinero tengo detenido en ellos, para decidir qué hacer con ese inventario.
- Como **supervisor**, quiero una sugerencia concreta por producto (traspasarlo, rebajarlo o promocionarlo), para moverlo sin vender abajo del costo.
- Como **almacenista**, quiero saber qué productos se venden en otra sucursal y en la mía no, para proponer traspasos.
- Como **administrador central**, quiero ver la rotación consolidada y la de cada sucursal, para comparar.
- Como **supervisor**, quiero excluir las categorías que no son mercancía (como Recargas) y los productos sin costo, para no confiar en una cifra inflada.

## Alcance

**Incluye**
- Permiso `reports.rotation`, asignado por defecto a superadmin, admin, supervisor y almacenista, por migración.
- Endpoint `GET /api/reports/rotation` con el resumen, el aviso de productos sin costo y la lista paginada con sus sugerencias.
- Pestaña **Rotación de inventario** con:
  - filtros arriba: días sin venta, sucursal, categoría, proveedor, búsqueda y "Excluir del cálculo" (categorías y productos sin costo);
  - resumen de los productos sin movimiento, con el valor detenido al costo como cifra principal;
  - lista de productos sin movimiento, ordenable desde los encabezados, con sugerencias de traspaso, rebaja y promoción;
  - editar un producto desde la lista, con el mismo formulario de Productos.
- Tests de todo lo anterior.
- **Documentación en `shared-features/`:** sí, como `feat-rotacion-de-inventario.md` (decisión del usuario, 2026-10-26).

**No incluye**
- Crear traspasos desde el reporte: se crean en Inventario, como hoy (decisión #28).
- Llenar el formulario de edición con el precio sugerido: se captura a mano (requisito 37).
- Rotación por variante (decisión 1 de esta spec).
- Módulo de ubicaciones dentro de la sucursal (decisión #24) ni de promociones (decisión #25).
- Pantalla para configurar las reglas o guardar el periodo elegido (decisiones #23 y #27).
- Agrupar la lista por categoría, proveedor o sucursal: los filtros cubren esa consulta.
- Velocidad de venta o días de inventario.
- Exportar a CSV o imprimir (decisión #30).
- Portar la pestaña a smallpos-saas: aquí solo se documenta.

## Requisitos

### Permiso y acceso
1. Una migración crea el permiso `reports.rotation` (módulo `reports`, acción `rotation`, descripción "Reporte de rotación de inventario") y lo asigna a los roles **superadmin, admin, supervisor y almacenista**, buscándolos por nombre, igual que las migraciones 003 a 005. No se asigna al cajero ni a roles creados por el usuario (decisión #29b).
2. La pantalla de permisos (`Settings/modals/PermissionsModal.jsx`) muestra la acción `rotation` como **"Rotación"**.
3. La pestaña **Rotación de inventario** se agrega a `reportTabs.js` después de Valuación de inventario, con el permiso `reports.rotation`.
4. `GET /api/reports/rotation` exige `reports.rotation` y responde 403 sin él.

### Alcance por sucursal
5. Igual que el Dashboard y las otras pestañas de reportes (decisión #31):
   - un usuario con sucursal asignada ve solo la suya; el backend la fuerza aunque mande otro `branch_id`;
   - el administrador central ve el consolidado y puede filtrar por una sucursal.
6. La rotación se mide por sucursal, así que **cada fila es un producto en una sucursal**. En el consolidado, un producto sin movimiento en dos sucursales aparece en dos filas y cuenta dos veces en el resumen.

### Qué productos entran
7. Se trabaja **por producto**, con las variantes sumadas (decisión 1 de esta spec), porque las ventas anteriores al 2026-08-25 no guardan la variante.
8. El stock de cada fila es el **disponible** del producto en la sucursal, con las reglas de Valuación (spec 07, requisitos 7–9):
   - el producto está activo;
   - en un producto variable cuentan sus variantes activas, y en uno simple, la fila sin variante;
   - cuentan las categorías ocultas para la sucursal y las sucursales inactivas con stock.

   Lo apartado no cuenta, porque ya se descontó del stock.
9. Un producto está **sin movimiento** cuando tiene stock disponible mayor a 0 y sus **días sin venta** son iguales o mayores al periodo elegido (requisito 31).

### Días sin venta
10. Cuenta como **venta** del producto en la sucursal:
    - una orden de la sucursal con estado `completed`, `partial_refund` o `refunded` que lo incluya, con cualquier variante o sin variante. Una orden cancelada no cuenta. Un apartado liquidado ya es una orden, con la fecha en que se liquidó;
    - la creación de un apartado **activo** de la sucursal que lo incluya, porque el cliente ya eligió el producto. Uno cancelado no cuenta (decisión 6 de esta spec).
11. La última venta se toma de las órdenes y los apartados, no de `inventory_movements`, porque los movimientos empiezan el 2026-08-25 y las órdenes en 2024.
12. **Días sin venta** = fecha de hoy en México − fecha en México de la última venta, en días de calendario. Un producto vendido hoy tiene 0.
13. Si el producto **nunca se vendió** en la sucursal, los días se cuentan desde su llegada (decisión #23b):
    - desde su **primer movimiento** de inventario en la sucursal;
    - si no tiene movimientos, o si el primero ya encontró existencias (`quantity_before > 0`), su stock se cargó antes de que el sistema registrara movimientos. En ese caso se cuenta desde la **fecha de alta del producto** (`products.created_at`) (decisión 7 de esta spec).

    En lugar de la fecha de la última venta, la fila dice **"Nunca vendido"**.

### Resumen
14. La pestaña dice que son las existencias y los precios al momento de consultar, con la fecha y la hora de México. De arriba abajo tiene:
    1. **Filtros** (requisitos 29–32);
    2. **Resumen**, con el aviso de productos sin costo (requisitos 15–17);
    3. **Lista**: el aviso general, el orden, la tabla con sus sugerencias y la paginación (requisitos 18–28).
15. La tarjeta de resumen tiene como cifra principal el **valor detenido al costo** (Σ stock × costo de los productos sin movimiento) y, junto a ella:
    - **Productos sin movimiento**, y cuántos de ellos nunca se han vendido;
    - **Unidades**, desglosadas por unidad de medida como en Valuación; por ejemplo, "7,062 pza · 535 par · 3 paq · 1 kg";
    - **Valor a precio de venta**: Σ stock × precio de venta;
    - **Parte del inventario:** el valor detenido al costo ÷ el valor al costo de todo el inventario disponible con los mismos filtros, sin importar los días sin venta; por ejemplo, "59% del inventario al costo". Si ese valor es 0, se muestra "—".

### Productos sin costo
16. Un producto es **"sin costo"** cuando `products.purchase_price = 0`, la misma regla que Productos (spec 06).
17. El filtro **"Productos sin costo"**, dentro de "Excluir del cálculo", empieza **apagado**, como en Valuación:
    - **apagado:** cuentan, con un valor al costo de $0. Si hay productos sin costo en el resultado, un aviso dentro del resumen dice cuántos son, cuánto valen a precio de venta y que no tienen rebaja sugerida. Lleva el botón **"Excluirlos"**, que enciende el filtro;
    - **encendido:** salen del resumen y de la lista. El resumen dice cuántos productos sin costo no está contando, con el botón **"Incluirlos"**, que apaga el filtro.

### Lista
18. Arriba de la tabla va un **aviso general** (decisión #24): *"Estos productos llevan {N} días o más sin venderse: ubícalos en un lugar más visible o promociónalos."*, con el número de filas a un lado; por ejemplo, "1,293 productos".
19. **Columnas:**
    - nombre y SKU del producto (el SKU no se repite si es igual al nombre);
    - **sucursal**, solo para el administrador central en el consolidado;
    - **última venta**: la fecha, o "Nunca vendido";
    - **días sin venta**;
    - **stock**, con su unidad de medida;
    - **valor al costo**: stock × costo. Un producto sin costo muestra "$0.00" en naranja, como en Productos;
    - **sugerencias** (requisitos 22–28);
    - el botón **Editar** (requisito 37).
20. **Orden:** por valor al costo (por defecto, de mayor a menor) o por días sin venta, con un clic en el encabezado de la columna; otro clic en la misma columna invierte el orden, y la columna ordenada muestra una flecha. Un empate se resuelve por días sin venta, de más a menos, y después por nombre. En móvil, donde la tabla se ve como tarjetas, se ordena con un selector "Ordenar".
21. Paginada de 20 en 20. El resumen no cambia entre páginas.

### Sugerencias
22. Cada fila muestra, en este orden, las sugerencias que le aplican: **traspaso**, **rebaja** y **promoción**. Si no aplica ninguna, dice *"Ubícalo en un lugar más visible o promociónalo"* (decisión #24). Las reglas son fijas (decisión #27), y "el periodo" son los días sin venta elegidos en el filtro.
23. **Traspaso** (decisión #24): si en el periodo el producto se vendió en otra **sucursal activa**, dice *"Traspasar a {sucursal}: {n} ventas en {N} días"*.
    - Una venta se cuenta como en el requisito 10, y {n} es el número de órdenes y apartados.
    - Si se vendió en varias sucursales, se sugiere la que tiene más ventas; un empate se resuelve por nombre.
    - Un usuario de sucursal también ve esta sugerencia: muestra el nombre de la otra sucursal y sus ventas de ese producto, pero ningún otro dato de ella.
    - Con una sola sucursal activa, como hoy en producción, nunca aparece.
24. **Rebaja** (decisiones #26 y #27). El porcentaje depende de los días sin venta, y cada periodo del filtro (60 y 90) empieza un tramo nuevo (decisión 5 de esta spec):

    | Días sin venta | Rebaja |
    |---|---|
    | 30–59 | 10% |
    | 60–89 | 20% |
    | 90 o más | 30% |

    - El **precio sugerido** es precio de venta × (1 − rebaja), redondeado al centavo; por ejemplo, *"Rebajar de $50.00 a $45.00 (−10%)"*.
    - **Nunca baja del costo.** Si el precio rebajado queda debajo del costo, el precio sugerido es el costo, con su porcentaje real, y dice *"hasta el costo, sin utilidad"*.
25. Sin rebaja:
    - **sin costo:** dice *"Captura el costo para calcular la rebaja"* (decisión 2 de esta spec);
    - **precio menor o igual al costo:** dice *"Sin rebaja: el precio no supera el costo"*.
26. **Promoción** (decisión #25): dice *"Promoción con: {A}, {B} y {C}"*, con hasta 3 productos que cumplan todo esto:
    - son de la **misma categoría** y están activos;
    - tienen stock disponible en la sucursal de la fila;
    - son los que tienen **más ventas** (número de órdenes) en esa sucursal en el periodo, sin contar el propio producto. Un empate se resuelve por nombre.

    Un producto sin categoría, o de una categoría sin otras ventas en el periodo, no lleva promoción. Un nombre largo se recorta y se ve completo al pasar el cursor.
27. La promoción se aplica a mano en el POS, con el descuento que ya existe (decisión #25).
28. Las sugerencias son **informativas** (decisión #28): no tienen botones ni ligas. El traspaso se crea en Inventario, y el precio o el costo se cambian con el botón Editar de la fila (requisito 37) o en Productos.

### Filtros
29. Los filtros van arriba de todo, se combinan entre sí y aplican al resumen y a la lista.
30. Al cambiar un filtro o el orden, la tabla vuelve a la página 1.
31. **Días sin venta:** botones **30 / 60 / 90 / 180**, con 30 por defecto (decisión #23). Siempre están a la vista, también en móvil, como los presets de periodo de las otras pestañas.
32. Los demás filtros son los de Valuación (decisión 3 de esta spec; spec 07, requisito 25). En una fila van la búsqueda, la sucursal, la categoría y el proveedor; en otra, **"Excluir del cálculo"**. En móvil se ven los días sin venta y un botón **"Filtros"**, con el número de filtros activos, que muestra los demás:
    - **Sucursal:** solo para el administrador central.
    - **Categoría:** una o todas.
    - **Proveedor:** uno o todos; es el proveedor actual del producto.
    - **Búsqueda:** por nombre o SKU del producto, o SKU de una variante activa.
    - **Excluir categorías:** una o varias, que salen del resumen y de la lista; por ejemplo, Recargas. Solo se usa con "Todas las categorías": al elegir una categoría, las exclusiones se limpian y el control queda deshabilitado.
    - **Productos sin costo:** ver el requisito 17.

    Los filtros no se recuerdan entre visitas.

### Endpoint
33. `GET /api/reports/rotation` recibe:
    - `days`: `30`, `60`, `90` o `180`; por defecto `30`;
    - `branch_id`, `category_id`, `provider_id` y `search`;
    - `exclude_category_ids`: ids separados por coma;
    - `exclude_no_cost`: `true` o `1`;
    - `sort_by`: `cost_value` o `days`; por defecto `cost_value`. `sort_dir`: `asc` o `desc`; por defecto `desc`;
    - `page` y `limit`.

    Responde 400 con otros días u otro orden, con `category_id` y `exclude_category_ids` juntos, o con ids que no sean enteros positivos.
34. La respuesta trae:
    - el resumen del requisito 15, con el valor al costo del inventario disponible;
    - los productos sin costo del resultado (cuántos y su valor a venta), para el aviso;
    - las filas de la página, cada una con sus sugerencias ya calculadas: el traspaso (sucursal y ventas), la rebaja (porcentaje, precio actual, precio sugerido y si se detuvo en el costo) o el motivo por el que no hay, y los productos de la promoción;
    - la paginación.
35. El servicio recibe la fecha de hoy, como `getTrendReport`, para que los tests no dependan del reloj.

### Documentación
36. `shared-features/feat-rotacion-de-inventario.md` documenta la spec con la estructura de `sf-index.md` y se agrega al índice. Sus notas para portar cubren:
    - el permiso en el catálogo de smallpos-saas y en la plantilla de Almacenista;
    - el alcance de varias sucursales por usuario;
    - la regla de la fecha de alta, que depende de cuándo empezó cada base a registrar movimientos.

### Editar productos
37. Cada fila tiene un botón **Editar** que abre el mismo formulario de crear o editar producto de Productos (`Products/modals/ProductModal.jsx`), con sus validaciones, igual que Valuación (spec 07, requisito 33). Así se aplica una rebaja o se captura un costo que falta sin salir del reporte (decisión 8 de esta spec).
    - El botón solo lo ve quien tiene `products.update`. El guardado usa `PUT /api/products/:id`, que ya pide ese permiso; no cambia ningún permiso.
    - El formulario se llena con el producto completo (`GET /api/products/:id`), igual que al editar desde Productos. El precio sugerido no se llena solo: se captura a mano.
    - Al guardar, se cierra el formulario y la rotación se vuelve a pedir con los mismos filtros, orden y página, así que el resumen, la fila y sus sugerencias reflejan el cambio.
    - El precio y el costo son del catálogo, no de la sucursal. En el consolidado, las filas de un mismo producto en dos sucursales abren el mismo producto, y al guardar cambian las dos.
    - En móvil, el botón va en la tarjeta de cada producto.

## Tareas

- [x] **T1. Permiso `reports.rotation`** (requisitos 1 y 2).
  — tests: después de migrar, `reports.rotation` existe y lo tienen superadmin, admin, supervisor y almacenista, pero no el cajero ni un rol creado por el usuario.
- [x] **T2. Endpoint `GET /api/reports/rotation`** (requisitos 4–35, parte del backend).
  — tests, con ventas y stock conocidos en dos sucursales y una fecha de hoy fija:
  - **Días sin venta:**
    - una venta de una variante y otra sin variante cuentan para el mismo producto;
    - una orden cancelada no cuenta; una `refunded` sí;
    - un apartado activo cuenta en su fecha de creación, y uno cancelado no;
    - una venta a las 23:00 de México cuenta en ese día, no en el siguiente.
  - **Nunca vendido:** se cuenta desde el primer movimiento; desde la fecha de alta si no hay movimientos o si el primero ya tenía existencias.
  - **Periodo:** con 30 días, un producto con 30 días sin venta entra y uno con 29 no. Los cuatro periodos cambian el resumen y la lista.
  - **Resumen:**
    - productos, nunca vendidos, unidades por unidad de medida, valor al costo, valor a venta y parte del inventario cuadran con el cálculo a mano;
    - no cuentan un producto inactivo, una variante inactiva ni el stock apartado;
    - en el consolidado, un producto sin movimiento en dos sucursales da dos filas.
  - **Rebaja:**
    - los tramos en sus límites (29, 30, 59, 60, 89 y 90 días);
    - el redondeo al centavo;
    - el tope en el costo con su porcentaje real;
    - sin costo y precio menor o igual al costo no llevan rebaja y traen su motivo.
  - **Promoción:**
    - los 3 productos de la categoría con más órdenes en la sucursal y el periodo, con el empate por nombre;
    - no entran el propio producto, uno sin stock, uno inactivo ni las ventas de otra sucursal;
    - un producto sin categoría no lleva promoción.
  - **Traspaso:**
    - se sugiere la sucursal activa con más ventas en el periodo;
    - una sucursal inactiva no se sugiere;
    - un usuario de sucursal también recibe la sugerencia.
  - **Filtros:** categoría, proveedor, búsqueda por SKU de variante, categorías excluidas y `exclude_no_cost`, con los productos sin costo contados para el aviso.
  - **Orden y páginas:** por valor al costo y por días, con los empates; la paginación, y el resumen igual en todas las páginas.
  - **Alcance:** un usuario de sucursal no ve otras aunque mande `branch_id`.
  - **Otros:** las respuestas 400 del requisito 33; el cajero recibe 403 y el almacenista 200.
- [x] **T3. Pestaña Rotación de inventario** (requisitos 3 y 14–32, parte del frontend).
  — tests, con la respuesta de la API simulada:
  - **Arranque:** la pestaña aparece solo con `reports.rotation`, y un usuario con solo ese permiso ve Reportes en el menú.
  - **Resumen:**
    - las unidades por unidad de medida;
    - los nunca vendidos;
    - la parte del inventario, y "—" cuando el valor del disponible es 0.
  - **Sin costo:** el filtro empieza apagado y manda su parámetro al encenderlo; el aviso aparece con "Excluirlos", y encendido el resumen ofrece "Incluirlos".
  - **Lista:**
    - "Nunca vendido" en lugar de la fecha;
    - "$0.00" en naranja para un producto sin costo;
    - la columna de sucursal solo para el administrador central en el consolidado;
    - el aviso general con los días elegidos.
  - **Sugerencias:**
    - el texto de traspaso, de rebaja (normal y hasta el costo), de los dos motivos sin rebaja y de la promoción;
    - el aviso de ubicación cuando no aplica ninguna;
    - las sugerencias no tienen botones ni ligas.
  - **Orden:** un clic en el encabezado ordena por esa columna de mayor a menor y otro lo invierte; el selector de móvil manda la columna y la dirección.
  - **Filtros:**
    - los días sin venta mandan `days`, y cada filtro manda su parámetro;
    - al cambiar un filtro se vuelve a la página 1;
    - al elegir una categoría, las exclusiones se limpian y el control queda deshabilitado;
    - el botón "Filtros" muestra cuántos hay activos.
- [x] **T4. Editar productos desde la rotación** (requisito 37).
  — tests, con la API simulada:
  - el botón Editar aparece en cada fila, y no aparece sin `products.update`;
  - abre el formulario con el producto que devuelve `GET /api/products/:id`;
  - al guardar, se cierra el formulario y la rotación se vuelve a pedir con los mismos parámetros.
- [x] **T5. Documentación en `shared-features/`** (requisito 36), incluida la edición de productos.
  — tests: no lleva tests de código.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | Un supervisor y un almacenista ven la pestaña Rotación de inventario; un cajero no. En la base de desarrollo, `reports.rotation` lo tienen superadmin, admin, supervisor y almacenista, y en Configuración → Roles aparece "Rotación" dentro de Reportes. | 2026-10-27, en la base de desarrollo con la copia de producción (`marksexpressv2`), después de la migración `006`: `reports.rotation` lo tienen superadmin, admin, supervisor y almacenista; Cajero, Supervisor_Ventas y Cajero N3 no. La API responde 200 a un supervisor y a un almacenista, y 403 a un cajero (probados con tokens firmados para la prueba). `PermissionsModal.jsx` muestra `rotation` como "Rotación". Tests `006-add-reports-rotation-permission.test.js`, `rotation.test.js` (cajero 403, almacenista 200), `Reports.test.jsx` (la pestaña aparece con `reports.rotation`, también como única) y `App.test.jsx`. |
| 2 | En la copia de producción, con cada periodo (30, 60, 90 y 180 días), los productos sin movimiento, los nunca vendidos y el valor detenido al costo coinciden con un cálculo SQL. | 2026-10-27, copia de producción, hoy 27 oct en México: la API y un cálculo SQL aparte dan lo mismo. Con 30 días, 1,308 productos, 302 nunca vendidos y $194,162.26; con 60, 1,077, 271 y $174,358.73; con 90, 927, 250 y $166,583.39; con 180, 720, 228 y $132,976.92. Todo el disponible vale $338,040.27 al costo (57.4% detenido con 30 días). |
| 3 | La última venta de un producto con variantes toma en cuenta todas sus variantes y las ventas sin variante anteriores al 2026-08-25. | 2026-10-27, copia de producción: el producto variable "12875" tiene 306 líneas de venta, todas sin variante, y la última fue el 25 ago 2026. La rotación lo muestra con última venta 2026-08-25 y 63 días, no como "Nunca vendido". "12756", con su última venta en una talla el 17 oct, no aparece con 30 días. Test `rotation.test.js` (una venta de la talla 27 y otra sin variante cuentan para Tenis). |
| 4 | Un producto nunca vendido cuenta sus días desde su primer movimiento o, si su stock es anterior a los movimientos, desde su fecha de alta, y dice "Nunca vendido". | 2026-10-27, copia de producción: "Acetona", nunca vendida, cuenta 62 días desde su primer movimiento (26 ago 2026, sin existencias antes). "Recarga500", nunca vendida y sin movimientos, cuenta 834 días desde su alta y en la tabla dice "Nunca vendido". De los 302 nunca vendidos con 30 días, 266 cuentan desde la fecha de alta. Test `rotation.test.js` (primer movimiento, sin movimientos y primer movimiento con existencias). |
| 5 | La rebaja sigue los tramos, nunca baja del costo y no aparece en productos sin costo ni en los que tienen el precio menor o igual al costo, que muestran su motivo. | 2026-10-27, copia de producción: "Nescafe clasico" (50 días) de $50.00 a $45.00 (−10%); "LENTES100" (71 días) de $100.00 a $80.00 (−20%); "14018" (361 días) de $250.00 a $175.00 (−30%); "helicoptero" (632 días, costo $150) de $170.00 a $150.00 (−11.8%), "hasta el costo, sin utilidad". "12875" (sin costo) dice "Captura el costo para calcular la rebaja" y "bolsa de regalo desc suelt" (costo $76, precio $2), "Sin rebaja: el precio no supera el costo". Test `rotation.test.js` con los límites de 30, 59, 60, 89 y 90 días, el redondeo al centavo ($12.35 → $11.12) y el tope en el costo. |
| 6 | La promoción sugiere hasta 3 productos de la misma categoría, los más vendidos de la sucursal en el periodo, con stock. | 2026-10-27, copia de producción: "Nescafe clasico" (Abarrotes) sugiere doritos nach. (26 órdenes en 30 días), fritos chip. (26) y cheetos xt. fla. (25), igual que un cálculo SQL; "mantecadas vainilla 2pz" (21) quedaría cuarto y no tiene stock. Test `rotation.test.js` (empate por nombre; no entran un producto sin stock, uno inactivo ni las ventas de otra sucursal). |
| 7 | El traspaso solo aparece cuando el producto se vendió en otra sucursal activa en el periodo. | 2026-10-27: la copia de producción tiene una sola sucursal activa, así que ninguna fila lo trae. Test `rotation.test.js`: con ventas en Norte (activa) y Sur (inactiva), Arroz sugiere "Sucursal Norte" con 2 ventas; Lenteja, Norte con 1 aunque se vendió más en Sur, y un usuario de sucursal también recibe la sugerencia. Test `RotationTab.test.jsx` (texto del traspaso). |
| 8 | Los filtros, las categorías excluidas y "Productos sin costo" cambian el resumen y la lista, y el aviso de productos sin costo funciona como en Valuación. | 2026-10-27, copia de producción: excluyendo Recargas, 1,303 productos y $87,800.26 al costo (59.1% del inventario); excluyendo además los productos sin costo, 688. El aviso dice "615 productos sin costo cuentan $0 en el valor detenido; valen $202,421.50 a precio de venta…", y la cuenta no cambia al excluirlos. Con `category_id` y `exclude_category_ids` juntos responde 400. Tests `rotation.test.js` y `RotationTab.test.jsx` ("Excluirlos", "Incluirlos", parámetros, página 1 y exclusiones solo con "Todas las categorías"). |
| 9 | Un usuario con sucursal asignada no ve la rotación de otra sucursal, ni mandando otro `branch_id`. El administrador central ve el consolidado con la columna de sucursal. | 2026-10-27, copia de producción: un supervisor de la sucursal 1 que manda `branch_id=5` recibe lo mismo que el administrador central con la sucursal 1 (1,308 productos); la sucursal 5 (Sucursal Norte, inactiva y sin stock) da 0. En pantalla, el administrador central ve la columna Sucursal. Tests `rotation.test.js` (dos sucursales) y `RotationTab.test.jsx` (la columna se quita al elegir una sucursal y no la ve un usuario de sucursal). |
| 10 | La pestaña se ve y se usa bien en móvil. | 2026-10-27: revisado en Edge sin ventana con el ancho de un teléfono (390 px) sobre la copia de producción: los botones de días y "Filtros" arriba, el resumen en dos columnas y la lista como tarjetas con días, última venta, stock, costo, sugerencias y el botón Editar. La revisión encontró los botones de días recortados en móvil y en desktop; se corrigió. No se revisó en un teléfono real. |
| 11 | Con `products.update`, un producto se edita desde la lista con el formulario de Productos y, al guardar, la rotación se actualiza; sin ese permiso no aparece el botón. | 2026-10-27: revisado en pantalla (Edge sin ventana, 1366 px) sobre la copia de producción: el botón Editar de "Nescafe clasico" abre el formulario de Productos con su información completa (costo $43.3, precio $50, margen 13.4%). No se guardó ningún cambio en la copia. Test `RotationTab.test.jsx`: el botón aparece en cada fila, no aparece sin `products.update`, abre el producto de `GET /api/products/:id`, y al guardar se cierra el formulario y la rotación se vuelve a pedir con los mismos parámetros. |
| 12 | `shared-features/feat-rotacion-de-inventario.md` existe y está en el índice. | 2026-10-27: el archivo existe y está en la tabla del índice (`sf-index.md`), después de la spec 09. |
| 13 | Los tests del backend y del frontend pasan. | 2026-10-27: backend 201/201 (25 archivos), frontend 188/188 (22 archivos); `vite build` compila. |

## Dudas abiertas

- _Ninguna._

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-26 | Antes de redactar se resolvieron 4 dudas:<br>1. La lista va por producto, con las variantes sumadas, porque las ventas anteriores al 2026-08-25 no guardan la variante.<br>2. Los productos sin costo no llevan rebaja: se pide capturar el costo.<br>3. Los filtros son los de Valuación de inventario, con "Excluir del cálculo" para categorías y productos sin costo.<br>4. Se documenta en `shared-features/`. | Usuario |
| 2026-10-26 | Creación de la spec, en **Borrador**, con 3 dudas abiertas que surgieron al redactar. | — |
| 2026-10-27 | Se resuelven las 3 dudas con las propuestas:<br>5. Tramos de rebaja: 30–59 días → 10%, 60–89 → 20% y 90 o más → 30% (requisito 24).<br>6. La creación de un apartado activo cuenta como venta; uno cancelado no (requisito 10).<br>7. Un producto nunca vendido cuyo stock es anterior a los movimientos cuenta sus días desde su fecha de alta (requisito 13).<br>Se agrega a pedido del usuario la edición de productos desde la lista, con el mismo formulario de Productos (decisión 8; requisito 37, T4 y criterio 11). Matiza la decisión #28: las sugerencias siguen sin botones y los traspasos siguen en Inventario, pero el precio y el costo se pueden cambiar desde el reporte. La documentación pasa a T5. | Usuario |
| 2026-10-27 | Se aprueba la spec: pasa a **Lista**. | Usuario |
| 2026-10-27 | T1 terminada: migración `006-add-reports-rotation-permission.sql` y la etiqueta "Rotación" en Permisos. | Usuario |
| 2026-10-27 | T2 terminada: `GET /api/reports/rotation` en `reportService.getRotationReport`. Una consulta trae el disponible por producto y sucursal con su última venta y su llegada; el resumen, el orden y la paginación se hacen en JS, y el traspaso y la promoción se calculan solo para las filas de la página. Con la copia de producción tarda unos 700–900 ms. Casi todo es calcular la última venta sobre 144 mil líneas de venta, y bajarlo pediría un índice nuevo que esta spec no incluye. | Usuario |
| 2026-10-27 | T3 terminada: `Reports/tabs/RotationTab.jsx` y la pestaña en `reportTabs.js`. En móvil, los botones de días se ven sin la etiqueta "Sin venta en" para que no se recorten. | Usuario |
| 2026-10-27 | T4 terminada: botón Editar en cada fila. El botón y el formulario de Valuación pasan a `Reports/components/ProductEdit.jsx` (`EditButton` y `useProductEdit`), que usan las dos pestañas; Valuación no cambia de comportamiento y sus tests siguen igual. | Usuario |
| 2026-10-27 | T5 terminada: `shared-features/feat-rotacion-de-inventario.md`, agregado al índice. Sus notas para portar se revisaron contra smallpos-saas (`496b725`), que todavía no tiene ninguna de las specs de reportes 04 a 09. | Usuario |
| 2026-10-27 | Se llena la evidencia de los 13 criterios de aceptación con la copia de la base de producción. Para revisar la pantalla se creó un usuario temporal en la copia y se borró al terminar. Queda en **Lista** hasta que el usuario apruebe pasarla a Terminada. | — |
| 2026-10-27 | Se aprueba el cierre: pasa a **Terminada**. | Usuario |
