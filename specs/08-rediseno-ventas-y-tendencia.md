# 08 — Rediseño de Ventas y utilidad y Tendencia de ventas

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Lista** | 2026-10-26 | 2026-10-26 |

## Objetivo

Reestructura las pestañas **Ventas y utilidad** (spec 04) y **Tendencia de ventas** (spec 05) para que sean más simples de leer y de usar, con el mismo orden que ya tiene **Valuación de inventario** (spec 07). Lo pidió el usuario el 2026-10-26: "hay menús de abajo que cambian la información de arriba".

**Problemas de hoy** (revisados con capturas de la pantalla real sobre la copia de producción):
- **Ventas y utilidad:**
  - los KPIs y el aviso de ventas sin costo están arriba, pero los filtros que los cambian (periodo, sucursal, categoría y "Excluir ventas sin costo") están debajo;
  - en la misma fila de filtros se mezclan cosas que cambian todo (periodo, sucursal) con cosas que solo cambian la tabla (agrupar y ordenar);
  - el orden se elige con un selector y un botón aparte, lejos de las columnas;
  - la pastilla "Sin costo" se repite en muchas filas y satura la tabla (10 de las primeras 13 filas de octubre);
  - no se ve qué fechas cubre "Este mes" o "Esta semana".
- **Tendencia de ventas:**
  - hay dos filas de controles: una cambia qué datos se ven (periodo, sucursal) y la otra cómo se ven (métrica, día/semana/mes, comparación), sin que se distingan;
  - la métrica está escondida en un selector, y ni los KPIs ni la gráfica dicen qué métrica muestran;
  - no se ven las fechas que cubre el preset.

**No cambian** los endpoints, los cálculos, los presets, los límites de granularidad ni los permisos. Es un cambio de presentación.

## Historias de usuario

- Como **supervisor**, quiero que los filtros estén arriba de lo que cambian, para entender qué números estoy viendo.
- Como **supervisor**, quiero ver de un vistazo cuánto vendí, cuánto me costó y cuánto gané en el periodo, para no tener que armar la cuenta.
- Como **supervisor**, quiero ordenar la tabla tocando la columna, como en cualquier hoja de cálculo.
- Como **supervisor**, quiero elegir qué métrica ver en la gráfica con un solo toque y que la gráfica diga qué está mostrando.
- Como **supervisor**, quiero ver qué fechas cubre el periodo que elegí.

## Alcance

**Incluye**
- Ventas y utilidad y Tendencia de ventas con el orden de Valuación: tarjeta de filtros arriba, resumen y luego el desglose o la gráfica, cada uno con sus propios controles encima.
- Las fechas reales del periodo elegido.
- Orden de la tabla desde los encabezados en Ventas y utilidad.
- Las piezas comunes de las tres pestañas (tarjeta de filtros con su botón de móvil, encabezado ordenable y estilos del resumen) pasan a un solo lugar y las usa también Valuación, sin cambiar su comportamiento.
- Tests de todo lo anterior.
- **Documentación en `shared-features/`:** sí, como `feat-rediseno-ventas-y-tendencia.md` (decisión del usuario, 2026-10-26).

**No incluye**
- Cambios en los cálculos, los endpoints, los presets, los límites o los permisos.
- Ordenar Ventas y utilidad por costo: el endpoint solo ordena por venta neta, utilidad y margen.
- La pestaña Sesiones de caja.
- Pasar las gráficas del Dashboard a este diseño.
- Portar el rediseño a smallpos-saas: aquí solo se documenta.

## Requisitos

### Reglas comunes
1. **Cada control va arriba de lo que cambia.**
   - Lo que cambia toda la pestaña (periodo, sucursal, categoría, exclusiones) va en una **tarjeta de filtros** arriba de todo.
   - Lo que solo cambia la tabla o la gráfica ("Ver por", orden, métrica, granularidad, comparación) va en el encabezado de esa sección.
2. **Mismo lenguaje visual que Valuación de inventario:** tarjeta de filtros, tarjeta de resumen con una cifra principal, secciones con título, botones "Ver por" y orden desde los encabezados.
3. **Piezas compartidas:** la tarjeta de filtros con su botón "Filtros" de móvil, el encabezado ordenable y los estilos del resumen y de los avisos salen de `InventoryTab.jsx` a `frontend/src/components/Reports/components/`, y los estilos `rpt-inv-*` que se comparten pasan a nombres comunes en `reports.css`. Valuación las usa sin cambiar su comportamiento.
4. **Periodo visible:** junto a los presets se muestran las fechas que cubre el periodo elegido; por ejemplo, "1 – 31 oct 2026" o "1 nov 2025 – 31 oct 2026".
5. **Móvil:** se ven los presets de periodo y el botón **"Filtros"**, con el número de filtros activos; la sucursal, la categoría y las exclusiones se abren con ese botón, como en Valuación.

### Ventas y utilidad
6. **Tarjeta de filtros:** presets de periodo (Hoy, Esta semana, Este mes y Personalizado, como hoy), sucursal (solo el administrador central), categoría y **"Excluir del cálculo: Ventas sin costo"**.
7. **Resumen,** como una cuenta que se lee de izquierda a derecha:

   ```
   Ventas netas        Costo de lo vendido       Utilidad bruta
   $82,487.50     −    $45,282.70           =    $37,204.80   Margen 45.1%
   ```

   La utilidad bruta es la cifra principal. En móvil, las tres cifras van una debajo de otra, con la utilidad al final.
8. **Aviso de ventas sin costo,** dentro del resumen:
   - con la exclusión apagada y líneas sin costo en el periodo, dice cuántas son y cuánto suman de venta neta, que su utilidad cuenta completa, y tiene el botón **"Excluirlas"**;
   - con la exclusión encendida, dice "No se están contando las ventas sin costo" y tiene el botón **"Incluirlas"**.
9. **Desglose:**
   - encabezado con el título, los botones **"Ver por"** (Producto, Categoría, Sucursal y Proveedor; Sucursal solo para el administrador central sin sucursal filtrada) y el número de filas ("690 productos con ventas");
   - se ordena con un clic en los encabezados **Venta neta, Utilidad y Margen**; otro clic invierte el orden y la columna ordenada muestra una flecha. Por defecto, utilidad de mayor a menor, como hoy. En móvil, con un selector "Ordenar".
10. **Sin costo en la tabla:** en lugar de la pastilla "Sin costo" junto al nombre, el costo de una fila con líneas sin costo se muestra en naranja, con la ayuda "Incluye N líneas sin costo ($X de venta neta)". Es la misma marca que usan Productos y Valuación.
11. El SKU no se repite si es igual al nombre.

### Tendencia de ventas
12. **Tarjeta de filtros:** presets de periodo (Este mes, Últimos 3 meses, Este año, Últimos 12 meses y Personalizado, como hoy) y sucursal (solo el administrador central).
13. **Tarjeta de la gráfica,** de arriba abajo:

    ```
    [Monto vendido] [Número de ventas] [Utilidad bruta] [Ticket promedio]
    Por: [Día] [Semana] [Mes]          Comparar: [Ninguna] [Año anterior] [Por sucursal]
    Monto vendido por mes · nov 2025 – oct 2026
    Total $1,286,853.18 · Promedio por mes $107,237.76 · Mejor mes $132,002.50 (junio 2026)
    (aviso de ventas sin costo, solo con Utilidad bruta)
    (gráfica)
    ```

    - **Métrica** como botones, no como selector.
    - **Granularidad** y **comparación** como botones. Una granularidad fuera de su límite sigue deshabilitada con su explicación, y "Por sucursal" sigue solo para el administrador central sin sucursal filtrada (spec 05).
    - **Título** con la métrica, la granularidad y el periodo.
    - **KPIs** de la métrica elegida, los mismos de hoy, ahora dentro de la tarjeta y debajo del título.
    - El aviso de ventas sin costo y la gráfica no cambian.

### Documentación
14. `shared-features/feat-rediseno-ventas-y-tendencia.md` documenta la spec con la estructura de `sf-index.md` y se agrega al índice. Sus notas para portar dicen que depende de portar antes las specs 04, 05 y 07.
15. En el historial de las specs 04 y 05 se anota que esta spec redefine su presentación (spec 04, requisitos 14, 16, 17, 19 y 21; spec 05, requisitos 7, 10, 16 y 24). Sus cálculos y sus criterios de aceptación siguen vigentes.

## Tareas

- [ ] **T1. Piezas compartidas** (requisitos 2, 3 y 5).
  — tests: los de `InventoryTab.test.jsx` siguen pasando sin cambios de comportamiento; el encabezado ordenable marca `aria-sort` e invierte el orden en el segundo clic; el botón "Filtros" muestra los filtros activos y abre los demás.
- [ ] **T2. Ventas y utilidad** (requisitos 4 y 6–11).
  — tests, con la API simulada:
  - los filtros mandan sus parámetros y vuelven a la página 1, y se ven las fechas del preset;
  - el resumen muestra ventas netas, costo, utilidad y margen;
  - el aviso de ventas sin costo ofrece "Excluirlas", y con la exclusión encendida, "Incluirlas";
  - "Ver por" cambia la agrupación; Sucursal solo para el administrador central sin sucursal filtrada;
  - un clic en el encabezado ordena de mayor a menor y otro lo invierte; Costo no ordena; el selector de móvil manda la columna y la dirección;
  - el costo de una fila con líneas sin costo sale en naranja con su ayuda, y ya no hay pastilla;
  - el SKU no se repite si es igual al nombre.
- [ ] **T3. Tendencia de ventas** (requisitos 4, 12 y 13).
  — tests, con la API simulada:
  - la métrica, la granularidad y la comparación son botones y mandan o cambian lo mismo que hoy;
  - el título dice la métrica, la granularidad y el periodo;
  - los KPIs cambian con la métrica, dentro de la tarjeta;
  - siguen pasando los casos de la spec 05: granularidad fuera de límite deshabilitada, "Por sucursal" solo para el administrador central, aviso de ventas sin costo y tooltip.
- [ ] **T4. Documentación** (requisitos 14 y 15).
  — tests: no lleva tests de código.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | En las dos pestañas, todo lo que cambia la pestaña completa está en la tarjeta de filtros, arriba de todo, y los controles de la tabla o la gráfica están en su encabezado. | _(se llena al cerrar)_ |
| 2 | Ventas y utilidad muestra la cuenta ventas − costo = utilidad, con el aviso de ventas sin costo y sus botones, y la tabla se ordena desde los encabezados. | _(se llena al cerrar)_ |
| 3 | En Tendencia de ventas, la métrica, la granularidad y la comparación se eligen con botones arriba de los KPIs y la gráfica, y la gráfica tiene un título que dice qué muestra. | _(se llena al cerrar)_ |
| 4 | Con la copia de producción, los números no cambian: los KPIs de Ventas y utilidad y de Tendencia de ventas dan lo mismo que antes del rediseño para Este mes y Últimos 12 meses. | _(se llena al cerrar)_ |
| 5 | Valuación de inventario sigue funcionando igual con las piezas compartidas. | _(se llena al cerrar)_ |
| 6 | Las dos pestañas se ven y se usan bien en móvil. | _(se llena al cerrar)_ |
| 7 | `shared-features/feat-rediseno-ventas-y-tendencia.md` existe y está en el índice, y las specs 04 y 05 tienen la nota en su historial. | _(se llena al cerrar)_ |
| 8 | Los tests del backend y del frontend pasan. | _(se llena al cerrar)_ |

## Dudas abiertas

- _Ninguna._

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-26 | Antes de redactar se resolvieron 2 dudas:<br>1. El rediseño va en su propia spec, después de cerrar la 07; la edición de productos desde Valuación va en la 07.<br>2. Se documenta en `shared-features/`. | Usuario |
| 2026-10-26 | Creación de la spec, en **Borrador**. El diseño sigue el de Valuación de inventario (spec 07), que el usuario aprobó. | — |
| 2026-10-26 | Se aprueba la spec: pasa a **Lista**. | Usuario |
