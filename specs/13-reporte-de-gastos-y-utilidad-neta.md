# 13 — Reporte de gastos y utilidad neta

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Terminada** | 2026-10-27 | 2026-10-27 |

## Objetivo

Es la segunda parte del **paso 5** del orden de [`docs/reportes-borrador.md`](../docs/reportes-borrador.md) (§6). La primera fue la [spec 12](12-modulo-de-gastos.md), el módulo para registrar gastos. Esta spec agrega dos cosas:
- **la pestaña Gastos** en Reportes, que responde "¿en qué y cuánto gasto?" (peticiones #1 y #2 del borrador, §3.1);
- **la utilidad neta** en Ventas y utilidad: utilidad bruta − gastos (decisión #9).

Es para supervisores y administradores.

**Datos de la copia de producción** (2026-10-27):
- Todavía no hay gastos registrados. El módulo existe desde la spec 12, y las 343 salidas de caja anteriores quedaron como "Salida de caja (histórico)", fuera de los gastos. Por eso, en cualquier periodo anterior la utilidad neta saldría igual a la bruta (decisión 6).
- Hay 7 categorías de gasto. Todas cuentan en la utilidad neta, salvo "Pago a proveedor (mercancía)".

**Base que ya existe:**
- **Spec 12:**
  - las tablas `expenses` y `expense_categories`;
  - la marca `counts_in_net_profit` de cada categoría;
  - el estado de cada gasto (`active` o `cancelled`) y su fecha (`expense_date`, día de México sin hora);
  - el permiso `expenses.read` y el módulo Gastos, donde está la lista de cada gasto.
- **Spec 04:** Ventas y utilidad (`reportService.getProfitReport`, `ProfitTab.jsx`), con el resumen "ventas netas − costo = utilidad bruta", el desglose por producto, categoría, sucursal o proveedor, y el alcance por sucursal.
- **Spec 08:** las piezas compartidas de Reportes (`Reports/components/`): tarjeta de filtros, botones de grupo, encabezado ordenable y aviso del resumen (`SummaryNote`).
- **Permisos de reportes:** cada pestaña tiene su permiso en `Reports/reportTabs.js`, y el menú muestra Reportes con cualquiera de ellos.

## Historias de usuario

- Como **supervisor**, quiero ver cuánto gasté en un periodo y en qué categorías, para saber a dónde se va el dinero.
- Como **supervisor**, quiero ver el gasto por sucursal, proveedor y método de pago, para comparar y detectar gastos fuera de lo normal.
- Como **administrador**, quiero ver la utilidad neta (lo que queda después de los gastos), para saber cuánto gana de verdad el negocio y no solo cuánto deja lo vendido.
- Como **administrador central**, quiero la utilidad neta de cada sucursal, para comparar cuál es rentable.
- Como **supervisor**, quiero que los pagos de mercancía no resten de la utilidad neta, porque su costo ya cuenta al vender.

## Alcance

**Incluye**
- Permiso `reports.expenses`, asignado por defecto a superadmin, admin y supervisor, por migración (decisión #29b).
- Endpoint `GET /api/reports/expenses` y la pestaña **Gastos** en Reportes: filtros, resumen y desglose (decisión 1).
- Utilidad neta en `GET /api/reports/profit` y en la pestaña Ventas y utilidad: en el resumen y en el desglose por sucursal (decisión 3).
- Aviso cuando el periodo empieza antes del primer gasto registrado (decisión 6).
- Tests de todo lo anterior.
- **Documentación en `shared-features/`:** sí, como `feat-reporte-de-gastos-y-utilidad-neta.md` (decisión 8 del usuario, 2026-10-27).

**No incluye**
- La lista de cada gasto: ya está en el módulo Gastos (spec 12).
- Gráfica del gasto en el tiempo (decisión 1).
- Utilidad neta en Tendencia de ventas (decisión 7) o en el Dashboard.
- Prorratear gastos por producto, categoría de producto o proveedor de producto: los gastos solo tienen sucursal (decisión 3).
- Convertir las salidas de caja históricas en gastos (spec 12, decisión 1).
- Exportación (decisión #30).
- Gastos recurrentes o presupuestos.

## Requisitos

### Permiso y pestaña
1. Una migración crea `reports.expenses` (módulo `reports`, acción `expenses`, descripción "Reporte de gastos") y lo asigna por nombre a **superadmin, admin y supervisor** (decisión #29b), en una transacción. No se asigna al cajero, al almacenista ni a roles creados por el usuario.
2. La pestaña **Gastos** aparece en Reportes, después de Rotación de inventario, solo con `reports.expenses`. El menú muestra Reportes con ese permiso aunque no haya otro de reportes.
3. La pantalla de permisos muestra la acción `expenses` del módulo Reportes como **"Gastos"**.

### Qué gastos cuentan
4. Cuentan los gastos **activos**, es decir, no cancelados, cuya **fecha del gasto** cae en el periodo. Las salidas de caja históricas (`legacy_expense`) y los retiros no son gastos.
5. **Alcance por sucursal**, igual que en Ventas y utilidad: un usuario con sucursal ve solo la suya, y el backend la fuerza. El admin central ve el consolidado y puede filtrar por una sucursal.

### Pestaña Gastos (decisiones 1 y 2)
6. **Filtros**, arriba, como en Ventas y utilidad:
   - periodo con sus presets (Hoy, Esta semana, Este mes por defecto, Personalizado) y las fechas que cubre;
   - sucursal, solo para el admin central.
7. **Resumen:**
   - **total gastado**, como cifra principal;
   - número de gastos y **gasto promedio** (total ÷ número de gastos; "—" sin gastos);
   - el total separado en **"Cuenta en la utilidad neta"** y **"No cuenta en la utilidad neta"**, según la marca actual de cada categoría (decisión 2).
8. **Desglose**, con "Ver por" **categoría** (por defecto), **sucursal**, **proveedor** o **método de pago**:
   - "Sucursal" solo aparece para el admin central en el consolidado;
   - los gastos sin proveedor se agrupan como **"Sin proveedor"**;
   - columnas: nombre, número de gastos, total y **% del total gastado**;
   - por categoría, las que no cuentan en la utilidad neta llevan la marca **"No cuenta en la utilidad neta"**;
   - ordenado por total, de mayor a menor, y paginado de 20 en 20;
   - en móvil, como tarjetas.
9. Sin gastos en el periodo, el resumen va en ceros y el desglose dice "No hay gastos en este periodo".

### Utilidad neta en Ventas y utilidad (decisiones 3–5)
10. **Gastos de la utilidad neta:** los gastos del requisito 4 de las categorías que **cuentan en la utilidad neta**, con la marca que tengan hoy. Si se cambia la marca de una categoría, cambia también la utilidad neta de los periodos pasados.
11. **Resumen:** la cuenta sigue: utilidad bruta − **gastos** = **utilidad neta**, con su **margen neto**.
    - El margen neto es utilidad neta ÷ ventas netas × 100; "—" si las ventas netas son 0.
    - La utilidad neta puede ser negativa, y entonces se ve en rojo, como la utilidad bruta negativa.
    - La utilidad neta pasa a ser la cifra principal del resumen; la utilidad bruta sigue a la vista, con su margen.
12. **Desglose por sucursal:** al ver por sucursal, cada fila agrega las columnas **Gastos** y **Utilidad neta**, con los gastos de esa sucursal.
    - Aparecen las sucursales con ventas **o** con gastos en el periodo, para que las filas sumen lo mismo que el resumen. Una sucursal con gastos y sin ventas tiene venta neta, costo y utilidad bruta en $0, y margen "—".
    - Por producto, categoría o proveedor el desglose queda como hoy: los gastos no tienen esas dimensiones.
13. **Filtro de categoría de producto** (decisión 4): mientras haya una categoría elegida, la utilidad neta no se muestra, ni en el resumen ni en el desglose. En su lugar, un aviso informativo: *"La utilidad neta se calcula con todas las categorías. Quita el filtro de categoría para verla."*
14. **"Excluir ventas sin costo"** solo cambia las ventas; los gastos se restan igual.
15. **Permiso** (decisión 5): la utilidad neta la ve quien tiene **`reports.profit` y `reports.expenses`**. Con solo `reports.profit`, la pestaña queda como hoy, con la utilidad bruta; el backend no manda los gastos.

### Aviso del primer gasto (decisión 6)
16. El **primer gasto registrado** es la fecha más antigua de un gasto activo, dentro del alcance de sucursal del filtro.
17. Si el periodo empieza antes de esa fecha, la pestaña Gastos y la utilidad neta de Ventas y utilidad muestran un aviso informativo: *"El primer gasto registrado es del 27 oct 2026; antes de esa fecha la utilidad neta no incluye gastos."*
18. Si todavía no hay ningún gasto registrado, el aviso dice: *"Todavía no hay gastos registrados, así que la utilidad neta es igual a la bruta."* En la pestaña Gastos basta el mensaje de "No hay gastos en este periodo".

### Endpoints
19. `GET /api/reports/expenses` con `reports.expenses`. Parámetros:
    - `start_date` y `end_date`, obligatorios;
    - `branch_id`;
    - `group_by`: `category`, `branch`, `provider` o `payment_method`;
    - `page` y `limit`.

    Responde las filas del desglose, la paginación, el resumen del requisito 7 y la fecha del primer gasto. Un parámetro inválido responde 400 con un mensaje en español.
20. `GET /api/reports/profit` agrega al resumen los gastos, la utilidad neta, el margen neto y la fecha del primer gasto. Al agrupar por sucursal, agrega a cada fila sus gastos y su utilidad neta. Solo los manda si se cumplen los requisitos 13 y 15; si no, esos campos no vienen.

### Migración
21. `012-add-reports-expenses-permission.sql`, en una transacción, como las migraciones de permisos de reportes.

### Documentación
22. `shared-features/feat-reporte-de-gastos-y-utilidad-neta.md` documenta la spec con la estructura de `sf-index.md` y se agrega al índice.

## Tareas

- [x] **T1. Permiso `reports.expenses`** (requisitos 1–3 y 21).
  — tests: la migración asigna el permiso a superadmin, admin y supervisor, y a ningún otro rol, incluidos los creados por el usuario; el menú y la pestaña aparecen con solo `reports.expenses`; la etiqueta en Permisos.
- [x] **T2. API del reporte de gastos** (requisitos 4–5, 7–9, 16 y 19).
  — tests:
  - el resumen, con el total separado por la marca de la categoría;
  - el desglose por categoría, sucursal, proveedor ("Sin proveedor") y método de pago, con el % del total, el orden y la paginación;
  - los cancelados no cuentan, y la fecha del gasto decide el periodo;
  - el alcance por sucursal;
  - la fecha del primer gasto;
  - respuestas 400 y 403.
- [x] **T3. Pestaña Gastos** (requisitos 2, 6–9, 17 y 18).
  — tests, con la API simulada: los filtros y sus parámetros, el resumen, el desglose con cada "Ver por", la marca de las categorías que no cuentan, el aviso del primer gasto y "Sucursal" solo para el admin central.
- [x] **T4. Utilidad neta en la API de Ventas y utilidad** (requisitos 10–16 y 20).
  — tests:
  - los gastos y la utilidad neta del resumen, con el margen neto;
  - solo restan las categorías que cuentan en la utilidad neta, y los cancelados no;
  - las filas por sucursal, incluida una sucursal con gastos y sin ventas;
  - sin utilidad neta con un filtro de categoría o sin `reports.expenses`;
  - "Excluir ventas sin costo" no cambia los gastos;
  - el alcance por sucursal y la fecha del primer gasto.
- [x] **T5. Utilidad neta en la pestaña Ventas y utilidad** (requisitos 11–13, 15, 17 y 18).
  — tests, con la API simulada: la cuenta del resumen con la utilidad neta, las columnas por sucursal, el aviso con el filtro de categoría, la pestaña sin utilidad neta cuando la API no la manda, y el aviso del primer gasto.
- [x] **T6. Documentación** (requisito 22).
  — tests: no lleva tests de código.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | Un supervisor ve la pestaña Gastos con el total, el número de gastos, el promedio y el total separado por la marca de la categoría, y el desglose con cada "Ver por". Los gastos cancelados no cuentan. | 2026-10-27, copia de producción (`marksexpressv2`), octubre, con los 4 gastos del usuario (uno cancelado) y 5 gastos temporales de QA (uno cancelado). El supervisor de la Sucursal Central vio:<br>- un total de $11,000.00 en 6 gastos, con un promedio de $1,833.33;<br>- $5,750.00 que cuentan en la utilidad neta y $5,250.00 que no;<br>- por categoría: "Pago a proveedor (mercancía)" $5,250.00 (47.73%, con la marca "No cuenta"), Renta $5,000.00, Servicios $450.00 e Insumos $300.00;<br>- por proveedor, con "Sin proveedor" $5,750.00, y por método de pago.<br>Los dos cancelados no contaron. Tests `reports/expenses.test.js` y `ExpensesTab.test.jsx`. |
| 2 | Un usuario de sucursal ve solo los gastos de la suya; el admin central ve el consolidado, filtra por sucursal y puede ver por sucursal. | 2026-10-27, copia de producción con una sucursal temporal:<br>- el supervisor, aunque pidió la otra sucursal, siguió viendo solo la suya ($11,000.00);<br>- el admin central vio el consolidado ($11,800.00 en 7 gastos), filtró la sucursal temporal ($800.00) y vio por sucursal.<br>Tests `reports/expenses.test.js` y `ExpensesTab.test.jsx`. |
| 3 | Ventas y utilidad muestra los gastos, la utilidad neta y el margen neto en el resumen y por sucursal. Los gastos coinciden con el total "Cuenta en la utilidad neta" de la pestaña Gastos para el mismo periodo y sucursal. | 2026-10-27, copia de producción, octubre:<br>- **consolidado:** utilidad bruta $16,652.29 − gastos $6,550.00 = utilidad neta $10,102.29, con margen neto de 12.07%;<br>- **por sucursal:** la Central con $5,750.00 de gastos y $10,902.29 de utilidad neta, y la sucursal temporal, sin ventas, con $800.00 de gastos y −$800.00;<br>- **coincidencia:** los gastos de Ventas y utilidad son iguales a "Cuenta en la utilidad neta" de la pestaña Gastos, $6,550.00 en el consolidado y $5,750.00 en la Central.<br>Las capturas detectaron que el desglose decía "2 sucursales con ventas" aunque una solo tenía gastos; ahora dice "con ventas o gastos". Tests `reports/profit-net.test.js` y `ProfitTab.test.jsx`. |
| 4 | Con un filtro de categoría de producto, o sin `reports.expenses`, Ventas y utilidad no muestra la utilidad neta. Con el filtro, avisa por qué. | 2026-10-27, copia de producción:<br>- con la categoría Abarrotes, la API no mandó la utilidad neta y la pestaña mostró el aviso con "Quitar el filtro";<br>- un rol temporal con solo `reports.profit` vio la pestaña Ventas y utilidad sin la utilidad neta, ni en el resumen ni por sucursal, y recibió 403 en el reporte de Gastos.<br>Tests `reports/profit-net.test.js` y `ProfitTab.test.jsx`. |
| 5 | Un periodo que empieza antes del primer gasto registrado muestra el aviso con su fecha. | 2026-10-27, copia de producción: el primer gasto registrado es del 27 oct 2026, y "Este mes" (1–31 oct) mostró el aviso en las dos pestañas. En septiembre, la utilidad neta resta $0 de gastos y trae la misma fecha para el aviso. Tests `reports/expenses.test.js`, `ExpensesTab.test.jsx` y `ProfitTab.test.jsx`, incluido el aviso de "Todavía no hay gastos registrados". |
| 6 | Los permisos por defecto son los del requisito 1. | 2026-10-27, copia de producción después de la `012`: `reports.expenses` lo tienen superadmin, admin y supervisor; el cajero, el almacenista y los roles creados por el usuario no lo tienen. Test `012-add-reports-expenses-permission.test.js`. |
| 7 | La pestaña Gastos y la utilidad neta se ven y se usan bien en móvil. | 2026-10-27, capturas a 390 px de la pestaña Gastos (resumen, aviso y desglose en tarjetas, con la marca "No cuenta") y de Ventas y utilidad, con la cuenta hasta la utilidad neta, una cifra debajo de otra. |
| 8 | `shared-features/feat-reporte-de-gastos-y-utilidad-neta.md` existe y está en el índice. | `shared-features/feat-reporte-de-gastos-y-utilidad-neta.md`, en la tabla de `sf-index.md`. |
| 9 | Los tests del backend y del frontend pasan. | 2026-10-27: backend 320/320 (39 archivos), frontend 253/253 (33 archivos). |

## Dudas abiertas

- _Ninguna._

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-27 | Antes de redactar se resolvieron 8 dudas:<br>1. La pestaña Gastos lleva filtros de periodo y sucursal, un resumen (total, número de gastos y promedio) y un desglose por categoría, sucursal, proveedor o método de pago. No lleva gráfica.<br>2. Las categorías que no cuentan en la utilidad neta, como "Pago a proveedor (mercancía)", entran al total del reporte, con el total separado en "Cuenta" y "No cuenta" y una marca en el desglose.<br>3. La utilidad neta va en el resumen de Ventas y utilidad y en su desglose por sucursal.<br>4. Con un filtro de categoría de producto, la utilidad neta se oculta y se avisa por qué.<br>5. La utilidad neta la ve quien tiene `reports.profit` y `reports.expenses`.<br>6. Si el periodo empieza antes del primer gasto registrado, se avisa con esa fecha.<br>7. La utilidad neta no va en Tendencia de ventas por ahora.<br>8. Se documenta en `shared-features/`. | Usuario |
| 2026-10-27 | Creación de la spec, en **Borrador**. | — |
| 2026-10-27 | Se aprueba la spec: pasa a **Lista**. | Usuario |
| 2026-10-27 | T1 terminada: migración `012-add-reports-expenses-permission.sql`, pestaña Gastos en `reportTabs.js` y la etiqueta "Gastos" en Permisos. | — |
| 2026-10-27 | T2 terminada: `GET /api/reports/expenses` (`reportService.getExpenseReport`). | — |
| 2026-10-27 | T3 terminada: `Reports/tabs/ExpensesTab.jsx`. | — |
| 2026-10-27 | T4 terminada: `getProfitReport` recibe `includeNet`, que el controller manda con `reports.expenses` y sin filtro de categoría. Por sucursal, las filas con utilidad neta se completan con las sucursales que solo tienen gastos, y se ordenan y paginan en JS. Tres tests de la spec 04 (`profit.test.js`) ahora esperan `net`, porque el admin tiene `reports.expenses`; sin gastos, la utilidad neta es igual a la bruta. | — |
| 2026-10-27 | T5 terminada: la cuenta del resumen de `ProfitTab.jsx` sigue hasta la utilidad neta, con columnas por sucursal y los avisos. El aviso del filtro de categoría trae el botón "Quitar el filtro". | — |
| 2026-10-27 | T6 terminada: `shared-features/feat-reporte-de-gastos-y-utilidad-neta.md`. | — |
| 2026-10-27 | Verificación en la copia de producción con usuarios temporales (`claude_qa13_admin`, `claude_qa13_sup` y `claude_qa13_util`), el rol `qa_solo_utilidad`, la sucursal "Sucursal QA spec 13" y 5 gastos de QA. Al terminar se borraron. Los 4 gastos que registró el usuario y sus comprobantes no se tocaron. Se llena la evidencia de los 9 criterios de aceptación. Queda en **Lista** hasta que el usuario apruebe pasarla a Terminada. | — |
| 2026-10-27 | Se aprueba el cierre: pasa a **Terminada**. | Usuario |
