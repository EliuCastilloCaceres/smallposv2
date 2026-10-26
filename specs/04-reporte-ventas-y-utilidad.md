# 04 — Reporte de ventas y utilidad

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Terminada** | 2026-10-20 | 2026-10-20 |

## Objetivo

Es la **spec 1** del orden de [`docs/reportes-borrador.md`](../docs/reportes-borrador.md) (§6). Agrega al módulo de Reportes la pestaña **Ventas y utilidad**, que responde "¿cuánto gané con lo que vendí?": ventas netas, costo de lo vendido, utilidad bruta y margen, desglosados por producto, categoría, sucursal y proveedor. Es para supervisores y administradores.

Como es el primer reporte nuevo, también hace los **cambios base del módulo** que el borrador asignó a esta spec (§4.5 y dudas #29–#32):
- **Guard en `/reports`:** hoy la ruta no valida permisos; el menú solo se oculta.
- **Un permiso por reporte:** se crea `reports.profit`.
- **Se elimina `reports.advanced`**, que existe en los seeds pero nadie usa.
- **Alcance por sucursal de Sesiones de caja:** hoy un usuario con sucursal asignada ve las sesiones de todas las sucursales (ver requisito 9).

La utilidad **neta** (bruta menos gastos) no entra aquí: llega con el módulo de gastos (spec 5 del borrador).

**Base que ya existe:**
- El costo de cada línea se guarda al vender (`order_details.purchase_price`) y, desde la spec 03, sale del catálogo y no del cliente. Una línea con costo 0 cuenta como **"sin costo"**.
- La fórmula de venta neta ya existe en Ventas → Productos vendidos (`orderService.getSoldProducts`): prorratea el descuento de la orden y resta lo reembolsado de verdad en las devoluciones (`RETURN_ATTRIBUTION_SUBQUERY`). Según su comentario, sumada por orden da lo mismo que las ventas netas del Dashboard.
- La spec 03 agregó los índices de fecha en `orders`.

## Historias de usuario

- Como **supervisor**, quiero ver la utilidad bruta y el margen de lo vendido en un periodo, para saber cuánto gana el negocio y no solo cuánto vende.
- Como **supervisor**, quiero ver qué productos, categorías y proveedores dejan más utilidad y cuáles tienen margen bajo, para decidir qué promover o a qué subirle el precio.
- Como **administrador central**, quiero comparar la utilidad entre sucursales y ver el consolidado, para saber cuál rinde más.
- Como **supervisor**, quiero ver qué ventas no tienen costo capturado, y poder excluirlas, para que no inflen la utilidad.
- Como **administrador**, quiero dar acceso a cada reporte por rol, para que cada quien vea solo los reportes que le corresponden.
- Como **encargado de una sucursal**, quiero que mis usuarios vean solo las sesiones de caja de su sucursal, para que la información de otras sucursales no quede expuesta.

## Alcance

**Incluye**
- Permiso `reports.profit`, asignado por defecto a superadmin, admin y supervisor, y eliminación de `reports.advanced`, todo por migración.
- Acceso al módulo de Reportes según los permisos de reportes: menú, guard de la ruta y pestañas.
- Endpoint `GET /api/reports/profit` con KPIs, agrupaciones, orden, paginación y filtros.
- Pestaña **Ventas y utilidad** en el frontend, con tabla en escritorio y tarjetas en móvil.
- Marca y filtro de ventas "sin costo".
- Presets de fechas compartidos entre el Dashboard y Reportes.
- Alcance por sucursal de Sesiones de caja, igual que el Dashboard.
- Tests de todo lo anterior.
- **Documentación en `shared-features/`:** sí, como `feat-reporte-ventas-y-utilidad.md`, con todo lo anterior (decisión del usuario, 2026-10-20). Sus notas para portar explican cómo adaptar los permisos al RBAC de smallpos-saas.

**No incluye**
- Utilidad neta: llega con el módulo de gastos.
- Gráficas y tendencia en el tiempo: van en la spec de Tendencia de ventas, con Recharts.
- Exportar a CSV o imprimir (decisión #30 del borrador).
- Desglose por cajero o por método de pago (decisión #12).
- Desglose por variante: las variantes se suman en su producto.
- Corregir el costo de ventas históricas sin costo: se marcan, no se corrigen.
- Permisos de los demás reportes (inventario, tendencia, rotación, gastos, compras): cada spec crea el suyo con su nombre final.
- Portar el reporte a smallpos-saas: aquí solo se documenta.

## Requisitos

### Permisos
1. Una migración crea el permiso `reports.profit` (módulo `reports`, acción `profit`, descripción "Reporte de ventas y utilidad") y lo asigna a los roles **superadmin, admin y supervisor**, buscándolos por nombre. No se asigna al cajero, al almacenista ni a roles creados por el usuario; se ajusta después desde Configuración → Roles.
2. La misma migración elimina el permiso `reports.advanced`; sus asignaciones en `role_permissions` se borran en cascada. `02-seeds.sql` no cambia (es la base fija), así que en una instalación nueva lo borra la migración.
3. La pantalla de permisos (`Settings/modals/PermissionsModal.jsx`) muestra la acción `profit` como **"Utilidad"** y deja de tener la etiqueta "Avanzado".

### Acceso al módulo
4. El menú muestra **Reportes** si el usuario tiene al menos un permiso de reportes (hoy `reports.basic` o `reports.profit`). Hoy solo revisa `reports.basic`.
5. Si alguien entra a `/reports` sin ningún permiso de reportes, se le manda al inicio, igual que el Dashboard sin `dashboard.read`.
6. Cada pestaña aparece solo si el usuario tiene su permiso: **Sesiones de caja** con `reports.basic` y **Ventas y utilidad** con `reports.profit`. El módulo abre en la primera pestaña que el usuario puede ver.
7. `GET /api/reports/profit` exige `reports.profit` y responde 403 sin él.

### Alcance por sucursal
8. **Ventas y utilidad**, igual que el Dashboard:
   - un usuario con sucursal asignada ve solo la suya; el backend la fuerza aunque mande otro `branch_id`;
   - el administrador central ve el consolidado y puede filtrar por una sucursal.
9. **Sesiones de caja** pasa a la misma regla. Hoy `reportController` usa `resolveUnrestrictedBranchId`, que nunca lee la sucursal del usuario: si no se manda `branch_id` devuelve "todas", y la pestaña no lo manda para quien no es administrador central. Así, hoy un usuario con sucursal ve en pantalla las sesiones de **todas** las sucursales, y por la API puede pedir las de cualquiera. Con el cambio:
   - el listado (`GET /reports/cash-sessions`) muestra solo las de su sucursal, aunque mande otro `branch_id`;
   - el detalle de una sesión de otra sucursal (`GET /reports/cash-sessions/:id`) responde igual que una sesión que no existe;
   - el administrador central sigue igual: todas, o filtra por sucursal.

### Cálculo
10. **Qué ventas cuentan:** las órdenes con estado `completed`, `partial_refund` o `refunded`, por su fecha (`orders.created_at`) en hora de México (`toServerRange`). Las canceladas no cuentan. Una venta a crédito cuenta el día de la venta (decisión #13). Un apartado, el día en que se liquida, porque ahí se crea su orden. Las devoluciones se restan en la fecha de la venta, no en la de la devolución (decisión #11).
11. **Por línea de venta:**
    - **Venta neta** = `(od.subtotal − od.discount) × (o.total / o.subtotal)` − lo reembolsado atribuido a esa línea, con la misma fórmula de `getSoldProducts`. Si se cobró tarifa de restock, esa parte se queda como venta.
    - **Unidades netas** = unidades vendidas − unidades devueltas.
    - **Costo** = unidades netas × `od.purchase_price`. Las unidades devueltas no cuentan como costo, porque regresaron al inventario.
    - **Utilidad bruta** = venta neta − costo.
    - **Margen** = utilidad bruta ÷ venta neta × 100. Si la venta neta es 0, el margen se muestra como "—".
12. La fórmula de venta neta y de devoluciones **se comparte** con Ventas → Productos vendidos; no se copia. Con los filtros apagados y las ventas sin costo incluidas, las ventas netas del reporte coinciden con las del Dashboard para el mismo rango y sucursal.

### Ventas "sin costo"
13. Una línea es **"sin costo"** cuando `od.purchase_price = 0` (regla de la spec 03).
14. Si en el resultado hay líneas sin costo, el reporte muestra un aviso con cuántas son y cuánto suman de venta neta, y en la tabla marca las filas que las incluyen.
15. El filtro **"Excluir ventas sin costo"** empieza **apagado**: todo cuenta y lo sin costo solo se marca, así que los totales cuadran con Ventas y el Dashboard. Encendido, saca esas líneas de todos los cálculos: venta neta, costo, utilidad y margen.

### Pestaña Ventas y utilidad
16. **KPIs:** Ventas netas, Costo de lo vendido, Utilidad bruta y Margen. Se calculan sobre todo el resultado del filtro, no solo la página.
17. **Filtros:**
    - fechas con los presets **Hoy, Semana, Mes y Personalizado**, igual que el Dashboard, empezando en **Mes**;
    - sucursal, solo para el administrador central;
    - categoría;
    - agrupar por: producto (por defecto), categoría, sucursal (solo el administrador central en el consolidado) o proveedor;
    - excluir ventas sin costo.
18. **Presets compartidos:** el cálculo de rangos de los presets (`getPresetRange`, hoy dentro de `Dashboard.jsx`) pasa a un archivo compartido que usan el Dashboard y esta pestaña. El Dashboard sigue funcionando igual.
19. **Tabla agrupada:**
    - columnas: nombre del grupo, venta neta, costo, utilidad y margen;
    - al agrupar **por producto**, una columna de **unidades netas** con la unidad de medida del producto (pza, kg, lt…); en las otras agrupaciones, en su lugar, cuántos **productos** distintos hay en el grupo, porque sumar unidades mezclaría unidades de medida;
    - ordenable por venta neta, utilidad o margen, ascendente o descendente; por defecto, utilidad de mayor a menor;
    - paginada en el servidor, de 20 en 20;
    - al agrupar por producto, cada producto es **una fila con sus variantes sumadas**, igual que Ventas → Productos vendidos.
20. **Agrupaciones:**
    - **Categoría:** la actual del producto; sin categoría, "Sin categoría".
    - **Proveedor:** el actual del producto. Al desactivar un proveedor, `providerService` pasa sus productos al proveedor genérico, así que sus ventas pasadas aparecen bajo ese proveedor.
    - **Sucursal:** la de la venta.
21. En móvil, la tabla se muestra como tarjetas, igual que Sesiones de caja. Se reutilizan los estilos `rpt-` de `reports.css`.

### Documentación
22. `shared-features/feat-reporte-ventas-y-utilidad.md` documenta la spec con la estructura de `sf-index.md` y se agrega al índice. Sus notas para portar explican cómo adaptar los permisos al RBAC de smallpos-saas (permisos con `code`, `createSecureRouter` y su catálogo).

## Tareas

- [x] **T1. Permisos** (requisitos 1–3).
  — tests: después de migrar, `reports.profit` existe y lo tienen superadmin, admin y supervisor, pero no el cajero ni el almacenista; `reports.advanced` y sus asignaciones ya no existen; con la base sin migrar, un rol creado por el usuario que tenía `reports.advanced` lo pierde y no recibe `reports.profit`.
- [x] **T2. Endpoint `GET /api/reports/profit`** (requisitos 7, 8 y 10–20, parte del backend).
  — tests: con ventas conocidas, los KPIs y las filas cuadran con el cálculo a mano, incluyendo descuento de orden, devolución parcial con tarifa de restock y una venta cancelada que no cuenta; las ventas netas coinciden con las del Dashboard; una línea sin costo se cuenta y se marca, y con el filtro se excluye; las cuatro agrupaciones (con unidades al agrupar por producto y conteo de productos en las demás), el orden y la paginación (los KPIs no cambian entre páginas); las variantes se suman en su producto; un usuario de sucursal no ve otras aunque mande `branch_id`; el administrador central ve el consolidado y filtra; una venta de las 23:30 hora de México cuenta en ese día; el cajero recibe 403.
- [x] **T3. Alcance de Sesiones de caja** (requisito 9).
  — tests: un usuario de la sucursal 1 solo ve sesiones de la sucursal 1, sin mandar `branch_id` y mandando el de otra; el detalle de una sesión de otra sucursal responde como una que no existe; el administrador central sigue viendo todas y filtrando por sucursal.
- [x] **T4. Acceso al módulo en el frontend** (requisitos 4–6).
  — tests: con solo `reports.profit`, el menú muestra Reportes; sin permisos de reportes, `/reports` manda al inicio; cada pestaña aparece solo con su permiso, y el módulo abre en la primera permitida.
- [x] **T5. Pestaña Ventas y utilidad y presets compartidos** (requisitos 14–19 y 21, parte del frontend).
  — tests: los presets devuelven el rango correcto (incluida una semana que empieza en lunes) y el Dashboard los sigue usando; la pestaña empieza en Mes; con la respuesta de la API simulada, muestra los KPIs y las filas; el margen es "—" con venta neta 0; aparecen el aviso y la marca de ventas sin costo; el filtro de excluir empieza apagado y manda su parámetro al encenderlo; las unidades aparecen solo al agrupar por producto; el selector de sucursal y la agrupación por sucursal solo aparecen para el administrador central.
- [x] **T6. Documentación en `shared-features/`** (requisito 22).
  — tests: no lleva tests de código.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | Un supervisor ve Reportes con las dos pestañas; un cajero, solo Sesiones de caja; un almacenista no ve Reportes, y si entra a `/reports` vuelve al inicio. | 2026-10-20: en la base de desarrollo, después de la migración 003, el supervisor tiene `reports.basic` y `reports.profit`, el cajero solo `reports.basic` y el almacenista ninguno. Tests `Reports.test.jsx` (las dos pestañas con los dos permisos, solo Sesiones de caja con `reports.basic`, sin permisos de reportes manda al inicio) y `App.test.jsx` (Reportes en el menú con cualquiera de los dos permisos, y no sin ellos). La base de desarrollo solo tiene al usuario `superadmin`, así que no se probó con usuarios de cada rol en pantalla. |
| 2 | En la base de desarrollo, con los filtros apagados, las ventas netas del reporte coinciden con las del Dashboard para el mismo rango y sucursal. | 2026-10-20, base de desarrollo (31 ventas): las ventas netas del reporte y las del Dashboard coinciden en Hoy ($2,300.00), Esta semana ($2,402.00), Este mes ($8,288.64) y un rango de enero a octubre ($8,288.64), en el consolidado y con la sucursal 1. Una consulta SQL directa da los mismos $8,288.64 de venta y $5,094.59 de costo. |
| 3 | La utilidad de una venta con descuento de orden y una devolución parcial, calculada a mano, coincide con la del reporte. | Test `computes the KPIs with order discount, partial return with restock fee and without the cancelled sale` (`profit.test.js`). La venta tiene A ×2 a $100 y B ×1 a $50, con 10% de descuento de orden (total $225) y la devolución de 1 A con reembolso de $80. A mano: A = 200 × 0.9 − 80 = $100, con costo $40 y utilidad $60; B = 50 × 0.9 = $45, con costo $20 y utilidad $25. Las filas del reporte coinciden, y la venta suma $145 = 225 − 80. La base de desarrollo no tiene ventas con descuento de orden ni devoluciones. |
| 4 | Una venta sin costo aparece marcada, y con "Excluir ventas sin costo" deja de contar en los KPIs. | Tests `profit.test.js`: una línea sin costo de $90 se cuenta y aparece en `noCost`; con `exclude_no_cost` los KPIs pasan de $525 / $170 / $355 a $435 / $170 / $265. Test `ProfitTab.test.jsx`: aparecen el aviso y la marca "Sin costo" en la fila, y el filtro empieza apagado y manda su parámetro al encenderlo. La base de desarrollo no tiene líneas sin costo (0 de 107). |
| 5 | Un usuario con sucursal asignada no puede ver la utilidad de otra sucursal, ni mandando otro `branch_id` a la API. | Test `forces the branch of a user with an assigned branch, even if another branch_id is sent` (`profit.test.js`): un supervisor de la sucursal 1 que manda el `branch_id` de otra sucursal recibe solo la suya ($425), y al agrupar por sucursal solo aparece la 1. La base de desarrollo tiene una sola sucursal. |
| 6 | Un usuario con sucursal asignada ve en Sesiones de caja solo las de su sucursal, en pantalla y por la API. | Tests `cash-sessions-scope.test.js`: un cajero de la sucursal 1 solo ve sus sesiones, sin mandar `branch_id` y mandando el de otra sucursal. El detalle de una sesión de otra sucursal responde igual que una que no existe (404, mismo cuerpo), y el administrador central ve todas y filtra. La pestaña usa ese mismo endpoint sin mandar `branch_id` para quien no es administrador central, así que en pantalla aplica la misma regla. La base de desarrollo tiene una sola sucursal. |
| 7 | En la base de desarrollo ya no existe `reports.advanced`, y en Configuración → Roles aparece "Utilidad" dentro de Reportes. | 2026-10-20: el backend de desarrollo aplicó la migración `003` al reiniciarse (22:52:26), y `npm run migrate` dice "Migraciones al día". En `permissions` ya no existe `reports.advanced` y no quedan asignaciones huérfanas. `GET /api/permissions`, que alimenta Configuración → Roles, trae `reports.basic` y `reports.profit` en el módulo Reportes, y `PermissionsModal.jsx` muestra `profit` como "Utilidad". No se revisó la pantalla en el navegador. |
| 8 | El Dashboard muestra los mismos datos que antes para cada preset. | 2026-10-20: el backend del Dashboard no cambió. El `getPresetRange` anterior (de `HEAD`) y el de `utils/dateRanges.js` dan el mismo rango en 6,570 comparaciones: los cuatro presets, cada día de 2026 a las 00:05, 12:00 y 23:55, en las zonas America/Mexico_City, America/Merida y UTC, sin diferencias. Test `Dashboard.test.jsx`: el Dashboard pide el rango de cada preset compartido. |
| 9 | `shared-features/feat-reporte-ventas-y-utilidad.md` existe y está en el índice. | 2026-10-20: el archivo existe y está en la tabla del índice (`sf-index.md`). Se commitea junto con el resto de la spec. |
| 10 | Los tests del backend y del frontend pasan. | 2026-10-20: backend 77/77 (16 archivos), frontend 52/52 (12 archivos). |

## Dudas abiertas

- _Ninguna._

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-20 | Creación de la spec. | — |
| 2026-10-20 | Se resuelven las 7 dudas: solo se crea `reports.profit` (cada spec crea el permiso de su reporte); se corrige en esta spec el alcance de Sesiones de caja; "Excluir ventas sin costo" empieza apagado; fechas con presets como el Dashboard, empezando en Mes, con `getPresetRange` compartido; unidades solo al agrupar por producto (en las demás, conteo de productos); variantes sumadas en su producto; se documenta en `shared-features/` con todo, incluidos los permisos. Al revisar Sesiones de caja se confirmó que hoy un usuario con sucursal ve en pantalla las de todas las sucursales, no solo por la API. | Usuario |
| 2026-10-20 | Se aprueba la spec: pasa a **Lista**. | Usuario |
| 2026-10-20 | T1 terminada: migración `003-add-reports-profit-permission.sql` (crea `reports.profit`, se lo da a superadmin, admin y supervisor, y borra `reports.advanced`) y la etiqueta "Utilidad" en Permisos. | Usuario |
| 2026-10-20 | T2 terminada: `GET /api/reports/profit`. La fórmula de venta neta pasa a `backend/src/helpers/soldLines.js`, que también usa Ventas → Productos vendidos (requisito 12). | Usuario |
| 2026-10-20 | T3 terminada: Sesiones de caja usa `resolveOptionalBranchId` en el listado y el detalle. | Usuario |
| 2026-10-20 | T4 y T5 terminadas: `Reports/reportTabs.js` (pestañas y permisos), guard de `/reports`, menú, pestaña `ProfitTab.jsx` y presets compartidos en `utils/dateRanges.js`. | Usuario |
| 2026-10-20 | T6 terminada: `shared-features/feat-reporte-ventas-y-utilidad.md`, agregado al índice. Sus notas para portar se revisaron contra smallpos-saas: allá `reports.advanced` ya no existe, el permiso nuevo no les llega solo a los Supervisor de los tenants existentes, y Sesiones de caja ya respeta la sucursal del usuario. | Usuario |
| 2026-10-20 | Evidencia de los 10 criterios de aceptación: 2, 7 y 8 contra la base de desarrollo y el código anterior; 1, 3, 4, 5 y 6 con sus tests, porque la base de desarrollo solo tiene al superadmin, una sucursal, y ninguna venta con descuento, devolución o sin costo. | Usuario |
| 2026-10-20 | Pasa a **Terminada**. Toda la spec va en un solo commit. | Usuario |
| 2026-10-26 | La spec 08 (`specs/08-rediseno-ventas-y-tendencia.md`) redefine la presentación de esta pestaña: requisitos 14, 16, 17 y 19 (aviso y marca de ventas sin costo, KPIs, filtros y orden de la tabla). Los cálculos y los criterios de aceptación de esta spec siguen vigentes. | Usuario |
