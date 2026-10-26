# 05 — Tendencia de ventas

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Terminada** | 2026-10-20 | 2026-10-22 |

## Objetivo

Es la **spec 2** del orden de [`docs/reportes-borrador.md`](../docs/reportes-borrador.md) (§6). Agrega al módulo de Reportes la pestaña **Tendencia de ventas**: una gráfica de cómo evolucionan las ventas en el tiempo, por día, semana o mes, con la opción de compararla contra el año anterior o entre sucursales. Responde "¿voy mejor o peor que antes?" y "¿qué sucursal crece?". Es para supervisores y administradores.

**Base que ya existe:**
- **Spec 04:**
  - el módulo de Reportes tiene pestañas por permiso (`frontend/src/components/Reports/reportTabs.js`);
  - la fórmula de venta neta por línea vive en `backend/src/helpers/soldLines.js`;
  - los presets de fechas, en `frontend/src/utils/dateRanges.js`.
- **Spec 03:** `orders` tiene índices de fecha (`idx_orders_created`, `idx_orders_branch_created`).
- **Dashboard:** `dashboardService.getKpis` calcula el ingreso neto (`o.total` − lo reembolsado), el número de ventas y el ticket promedio. `utils/timezone.js` convierte `created_at` a la hora de México (`createdAtMx`) y el rango de fechas a la hora del servidor (`toServerRange`).
- **No hay librería de gráficas.** El Dashboard dibuja las suyas a mano en SVG, con la paleta `CHART_COLORS`, que no está exportada.

## Historias de usuario

- Como **supervisor**, quiero ver cómo evolucionan las ventas, la utilidad y el ticket promedio por día, semana o mes, para detectar temporadas, caídas y crecimientos.
- Como **supervisor**, quiero comparar el periodo actual contra el mismo periodo del año anterior, para saber si el negocio va mejor o peor que antes.
- Como **administrador central**, quiero ver la tendencia de cada sucursal en la misma gráfica, para saber cuál crece y cuál se estanca.
- Como **supervisor**, quiero ver el total, el promedio y el mejor periodo del rango, para resumir la tendencia sin leer punto por punto.
- Como **supervisor**, quiero saber si la utilidad de la gráfica incluye ventas sin costo, para no confiar en una utilidad inflada.

## Alcance

**Incluye**
- Permiso `reports.trend`, asignado por defecto a superadmin, admin y supervisor, por migración.
- Endpoint `GET /api/reports/trend` con periodos por día, semana o mes, cuatro métricas, KPIs y las comparaciones "Año anterior" y "Por sucursal".
- Pestaña **Tendencia de ventas** con gráfica de líneas (Recharts), presets propios, selectores de métrica, granularidad y comparación, KPIs y aviso de ventas sin costo.
- Recharts como dependencia del frontend.
- La paleta `CHART_COLORS` pasa a un archivo compartido entre el Dashboard y la pestaña nueva.
- Tests de todo lo anterior.
- **Documentación en `shared-features/`:** sí, como `feat-tendencia-de-ventas.md` (decisión del usuario, 2026-10-20).

**No incluye**
- Unidades vendidas como métrica: mezclan unidades de medida (decisión #20 del borrador).
- Granularidad por hora: ya la muestra el Dashboard (ventas por hora).
- Comparar contra el periodo inmediato anterior (decisión #21), o combinar "Año anterior" con "Por sucursal" (decisión #21b).
- Filtro de ventas sin costo: solo se avisa (decisión 2 de esta spec).
- Utilidad neta: llega con el módulo de gastos.
- Exportar a CSV, imprimir o descargar la gráfica (decisión #30).
- Pasar las gráficas del Dashboard a Recharts.
- Portar la pestaña a smallpos-saas: aquí solo se documenta.

## Requisitos

### Permiso y acceso
1. Una migración crea el permiso `reports.trend` (módulo `reports`, acción `trend`, descripción "Reporte de tendencia de ventas") y lo asigna a los roles **superadmin, admin y supervisor**, buscándolos por nombre, igual que la migración 003 de la spec 04. No se asigna al cajero, al almacenista ni a roles creados por el usuario.
2. La pantalla de permisos (`Settings/modals/PermissionsModal.jsx`) muestra la acción `trend` como **"Tendencia"**.
3. La pestaña **Tendencia de ventas** se agrega a `reportTabs.js` después de Ventas y utilidad, con el permiso `reports.trend`. El menú, el guard de `/reports` y la primera pestaña permitida ya funcionan con esa lista (spec 04).
4. `GET /api/reports/trend` exige `reports.trend` y responde 403 sin él.

### Alcance por sucursal
5. Igual que el Dashboard y Ventas y utilidad:
   - un usuario con sucursal asignada ve solo la suya; el backend la fuerza aunque mande otro `branch_id`;
   - el administrador central ve el consolidado y puede filtrar por una sucursal.

### Rango, presets y granularidad
6. **Presets** (decisión 1), alineados al calendario, en `utils/dateRanges.js`:

   | Preset | Rango | Granularidad automática |
   |---|---|---|
   | Este mes | Del día 1 al último día del mes actual | Día |
   | Últimos 3 meses | Del día 1 de hace dos meses al último día del mes actual | Semana |
   | Este año | Del 1 de enero al 31 de diciembre del año actual | Mes |
   | Últimos 12 meses | Del día 1 de hace 11 meses al último día del mes actual | Mes |
   | Personalizado | Fechas de inicio y fin elegidas | Según el rango |

   La pestaña empieza en **Últimos 12 meses**. "Hoy" es la fecha de México.
7. **Granularidad automática** (decisión #19): rango de hasta 31 días → día; hasta 183 días → semana; más → mes. El usuario la puede cambiar con un selector Día / Semana / Mes. Al cambiar el rango, vuelve a la automática.
8. **Límites** (decisión 5):
   - por día, el rango puede tener hasta 92 días;
   - por semana, hasta 731 días (2 años);
   - por mes, hasta 1,827 días (5 años), que es también el rango máximo.

   En el selector, la granularidad que se pasa del límite aparece deshabilitada con la explicación (por ejemplo, "Por día: hasta 92 días"). "Personalizado" no deja elegir un rango de más de 5 años. El backend responde 400 si se pide una granularidad fuera de su límite o un rango de más de 5 años.
9. **Periodos:**
   - **Días** de México: una venta de las 23:30 hora de México cuenta en ese día.
   - **Semanas** de lunes a domingo, como el preset "Esta semana" del Dashboard.
   - **Meses** calendario.

### Métricas
10. Cuatro métricas, con un selector (decisión #20 y decisión 10 de esta spec):
    - **Monto vendido:** `o.total` − lo reembolsado en devoluciones completadas, el mismo ingreso neto de los KPIs del Dashboard (`getKpis`).
    - **Número de ventas:** órdenes con estado `completed`, `partial_refund` o `refunded`, incluidas las devueltas por completo, igual que el Dashboard.
    - **Utilidad bruta:** venta neta − costo por línea, con la fórmula de la spec 04 (`helpers/soldLines.js`).
    - **Ticket promedio:** monto vendido ÷ número de ventas del periodo.
11. Las ventas cuentan por su fecha (`orders.created_at`) en hora de México. Una venta a crédito cuenta el día de la venta y un apartado el día en que se liquida. Las devoluciones se restan en la fecha de la venta (decisión #11).
12. Las fórmulas **se comparten** con el Dashboard (monto, ventas y ticket) y con Ventas y utilidad (utilidad); no se copian. Para el mismo rango y sucursal:
    - la suma de los periodos coincide con los KPIs del Dashboard en monto y número de ventas;
    - el ticket del rango coincide con el ticket promedio del Dashboard;
    - la utilidad coincide con la utilidad bruta de Ventas y utilidad con los filtros apagados.

### Periodos sin ventas, futuros y en curso
13. **Periodos pasados sin ventas** valen 0 en monto, número de ventas y utilidad, y se dibujan; la línea no los salta (decisión 4). El **ticket promedio** de un periodo sin ventas queda sin valor: la línea del ticket se corta ahí, el tooltip dice "sin ventas" y el periodo no cuenta para el mejor periodo. Esto aplica también a la serie del año anterior y a las de cada sucursal.
14. **Periodos futuros** (empiezan después de hoy) aparecen en el eje, pero sin valor: la línea del periodo actual termina hoy. La serie de "Año anterior" sí tiene valores en esos periodos.
15. Marcas en el tooltip:
    - **En curso:** el periodo que contiene hoy.
    - **Parcial:** los periodos de los extremos que quedan a medias, porque el rango empieza o termina a la mitad de una semana o de un mes. Solo suman los días dentro del rango, y el tooltip dice cuáles son; por ejemplo, "Semana del 27 jul al 2 ago · parcial: 1–2 ago". Así, los totales cuadran con el Dashboard para el rango elegido.

### Comparación
16. Selector de comparación, una a la vez (decisión #21b): **Ninguna** (por defecto), **Año anterior** y **Por sucursal**.
17. **Año anterior** (decisión 3):
    - **Por día y por semana:** cada periodo se compara con el que está 364 días antes (52 semanas exactas): jueves contra jueves, y semanas completas de lunes a domingo.
    - **Por mes:** contra el mismo mes del año anterior.
    - Con una sucursal filtrada, se compara esa sucursal; si no, el total.
    - El tooltip muestra la fecha real del periodo del año anterior; por ejemplo, "jue 16 oct 2025".
18. **Por sucursal:**
    - solo la ve el administrador central en la vista consolidada, sin sucursal filtrada; el backend responde 400 si la pide otro usuario o con una sucursal filtrada;
    - dibuja una línea por cada sucursal con ventas en el rango.

### Gráfica
19. **Siempre de líneas** (decisión 7), con Recharts:
    - el periodo actual, en línea continua;
    - "Año anterior", punteada;
    - en "Por sucursal", una línea por sucursal con los colores de `CHART_COLORS`, con leyenda.
20. **Eje X:** la etiqueta de cada periodo, por ejemplo "15 oct", "sem 12 oct" u "oct 2026", con `date-fns` en español. **Eje Y:** pesos en monto, utilidad y ticket; enteros en número de ventas.
21. **Tooltip:**
    - el periodo completo ("jue 15 oct 2026", "Semana del 12 al 18 oct 2026" u "octubre 2026");
    - el valor de cada serie con el formato de la métrica;
    - las marcas "en curso" y "parcial" cuando aplican, y "sin ventas" en el ticket de un periodo sin ventas.
22. Se ajusta al ancho del contenedor y se ve en móvil.
23. **Paleta compartida:** `CHART_COLORS` sale de `Dashboard.jsx` a un archivo compartido, que usan el Dashboard y esta pestaña. El Dashboard sigue viéndose igual.

### KPIs
24. Las tarjetas dependen de la métrica (decisión 8):
    - **Monto vendido, número de ventas y utilidad:**
      - **Total** a la fecha;
      - **Promedio por periodo**: el total a la fecha ÷ los periodos que ya empezaron, incluido el que está en curso;
      - **Mejor periodo**: su etiqueta y su valor.
    - **Ticket promedio:**
      - **Ticket del rango**: monto ÷ ventas a la fecha, o "—" sin ventas;
      - **Mejor periodo**: entre los periodos con al menos una venta.
25. "**A la fecha**": los periodos y días que ya pasaron, hasta hoy inclusive. Si todo el rango ya pasó, es el rango completo.
26. **Con "Año anterior"** (decisiones 8 y 9):
    - cada tarjeta muestra el valor del año anterior y el % de cambio, o "—" si el valor anterior es 0;
    - el año anterior también cuenta **a la fecha**: hasta hoy − 364 días por día o por semana, o hasta el mismo día del mes del año anterior por mes (el 29 de febrero se toma como 28);
    - en la tarjeta de mejor periodo, el valor del año anterior es el del **mismo periodo un año antes** (el que está 364 días antes, o el mismo mes), con su etiqueta y su % de cambio; por ejemplo, "dic 2025 $12,300 · dic 2024 $11,900 · ↑ 3.4%".
27. **Con "Por sucursal"**, las tarjetas son del consolidado.
28. Un empate en "mejor periodo" se resuelve a favor del más antiguo.

### Ventas sin costo
29. Si se elige la métrica **Utilidad** y en el rango a la fecha hay líneas sin costo (`od.purchase_price = 0`, regla de la spec 03), un aviso dice cuántas son y cuánto suman de venta neta. También dice que su utilidad aparece completa y que se pueden revisar y excluir en Ventas y utilidad. No hay filtro (decisión 2).

### Endpoint
30. `GET /api/reports/trend` recibe:
    - `start_date` y `end_date`, obligatorios, `YYYY-MM-DD`;
    - `granularity`: `day`, `week` o `month`; si no viene, la automática;
    - `compare`: `none`, `previous_year` o `branch`; por defecto `none`;
    - `branch_id`.

    Responde 400 con fechas inválidas, inicio posterior al fin, rango de más de 5 años, granularidad desconocida o fuera de su límite, o comparación desconocida o no permitida.
31. La respuesta trae:
    - la granularidad usada;
    - **los periodos del rango**, en orden. Cada uno lleva su inicio y su fin, si es futuro, si está en curso y si es parcial (con los días que cubre), y sus cuatro métricas. Un periodo futuro va sin valor, y el ticket va sin valor si el periodo no tiene ventas;
    - con "Año anterior", los periodos alineados del año anterior, con sus fechas reales;
    - con "Por sucursal", una serie por sucursal, con su id, su nombre y sus periodos;
    - los KPIs a la fecha y, con "Año anterior", los del año anterior a la fecha;
    - las líneas sin costo del rango a la fecha: cuántas son y su venta neta.

### Dependencia
32. Se agrega **Recharts 3.10.1**, versión exacta, como dependencia del frontend. Es compatible con React 18 y pide Node 18 o superior; las imágenes del frontend usan `node:20-slim`. Después de agregarla hay que reconstruir la imagen del frontend (`docs/tests.md`).

### Documentación
33. `shared-features/feat-tendencia-de-ventas.md` documenta la spec con la estructura de `sf-index.md` y se agrega al índice. Sus notas para portar cubren:
    - el permiso en el catálogo de smallpos-saas;
    - "Por sucursal" con el alcance de varias sucursales por usuario;
    - Recharts.

## Tareas

- [x] **T1. Permiso `reports.trend`** (requisitos 1 y 2).
  — tests: después de migrar, `reports.trend` existe y lo tienen superadmin, admin y supervisor, pero no el cajero, el almacenista ni un rol creado por el usuario.
- [x] **T2. Endpoint `GET /api/reports/trend`** (requisitos 4, 5 y 9–31, parte del backend).
  — tests:
  - **Por periodo:** con ventas conocidas, monto, número de ventas, utilidad y ticket cuadran con el cálculo a mano, incluyendo descuento de orden, devolución parcial con tarifa de restock y una venta cancelada que no cuenta.
  - **Contra otros módulos:** la suma coincide con los KPIs del Dashboard y la utilidad con Ventas y utilidad.
  - **Periodos:** las semanas empiezan en lunes; una venta de las 23:30 hora de México cuenta en ese día.
  - **Vacíos, futuros, en curso y parciales:** los periodos sin ventas valen 0 y su ticket queda sin valor; los futuros no tienen valor; el periodo en curso se marca; las semanas de los extremos de "Últimos 3 meses" se marcan parciales y solo suman los días dentro del rango.
  - **Año anterior:** por día se alinea a 364 días (jueves contra jueves) y por mes al mismo mes. Sus KPIs cuentan a la fecha, incluido el caso del 29 de febrero.
  - **Por sucursal:** una serie por sucursal con ventas; 400 para un usuario de sucursal o con sucursal filtrada.
  - **KPIs:** total, promedio por periodo, mejor periodo (con empate) y ticket del rango. Con "Año anterior", el mejor periodo trae el valor del mismo periodo un año antes.
  - **Límites:** granularidad automática; 400 fuera de límite y con más de 5 años.
  - **Alcance:** un usuario de sucursal no ve otras aunque mande `branch_id`.
  - **Otros:** líneas sin costo; el cajero recibe 403.
- [x] **T3. Recharts, presets de tendencia y paleta compartida** (requisitos 6–8, 23 y 32).
  — tests:
  - cada preset devuelve su rango alineado al calendario, incluidos un cambio de año y un febrero;
  - la granularidad automática y los límites dan lo esperado en los bordes (31/32 días, 183/184, 92/93, 731/732, 1,827/1,828);
  - el Dashboard sigue usando la misma paleta.
- [x] **T4. Pestaña Tendencia de ventas** (requisitos 3, 13–29, parte del frontend).
  — tests, con la respuesta de la API simulada:
  - **Arranque:** la pestaña aparece solo con `reports.trend` y empieza en Últimos 12 meses por mes.
  - **Parámetros:** al cambiar el preset vuelve a la granularidad automática; las opciones fuera de límite están deshabilitadas; manda `granularity` y `compare`.
  - **Datos de la gráfica:** la función que los arma deja sin valor los periodos futuros y el ticket sin ventas, alinea la serie del año anterior y arma una serie por sucursal.
  - **Tooltip:** muestra las marcas "en curso", "parcial" y "sin ventas".
  - **KPIs:** cambian según la métrica (sin promedio con ticket) y muestran el % contra el año anterior, o "—" si el anterior es 0.
  - **Aviso de ventas sin costo:** aparece solo con la métrica Utilidad.
  - **Comparación por sucursal:** la opción solo aparece para el administrador central sin sucursal filtrada.
- [x] **T5. Documentación en `shared-features/`** (requisito 33).
  — tests: no lleva tests de código.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | Un supervisor ve la pestaña Tendencia de ventas; un cajero y un almacenista no. En la base de desarrollo, `reports.trend` lo tienen superadmin, admin y supervisor, y en Configuración → Roles aparece "Tendencia" dentro de Reportes. | 2026-10-22, en la base de desarrollo con la copia de producción (`marksexpressv2`), después de la migración `004`: `reports.trend` lo tienen superadmin, admin y supervisor; Cajero, almacenista, Supervisor_Ventas y Cajero N3 no. `GET /api/permissions`, que alimenta Configuración → Roles, trae `reports.trend`, y `PermissionsModal.jsx` muestra `trend` como "Tendencia". Tests `004-add-reports-trend-permission.test.js` (no lo reciben el cajero, el almacenista ni un rol creado por el usuario), `Reports.test.jsx` (la pestaña aparece solo con `reports.trend`), `App.test.jsx` (Reportes en el menú con solo `reports.trend`) y `trend.test.js` (el cajero recibe 403). No se revisó la pantalla en el navegador. |
| 2 | En la base de desarrollo, para el mismo rango y sucursal, el total de monto vendido, el número de ventas y el ticket de la tendencia coinciden con los KPIs del Dashboard, y la utilidad con Ventas y utilidad. | 2026-10-22, copia de producción (91,174 ventas), en el consolidado y con la sucursal 1, los cuatro valores coinciden:<br>• Este mes: $82,487.50, 2,284 ventas, ticket $36.12, utilidad $37,204.80.<br>• Últimos 12 meses: $1,286,853.18, 37,544 ventas, ticket $34.28, utilidad $393,600.42.<br>• 2025 completo: $1,151,297.50, 37,282 ventas, ticket $30.88, utilidad $309,824.11.<br>La venta neta de Ventas y utilidad difiere un poco ($1,287,219.18 en 12 meses, $1,151,161.50 en 2025) porque suma por línea, y 95 ventas de producción tienen un subtotal que no cuadra con sus líneas (42 no tienen ninguna). En 2025 eso explica exactamente los −$136. Es un tema de los datos, fuera de esta spec. |
| 3 | Una venta de las 23:30 hora de México aparece en ese día, y las semanas van de lunes a domingo. | 2026-10-22, copia de producción: por día, en los 90 días del 24 jul al 21 oct 2026, el número de ventas de cada día coincide con un conteo SQL por fecha de México (0 diferencias). La orden 82444, de las 23:19 del 3 ago 2026 hora de México (01:19 del 4 ago en el servidor), cuenta el 3 ago. Por semana, de agosto a octubre, los 14 periodos van de lunes a domingo. Test `trend.test.js` (venta de las 23:30 y semanas que empiezan en lunes). |
| 4 | Con "Año anterior", por día un jueves se compara con un jueves, por mes cada mes con el mismo mes, y los KPIs comparan a la fecha. | 2026-10-22, copia de producción: por día, cada periodo de octubre de 2026 se compara con el de 364 días antes, el mismo día de la semana (jue 1 oct 2026 → jue 2 oct 2025), y el año anterior cuenta hasta el 23 oct 2025 (hoy − 364). Por mes, en los últimos 12 meses cada mes se compara con el mismo mes un año antes, a la fecha hasta el 22 oct 2025: $1,286,853.18 contra $1,107,236.00. El mejor mes, jun 2026 ($132,002.50), trae jun 2025 ($104,568.00). Test `trend.test.js`, incluido el caso del 29 de febrero. |
| 5 | Los periodos pasados sin ventas salen en 0 (el ticket, sin valor), los futuros no tienen valor, el periodo en curso está marcado y los extremos a medias se marcan "parcial". | 2026-10-22, copia de producción: en Este mes por día, los 9 días después de hoy (23 al 31 oct) van sin valor y el 22 oct está en curso. En Últimos 3 meses por semana, las semanas de los extremos van marcadas como parciales con sus días: la del 27 jul al 2 ago cubre del 1 al 2 ago, y la del 26 oct al 1 nov, del 26 al 31 oct. La sucursal 5 (Sucursal Norte, sin ventas) da 0 en monto, ventas y utilidad en los 9 meses de enero a septiembre de 2026, con el ticket sin valor. Tests `trend.test.js`, `trendData.test.js` y `TrendTab.test.jsx` (tooltip con "en curso", "parcial" y "sin ventas"). |
| 6 | Una granularidad fuera de su límite aparece deshabilitada en la pantalla y el backend la rechaza con 400. | 2026-10-22, copia de producción: el backend responde 400 a 12 meses por día, a 2 años y un día por semana y a 5 años y un día; 5 años por mes responde 200. Test `TrendTab.test.jsx`: con 12 meses, "Día" está deshabilitado con el título "Por día: hasta 92 días". Tests `periods.test.js` y `dateRanges.test.js` en los bordes de cada límite. |
| 7 | Solo el administrador central en el consolidado puede comparar "Por sucursal", y un usuario con sucursal asignada no ve la tendencia de otra sucursal, ni mandando otro `branch_id`. | 2026-10-22, copia de producción:<br>• El administrador central con "Por sucursal" recibe una serie por cada sucursal con ventas; solo sale Sucursal Central, porque Sucursal Norte no tiene ventas.<br>• Con una sucursal filtrada, o si la pide un supervisor de la sucursal 1, la API responde 400.<br>• Ese supervisor recibe $1,286,853.18 en los últimos 12 meses aunque mande `branch_id=5`, lo mismo que la sucursal 1 vista por el central.<br>• El cajero recibe 403.<br>El supervisor y el cajero se probaron con tokens firmados para la prueba, porque la copia no tiene usuarios activos con esos roles. Test `TrendTab.test.jsx`: la opción solo aparece para el administrador central sin sucursal filtrada. |
| 8 | Con la métrica Utilidad y ventas sin costo en el rango, aparece el aviso. | 2026-10-22, copia de producción: en los últimos 12 meses hay 14,564 líneas sin costo, con $321,524.50 de venta neta, y la API las devuelve en `noCost`. Test `TrendTab.test.jsx`: el aviso aparece solo con la métrica Utilidad, con el número de líneas, su venta neta y la referencia a Ventas y utilidad. No se revisó en el navegador. |
| 9 | El Dashboard se ve igual que antes (misma paleta). | 2026-10-22: `utils/chartColors.js` tiene los mismos 8 colores, en el mismo orden, que la constante que salió de `Dashboard.jsx`, y en el Dashboard solo cambia la importación. Test `Dashboard.test.jsx`: la dona de métodos de pago sigue pintándose con la paleta compartida. |
| 10 | La pestaña se ve y se usa bien en móvil. | 2026-10-22: la gráfica usa `ResponsiveContainer` de Recharts con el 100% del ancho del contenedor, y `reports.css` acomoda los controles y las tarjetas según el ancho de pantalla (regla `min-width: 640px`). No se revisó en un navegador ni en un teléfono. |
| 11 | `shared-features/feat-tendencia-de-ventas.md` existe y está en el índice. | 2026-10-22: el archivo existe y está en la tabla del índice (`sf-index.md`). Se commitea junto con el resto de la spec. |
| 12 | Los tests del backend y del frontend pasan. | 2026-10-22: backend 107/107 (19 archivos), frontend 83/83 (14 archivos). |

## Dudas abiertas

- _Ninguna._

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-20 | Antes de redactar se resolvieron 10 dudas:<br>1. Presets propios de tendencia, alineados al calendario, empezando en Últimos 12 meses.<br>2. Sin filtro de ventas sin costo; solo un aviso con la métrica Utilidad.<br>3. "Año anterior" a 364 días por día y por semana, y por mes calendario.<br>4. Periodos pasados sin ventas en 0, futuros sin valor.<br>5. Límites por granularidad: 92 días, 2 años y 5 años.<br>6. Se documenta en `shared-features/`.<br>7. Siempre gráfica de líneas.<br>8. KPIs por métrica, con el cambio contra el año anterior.<br>9. El año anterior se compara a la fecha, y el periodo en curso se marca.<br>10. Las ventas y el ticket se cuentan igual que en el Dashboard. | Usuario |
| 2026-10-20 | Creación de la spec, en **Borrador**, con 3 dudas abiertas que surgieron al redactar. | — |
| 2026-10-21 | Se resuelven las 3 dudas:<br>1. Los periodos de los extremos que quedan a medias se mantienen y se marcan "parcial" en el tooltip, para que los totales cuadren con el Dashboard.<br>2. Con "Año anterior", la tarjeta de mejor periodo muestra el mismo periodo un año antes, con su % de cambio.<br>3. El ticket de un periodo sin ventas queda sin valor; la línea se corta y el tooltip dice "sin ventas". | Usuario |
| 2026-10-21 | Se aprueba la spec: pasa a **Lista**. | Usuario |
| 2026-10-21 | T1 terminada: migración `004-add-reports-trend-permission.sql` y la etiqueta "Tendencia" en Permisos. | Usuario |
| 2026-10-21 | T2 terminada: `GET /api/reports/trend`. La aritmética de periodos vive en `backend/src/utils/periods.js`, y el ingreso neto por orden del Dashboard pasa a `backend/src/helpers/orderNet.js`, que también usa `getKpis` (requisito 12). Los tests encontraron un bug: un alias `branch_id` en `GROUP BY` agrupaba por la columna `o.branch_id`, y con dos sucursales en el mismo periodo una fila sobrescribía a la otra. Se corrigió con alias que no chocan con ninguna columna. | Usuario |
| 2026-10-21 | T3 terminada: Recharts 3.10.1, presets de tendencia y granularidad en `utils/dateRanges.js`, y paleta compartida en `utils/chartColors.js`. | Usuario |
| 2026-10-21 | T4 terminada: `Reports/tabs/TrendTab.jsx` con su tooltip, `Reports/tabs/trendData.js` y la pestaña en `reportTabs.js`. | Usuario |
| 2026-10-21 | T5 terminada: `shared-features/feat-tendencia-de-ventas.md`, agregado al índice. Sus notas para portar se revisaron contra smallpos-saas: depende de portar antes la spec 04, el permiso no les llega solo a los Supervisor de los tenants existentes, y "Por sucursal" se adapta al alcance de varias sucursales. | Usuario |
| 2026-10-22 | Se llena la evidencia de los criterios de aceptación, con una copia de la base de producción cargada en desarrollo. Pasa a **Terminada**. | Usuario |
| 2026-10-26 | La spec 08 (`specs/08-rediseno-ventas-y-tendencia.md`) redefine la presentación de esta pestaña: requisitos 7, 10, 16 y 24 (selectores de granularidad, métrica y comparación, y lugar de los KPIs). Los cálculos y los criterios de aceptación de esta spec siguen vigentes. | Usuario |
