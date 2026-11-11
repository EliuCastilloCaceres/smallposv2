# 16 — Reporte de compras

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Terminada** | 2026-10-29 | 2026-11-10 |

## Objetivo

Es la segunda parte del **paso 6** del orden de [`docs/reportes-borrador.md`](../docs/reportes-borrador.md) (§6). La primera fue la [spec 14](14-modulo-de-compras.md), el módulo para registrar compras. Esta spec agrega la pestaña **Compras** en Reportes, que responde **"¿a quién le compro más?"** con las compras (petición #3 del borrador, §3.2).

La spec también respondía **"¿con quién gasto más?"**, sumando a las compras los gastos con proveedor (decisión #8). El 2026-11-10 el usuario pidió que la pestaña muestre solo compras, así que eso se quitó (requisito 24). Los gastos por proveedor se ven en el reporte de Gastos, con "Ver por" Proveedor.

Es para supervisores y administradores.

**Datos de la copia de producción** (2026-10-29):
- **Compras:** 3 activas, todas del 28 oct: Marco Antonio Castillo $665.25, Bimbo $41.64 y Sabritas $34.88 ($741.77 en total). Hay una más, cancelada, de $795.00.
- **Entradas anteriores:** las 1,132 entradas "Compra a proveedor" (25 ago – 21 oct) no tienen costo ni proveedor, y no se convirtieron en compras (spec 14, decisión 9).
- **Gastos con proveedor:** los 2 activos son de "Pago a proveedor (mercancía)", del 27 oct: Coca Cola $1,550.00 y Pepsi $2,700.00. Esa categoría no cuenta en la utilidad neta y ya está inactiva (spec 14, requisito 26). No hay gastos con proveedor de otras categorías.
- 33 proveedores activos y 1 sucursal activa.

**Base que ya existe:**
- **Spec 14:** las tablas `purchases` (fecha de la compra, día de México sin hora; estado; proveedor; sucursal; total) y `purchase_items` (producto, variante, cantidad y subtotal).
- **Spec 13:** el reporte de gastos (`reportService.getExpenseReport`, `ExpensesTab.jsx`), con su resumen, el desglose con "Ver por", la fecha del primer gasto y el alcance por sucursal; y la marca `counts_in_net_profit` de las categorías de gasto (spec 12).
- **Spec 08:** las piezas compartidas de Reportes (`Reports/components/`): tarjeta de filtros, botones de grupo y aviso del resumen (`SummaryNote`).
- **Permisos de reportes:** cada pestaña tiene su permiso en `Reports/reportTabs.js`, y el menú muestra Reportes con cualquiera de ellos. Las migraciones de permisos de reportes siguen el patrón de la `012`.

## Historias de usuario

- Como **supervisor**, quiero ver a qué proveedores les compro más en un periodo, para negociar precios y decidir con quién comprar.
- Como **supervisor**, quiero ver qué productos compro más y a qué costo promedio, para planear las compras.
- Como **administrador central**, quiero comparar lo que compra cada sucursal.

## Alcance

**Incluye**
- Permiso `reports.purchases`, asignado por defecto a superadmin, admin y supervisor, por migración (decisiones #29b y 6).
- Endpoint `GET /api/reports/purchases` y la pestaña **Compras** en Reportes: filtros, resumen y desglose (decisiones 2–4).
- El aviso de la primera compra registrada (spec 14, decisión 9), que se puede cerrar (requisito 23).
- Tests de todo lo anterior.
- **Documentación en `shared-features/`:** sí, como `feat-reporte-de-compras.md` (decisión 9 del usuario, 2026-10-29).

**No incluye**
- La lista de cada compra: ya está en el módulo Compras (spec 14). Tocar un proveedor no abre nada (decisión 8).
- Gráfica (decisión 7).
- Desglose por categoría de producto o por método de pago.
- Las entradas históricas "Compra a proveedor" (spec 14, decisión 9).
- Los gastos: la pestaña solo cuenta compras (requisito 24, cambio del 2026-11-10). Los gastos por proveedor están en el reporte de Gastos.
- Cuentas por pagar (decisión #7) y exportación (decisión #30).
- Comparar con otro periodo.

## Requisitos

### Permiso y pestaña
1. Una migración crea `reports.purchases` (módulo `reports`, acción `purchases`, descripción "Reporte de compras") y lo asigna por nombre a **superadmin, admin y supervisor** (decisiones #29b y 6), en una transacción. No se asigna al cajero, al almacenista ni a roles creados por el usuario.
2. La pestaña **Compras** aparece en Reportes, después de Gastos, solo con `reports.purchases`. El menú muestra Reportes con ese permiso aunque no haya otro de reportes.
3. La pantalla de permisos muestra la acción `purchases` del módulo Reportes como **"Compras"**.

### Qué cuenta
4. **Compras:** las **activas**, es decir, no canceladas, cuya **fecha de la compra** cae en el periodo. Su monto es su total, la suma de sus líneas.
5. **Gastos:** no se suman; el reporte solo cuenta compras (requisito 24).
6. **Alcance por sucursal**, igual que en los demás reportes: un usuario con sucursal ve solo la suya, y el backend la fuerza. El admin central ve el consolidado y puede filtrar por una sucursal.

### Sumar (quitado el 2026-11-10)
7. _Quitado (requisito 24):_ el selector "Sumar", con "Solo compras" y "Compras y gastos", que pedía también `reports.expenses`.

### Filtros
8. Arriba, como en Gastos:
   - periodo con sus presets (Hoy, Esta semana, Este mes por defecto, Personalizado) y las fechas que cubre;
   - sucursal, solo para el admin central.

### Resumen (decisión 2)
9. El resumen muestra:
   - **total comprado**, como cifra principal;
   - número de compras y **compra promedio** (total ÷ número de compras; "—" sin compras);
   - número de **proveedores** con compras en el periodo.
10. _Quitado (requisito 24):_ el resumen de "Compras y gastos".

### Desglose (decisiones 3 y 4)
11. **"Ver por":** **Proveedor** (por defecto), **Producto** y **Sucursal**. "Sucursal" solo aparece para el admin central en el consolidado.
12. **Por proveedor:** proveedor, número de compras, total, **% del total comprado**, compra promedio y fecha de la **última compra** del periodo. Un proveedor inactivo lleva la marca **"Inactivo"**.
13. _Quitado (requisito 24):_ el desglose por proveedor de "Compras y gastos".
14. **Por producto:** producto (nombre y SKU, con la marca "Inactivo" si está inactivo), **cantidad comprada** con su unidad, número de compras en que aparece, total, % del total comprado y **costo promedio de compra** (total ÷ cantidad, al centavo).
    - Las variantes se suman a su producto, porque el costo es del producto (spec 14, decisión 6).
15. **Por sucursal:** sucursal, número de compras, total, % del total comprado y compra promedio.
16. Las filas van ordenadas por total, de mayor a menor, y paginadas de 20 en 20. En móvil se ven como tarjetas.
17. Sin datos en el periodo, el resumen va en ceros y el desglose dice *"No hay compras en este periodo"*.

### Avisos
18. **Primera compra registrada** (spec 14, decisión 9): la fecha de la compra activa más antigua, dentro del alcance de sucursal del filtro. Si el periodo empieza antes, un aviso informativo: *"La primera compra registrada es del 28 oct 2026. Las entradas de mercancía anteriores no tienen costo ni proveedor, así que no están en este reporte."* Si todavía no hay compras, basta el mensaje del requisito 17.
19. _Quitado (requisito 24):_ el aviso de los gastos con proveedor que no se sumaban en "Compras y gastos".

### Endpoint
20. `GET /api/reports/purchases` con `reports.purchases`. Parámetros:
    - `start_date` y `end_date`, obligatorios;
    - `branch_id`;
    - `group_by`: `provider`, `product` o `branch`;
    - `page` y `limit`.

    Responde las filas del desglose, la paginación, el resumen del requisito 9 y la fecha de la primera compra. Un parámetro inválido responde 400 con un mensaje en español.

### Migración
21. `018-add-reports-purchases-permission.sql`, en una transacción, como las migraciones de permisos de reportes.

### Documentación
22. `shared-features/feat-reporte-de-compras.md` documenta la spec con la estructura de `sf-index.md` y se agrega al índice.

### Cerrar los avisos (cambio del 2026-10-30, ajustado el 2026-11-10)
23. El aviso del requisito 18 lleva un botón **×** ("Cerrar aviso") para cerrarlo. Cerrado, vuelve a salir:
    - al cambiar un filtro: el periodo (preset o fechas) o la sucursal;
    - al volver a abrir la pestaña o la pantalla de Reportes.

    Cambiar "Ver por" o la página no lo vuelve a mostrar, porque no cambian el resumen. Lo cerrado no se guarda ni en el navegador ni en el backend.

### Solo compras (cambio del 2026-11-10)
24. La pestaña muestra solo compras. Se quitan el selector "Sumar", la opción "Compras y gastos" con su resumen, su desglose y su aviso, y el parámetro `include_expenses` del endpoint (requisitos 5, 7, 10, 13 y 19). La pestaña ya no consulta `reports.expenses`, y si llega `include_expenses`, el backend lo ignora.

## Tareas

- [x] **T1. Permiso `reports.purchases`** (requisitos 1–3 y 21).
  — tests: la migración asigna el permiso a superadmin, admin y supervisor, y a ningún otro rol, incluidos los creados por el usuario; el menú y la pestaña aparecen con solo `reports.purchases`; la etiqueta en Permisos.
- [x] **T2. API del reporte: solo compras** (requisitos 4, 6, 9, 11, 12, 14–18 y 20).
  — tests:
  - el resumen, con la compra promedio y el número de proveedores;
  - el desglose por proveedor (con la última compra y la marca de inactivo), por producto (variantes sumadas, cantidad y costo promedio) y por sucursal, con el % del total, el orden y la paginación;
  - las canceladas no cuentan, y la fecha de la compra decide el periodo;
  - el alcance por sucursal;
  - la fecha de la primera compra;
  - respuestas 400 y 403.
- [x] **T3. API del reporte: compras y gastos** (requisitos 5, 7, 10, 13, 19 y 20).
  — tests:
  - el total separado en compras y gastos, y los proveedores con compras o gastos;
  - solo suman los gastos activos con proveedor de categorías que cuentan en la utilidad neta;
  - los gastos que no se suman, con su total y sus categorías;
  - `group_by` distinto de `provider` responde 400, y sin `reports.expenses`, 403;
  - el alcance por sucursal.

  _Se quitó en la T7 (cambio del 2026-11-10)._
- [x] **T4. Pestaña Compras** (requisitos 2, 7–19).
  — tests, con la API simulada: los filtros y sus parámetros, "Sumar" solo con `reports.expenses`, el resumen de cada opción, el desglose con cada "Ver por" y la vuelta a Proveedor con "Compras y gastos", la marca "Inactivo", los dos avisos y "Sucursal" solo para el admin central. _Lo de "Compras y gastos" se quitó en la T7._
- [x] **T5. Documentación** (requisito 22).
  — tests: no lleva tests de código.
- [x] **T6. Avisos que se cierran** (requisito 23; también se actualiza `feat-reporte-de-compras.md`).
  — tests, con la API simulada: cada aviso se cierra por separado; vuelve a salir al cambiar el periodo, la sucursal o "Sumar", y al abrir de nuevo la pestaña; no vuelve al cambiar "Ver por" ni la página. _El aviso de los gastos y "Sumar" se quitaron en la T7._
- [x] **T7. Solo compras** (requisito 24; también se actualizan `feat-reporte-de-compras.md` y la decisión #8 de `docs/reportes-borrador.md`).
  — tests:
  - backend: con `include_expenses`, el reporte es el mismo que sin él; los gastos con proveedor no cambian el resumen ni el desglose;
  - pestaña, con la API simulada: no hay "Sumar" aunque el usuario tenga `reports.expenses`, y la consulta no lleva `include_expenses`; el aviso de la primera compra se cierra, vuelve a salir al cambiar el periodo o la sucursal y al abrir de nuevo la pestaña, y no vuelve al cambiar "Ver por" ni la página.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | En la copia de producción, un supervisor ve en Este mes las 3 compras activas: total $741.77, 3 compras, compra promedio $247.26 y 3 proveedores; Marco Antonio Castillo va primero, con el 89.68 %. La compra cancelada no cuenta. | 2026-10-29, copia de producción (`marksexpressv2`) con un supervisor temporal de la Sucursal Central:<br>- **El 28 oct** (el día de las 3 compras de la redacción): total $741.77, 3 compras, compra promedio $247.26 y 3 proveedores; Marco Antonio Castillo primero, con el 89.68 %, después Bimbo (5.61 %) y Sabritas (4.70 %). La compra 13, cancelada, no cuenta.<br>- **Este mes:** el 29 oct el usuario registró desde el POS una cuarta compra (la 20, de "donde", $301.50), así que octubre da $1,043.27 en 4 compras, promedio $260.82 y 4 proveedores, con Marco Antonio Castillo primero (63.77 %). Coincide con la base.<br>Tests `reports/purchases`. |
| 2 | Por producto, la cantidad, el total y el costo promedio de cada producto coinciden con una consulta directa a la base, con las variantes sumadas a su producto. | 2026-10-29: por producto, octubre trae 12 productos. Su cantidad, número de compras, total y costo promedio son los mismos que da una consulta directa a `purchases` y `purchase_items` (por ejemplo, ENSALADA VERDURAS: 8 pza en 1 compra, $238.00 y $29.75). Las compras de la copia no tienen variantes, así que la suma de variantes se probó en el test `reports/purchases` (Playera CH 3 × $40 + M 1 × $80 = 4 pza, $200.00 y costo promedio $50.00). |
| 3 | El reporte solo cuenta compras: los gastos, con proveedor o sin él, no aparecen en el resumen ni en el desglose, y `include_expenses` no cambia la respuesta. _(Cambió el 2026-11-10; antes probaba "Compras y gastos".)_ | 2026-11-10, copia de producción con un supervisor temporal de la Sucursal Central, ya borrado:<br>- octubre (1–31 oct) da $1,057.97 en 5 compras, compra promedio $211.59 y 4 proveedores, igual que una consulta directa a `purchases`. Desde la redacción se registró una quinta compra de bimbo, que ya suma $56.34;<br>- los 5 gastos activos de octubre ($11,950.00, 2 de ellos con proveedor) no aparecen;<br>- con `include_expenses=true` la respuesta es idéntica a la de sin él y no trae campos de gastos, y con `group_by=product` responde 200, con 13 productos.<br>Tests `reports/purchases`. |
| 4 | Con un periodo que empieza antes del 28 oct 2026, aparece el aviso de la primera compra registrada. | 2026-10-29: con Este mes (1–31 oct), la pantalla muestra *"La primera compra registrada es del 28 oct 2026. Las entradas de mercancía anteriores no tienen costo ni proveedor, así que no están en este reporte."* La API da `firstPurchaseDate` 2026-10-28. |
| 5 | Los permisos por defecto son los del requisito 1, y la pestaña se ve completa con solo `reports.purchases`. Un usuario de sucursal no ve las compras de otra. | 2026-10-29, copia de producción:<br>- la `018` se aplicó a las 14:06:22 (hora del servidor) y dio `reports.purchases` solo a superadmin, admin y supervisor; no a Cajero, almacenista, "Cajero N3" ni "Supervisor_Ventas";<br>- un rol temporal con solo `reports.purchases` vio la pestaña y recibió 200;<br>- un supervisor de una sucursal temporal vio el resumen en ceros, también al pedir `branch_id=1`.<br>Tests `018-add-reports-purchases-permission` y `reports/purchases`. _(Hasta el 2026-11-10 también probaba "Sumar" y el 403 de `include_expenses`, que se quitaron.)_ |
| 6 | La pestaña se ve y se usa bien a 390 px y a 1366 px. | 2026-10-29, capturas (Edge sin ventana) a 1366 y 390 px por proveedor y por producto, sin scroll horizontal. A 1366 px se ve la tabla y, a 390 px, las tarjetas.<br>2026-11-10, con la T7: a 1366 y 390 px no aparecen "Sumar" ni "Compras y gastos", y no hay scroll horizontal. A 390 px, las 4 tarjetas de octubre. |
| 7 | `shared-features/feat-reporte-de-compras.md` existe y está en el índice. | `shared-features/feat-reporte-de-compras.md`, en la tabla de `sf-index.md`. Revisado contra smallpos-saas (`82f8b31`), que todavía no tiene compras ni los reportes de las specs 04–15. |
| 8 | Los tests del backend y del frontend pasan. | 2026-10-29: backend 466/466 (52 archivos), frontend 334/334 (42 archivos). El frontend compila con `vite build`.<br>2026-10-30, con la T6: backend 466/466 (52 archivos), frontend 340/340 (42 archivos). El frontend compila con `vite build`.<br>2026-11-10, con la T7: backend 459/459 (52 archivos), frontend 334/334 (42 archivos). El frontend compila con `vite build`. |
| 9 | En la pestaña, × cierra el aviso de la primera compra; vuelve a salir al cambiar el periodo o la sucursal, y al volver a abrir la pestaña. Se ve y se usa bien a 390 px y a 1366 px. | 2026-10-30, copia de producción con un supervisor temporal de la Sucursal Central, ya borrado (Edge sin ventana, 1366 y 390 px, Este mes):<br>- al abrir sale el aviso de la primera compra, y la × lo cierra;<br>- cerrado, "Ver por Producto" no lo vuelve a mostrar;<br>- ir a Gastos y regresar a Compras lo muestra otra vez.<br>La × queda arriba a la derecha del aviso en los dos anchos. El periodo y la sucursal se probaron en `PurchasesTab.test`. _(Ese día también se probaron el aviso de los gastos y "Sumar", que se quitaron el 2026-11-10.)_<br>2026-11-10, con la T7, otra vez con un supervisor temporal, ya borrado (1366 y 390 px, Personalizado 1–31 oct):<br>- sale el aviso, y la × lo cierra;<br>- cerrado, "Ver por Producto" no lo vuelve a mostrar;<br>- cambiar el periodo al 2–31 oct lo muestra otra vez.<br>La × queda arriba a la derecha en los dos anchos. Volver a abrir la pestaña y cambiar la sucursal se probaron en `PurchasesTab.test`; sin el reinicio del aviso, fallan los tests del periodo y de la sucursal. |

## Dudas abiertas

- _Ninguna._

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-29 | Antes de redactar se resolvieron 9 dudas:<br>1. Una sola pestaña, "Compras", con el selector "Sumar: Solo compras / Compras y gastos".<br>2. Resumen: total comprado, número de compras, compra promedio y número de proveedores; con "Compras y gastos", el total separado en compras y gastos.<br>3. "Ver por" proveedor (por defecto), producto y sucursal (solo el admin central). Por producto, la cantidad, el total y el costo promedio de compra, con las variantes sumadas a su producto. Con "Compras y gastos", solo por proveedor.<br>4. Por proveedor: número de compras, total, % del total, compra promedio y última compra; con "Compras y gastos", las columnas Compras, Gastos y Total. Un proveedor inactivo lleva la marca "Inactivo".<br>5. Con "Compras y gastos" se suman los gastos activos con proveedor de las categorías que cuentan en la utilidad neta, y un aviso dice cuánto quedó fuera.<br>6. `reports.purchases` para superadmin, admin y supervisor; "Compras y gastos" pide también `reports.expenses`.<br>7. Sin gráfica.<br>8. Tocar un proveedor no abre nada.<br>9. Se documenta en `shared-features/`. | Usuario |
| 2026-10-29 | Creación de la spec, en **Borrador**. | — |
| 2026-10-29 | Pasa a **Lista**. | Usuario |
| 2026-10-29 | Implementación de T1–T5, con la evidencia de los criterios en la copia de producción. En el criterio 1, las cifras de la redacción son las del 28 oct, porque el 29 oct el usuario registró una cuarta compra. | — |
| 2026-10-30 | Cambio pedido por el usuario: los avisos se pueden cerrar, y vuelven a salir al cambiar un filtro o al abrir la vista del reporte (requisito 23, T6 y criterio 9). | Usuario |
| 2026-11-10 | Cambio pedido por el usuario: la pestaña Compras muestra solo compras. "Compras y gastos" dejaba fuera los gastos sin proveedor y no cuadraba con el módulo de Gastos. Se quitan "Sumar", "Compras y gastos" y el aviso de los gastos que no se suman (requisito 24, que deja sin efecto los requisitos 5, 7, 10, 13 y 19 y lo de los gastos de las decisiones 1, 2, 4, 5 y 6). Se ajustan el requisito 23 y los criterios 3, 5, 6, 8 y 9, y se agrega la T7, ya implementada, con la evidencia en la copia de producción. También se actualizan `feat-reporte-de-compras.md`, su fila en `sf-index.md`, la frase de la spec 16 en `feat-modulo-de-compras.md` y la decisión #8 y el paso 6 de `docs/reportes-borrador.md`. | Usuario |
| 2026-11-10 | Se aprueba el cierre: pasa a **Terminada**. | Usuario |
