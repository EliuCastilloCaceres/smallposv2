# feat: Rediseño de Ventas y utilidad y Tendencia de ventas

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Borrador** | feat | smallposv2 | smallpos-saas | Commit de la spec 08 (un solo commit) | 2026-10-26 |

## Resumen

Reestructura las pestañas **Ventas y utilidad** y **Tendencia de ventas** de Reportes con el mismo orden que **Valuación de inventario**. La regla es que cada control va arriba de lo que cambia. No cambian los endpoints, los cálculos, los presets, los límites ni los permisos.

- **Tarjeta de filtros, arriba de todo:**
  - los presets de periodo, con las fechas que cubre el elegido ("1 – 31 oct 2026");
  - la sucursal (admin central) y, en Ventas y utilidad, la categoría;
  - en Ventas y utilidad, "Excluir del cálculo: Ventas sin costo".

  En móvil se ven los presets y un botón "Filtros", con el número de filtros activos, que abre lo demás.
- **Ventas y utilidad:**
  - el resumen se lee como una cuenta: ventas netas − costo de lo vendido = **utilidad bruta**, con el margen;
  - el aviso de ventas sin costo va dentro del resumen, con "Excluirlas" o "Incluirlas";
  - el desglose tiene botones "Ver por", el número de filas y orden con un clic en los encabezados Venta neta, Utilidad y Margen (en móvil, un selector);
  - el costo de una fila con líneas sin costo sale en naranja con su ayuda, en lugar de la pastilla "Sin costo";
  - el SKU no se repite si es igual al nombre.
- **Tendencia de ventas:**
  - la tarjeta de la gráfica tiene, de arriba abajo: la métrica como botones; "Por" día, semana o mes y "Comparar" como botones; un título con la métrica, la granularidad y el periodo ("Monto vendido por mes · 1 nov 2025 – 31 oct 2026"); los KPIs, el aviso de ventas sin costo y la gráfica.
- **Piezas compartidas** en `Reports/components/`, que también usa Valuación.

Spec completa: [`specs/08-rediseno-ventas-y-tendencia.md`](../specs/08-rediseno-ventas-y-tendencia.md).

## Motivo

El usuario encontró las dos pestañas confusas: "hay menús de abajo que cambian la información de arriba".

- En Ventas y utilidad, los KPIs y el aviso estaban arriba y los filtros que los cambian, abajo. Además, la pastilla "Sin costo" aparecía en 10 de las primeras 13 filas.
- En Tendencia había dos filas de controles que mezclaban qué datos se ven con cómo se ven, y ni la gráfica ni los KPIs decían qué métrica mostraban.

## Historias de usuario

- Como **supervisor**, quiero que los filtros estén arriba de lo que cambian, para entender qué números estoy viendo.
- Como **supervisor**, quiero ver de un vistazo cuánto vendí, cuánto me costó y cuánto gané en el periodo, para no tener que armar la cuenta.
- Como **supervisor**, quiero ordenar la tabla tocando la columna, como en cualquier hoja de cálculo.
- Como **supervisor**, quiero elegir qué métrica ver en la gráfica con un solo toque y que la gráfica diga qué está mostrando.
- Como **supervisor**, quiero ver qué fechas cubre el periodo que elegí.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `frontend/src/components/Reports/tabs/ProfitTab.jsx` | Tarjeta de filtros, resumen como cuenta con el aviso de sin costo y desglose con "Ver por" y orden desde los encabezados. |
| `frontend/src/components/Reports/tabs/TrendTab.jsx` | Tarjeta de filtros y tarjeta de la gráfica con sus controles como botones, título y KPIs dentro. |
| `frontend/src/components/Reports/tabs/InventoryTab.jsx` | Usa las piezas compartidas, sin cambiar su comportamiento. |
| `frontend/src/components/Reports/reports.css` | Estilos comunes (`rpt-filter-card`, `rpt-summary`, `rpt-stat`, `rpt-note`, `rpt-section`, `rpt-button-group`, `rpt-period-label`), que antes eran `rpt-inv-*`, y la tarjeta de la gráfica (`rpt-chart-card`). |
| `frontend/src/utils/dateRanges.js` | `fmtRangeLabel(start, end)`: las fechas que cubre un rango. |
| `frontend/src/components/Reports/tabs/ProfitTab.test.jsx`, `TrendTab.test.jsx`, `InventoryTab.test.jsx` | Los casos del diseño nuevo; los de cálculo y alcance siguen igual. |
| `frontend/src/utils/dateRanges.test.js` | `fmtRangeLabel` con un día, el mismo mes, el mismo año y dos años. |

## Archivos agregados

| Archivo | Qué es |
|---|---|
| `frontend/src/components/Reports/components/FilterCard.jsx` | Tarjeta de filtros: `top` siempre visible y el resto detrás del botón "Filtros" en móvil. |
| `frontend/src/components/Reports/components/Sorting.jsx` | `SortHeader` (encabezado ordenable con `aria-sort`), `SortSelect` (selector de móvil) y `nextSort`. |
| `frontend/src/components/Reports/components/ButtonGroup.jsx` | Botones de una sola opción ("Ver por", métrica, granularidad, comparación). |
| `frontend/src/components/Reports/components/SummaryNote.jsx` | Aviso dentro del resumen con una acción opcional. |
| `frontend/src/components/Reports/components/FilterCard.test.jsx`, `Sorting.test.jsx` | Tests de las piezas compartidas. |

## Tareas realizadas

- [x] Piezas compartidas extraídas de Valuación de inventario.
- [x] Ventas y utilidad reestructurada. Como en Valuación, la tabla se dibuja con la agrupación de las filas que ya llegaron.
- [x] Tendencia de ventas reestructurada.

## Criterios de aceptación

_Pendiente. Se llenan después de implementar._

## Notas para portar a smallpos-saas

Revisado contra el código de smallpos-saas el 2026-10-26 (`db79cc7`).

- **Depende de las specs 04, 05 y 07:** saas todavía no tiene Ventas y utilidad, Tendencia de ventas ni Valuación de inventario (su módulo de Reportes solo tiene `CashSessionsTab`). Hay que portar antes [`feat-reporte-ventas-y-utilidad.md`](feat-reporte-ventas-y-utilidad.md), [`feat-tendencia-de-ventas.md`](feat-tendencia-de-ventas.md) y [`feat-valuacion-de-inventario.md`](feat-valuacion-de-inventario.md). Conviene portarlas ya con este diseño, en lugar de portar el diseño anterior y luego este.
- **Sin backend, permisos ni migraciones:** es solo frontend.
- **Sucursal:** en saas va en `X-Branch-Id` con `useScope` / `ScopeSelector`, como en `CashSessionsTab`. El selector de sucursal de la tarjeta de filtros se cambia por el `ScopeSelector`, y "Por sucursal" (en "Ver por" y en "Comparar") depende de que el alcance cubra más de una sucursal, no de ser "administrador central".
- **Tests:** los del frontend se adaptan cambiando los permisos por los códigos de saas y el alcance por `useScope`. Los de las piezas compartidas se portan tal cual.
