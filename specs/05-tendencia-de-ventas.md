# 05 — Tendencia de ventas

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Borrador** | 2026-10-20 | 2026-10-20 |

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
13. **Periodos pasados sin ventas** valen 0 en monto, número de ventas y utilidad, y se dibujan; la línea no los salta (decisión 4). Para el ticket, ver la duda abierta 3.
14. **Periodos futuros** (empiezan después de hoy) aparecen en el eje, pero sin valor: la línea del periodo actual termina hoy. La serie de "Año anterior" sí tiene valores en esos periodos.
15. El **periodo en curso** (el que contiene hoy) se marca "en curso" en el tooltip.

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
    - la marca "en curso" cuando aplica.
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
    - en la tarjeta de mejor periodo, ver la duda abierta 2.
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
    - **los periodos del rango**, en orden. Cada uno lleva su inicio y su fin, si es futuro o está en curso, y sus cuatro métricas (sin valor si es futuro);
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

- [ ] **T1. Permiso `reports.trend`** (requisitos 1 y 2).
  — tests: después de migrar, `reports.trend` existe y lo tienen superadmin, admin y supervisor, pero no el cajero, el almacenista ni un rol creado por el usuario.
- [ ] **T2. Endpoint `GET /api/reports/trend`** (requisitos 4, 5 y 9–31, parte del backend).
  — tests:
  - **Por periodo:** con ventas conocidas, monto, número de ventas, utilidad y ticket cuadran con el cálculo a mano, incluyendo descuento de orden, devolución parcial con tarifa de restock y una venta cancelada que no cuenta.
  - **Contra otros módulos:** la suma coincide con los KPIs del Dashboard y la utilidad con Ventas y utilidad.
  - **Periodos:** las semanas empiezan en lunes; una venta de las 23:30 hora de México cuenta en ese día.
  - **Vacíos, futuros y en curso:** los periodos sin ventas valen 0; los futuros no tienen valor; el periodo en curso se marca.
  - **Año anterior:** por día se alinea a 364 días (jueves contra jueves) y por mes al mismo mes. Sus KPIs cuentan a la fecha, incluido el caso del 29 de febrero.
  - **Por sucursal:** una serie por sucursal con ventas; 400 para un usuario de sucursal o con sucursal filtrada.
  - **KPIs:** total, promedio por periodo, mejor periodo (con empate) y ticket del rango.
  - **Límites:** granularidad automática; 400 fuera de límite y con más de 5 años.
  - **Alcance:** un usuario de sucursal no ve otras aunque mande `branch_id`.
  - **Otros:** líneas sin costo; el cajero recibe 403.
- [ ] **T3. Recharts, presets de tendencia y paleta compartida** (requisitos 6–8, 23 y 32).
  — tests:
  - cada preset devuelve su rango alineado al calendario, incluidos un cambio de año y un febrero;
  - la granularidad automática y los límites dan lo esperado en los bordes (31/32 días, 183/184, 92/93, 731/732, 1,827/1,828);
  - el Dashboard sigue usando la misma paleta.
- [ ] **T4. Pestaña Tendencia de ventas** (requisitos 3, 13–29, parte del frontend).
  — tests, con la respuesta de la API simulada:
  - **Arranque:** la pestaña aparece solo con `reports.trend` y empieza en Últimos 12 meses por mes.
  - **Parámetros:** al cambiar el preset vuelve a la granularidad automática; las opciones fuera de límite están deshabilitadas; manda `granularity` y `compare`.
  - **Datos de la gráfica:** la función que los arma deja sin valor los periodos futuros, alinea la serie del año anterior y arma una serie por sucursal.
  - **KPIs:** cambian según la métrica (sin promedio con ticket) y muestran el % contra el año anterior, o "—" si el anterior es 0.
  - **Aviso de ventas sin costo:** aparece solo con la métrica Utilidad.
  - **Comparación por sucursal:** la opción solo aparece para el administrador central sin sucursal filtrada.
- [ ] **T5. Documentación en `shared-features/`** (requisito 33).
  — tests: no lleva tests de código.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | Un supervisor ve la pestaña Tendencia de ventas; un cajero y un almacenista no. En la base de desarrollo, `reports.trend` lo tienen superadmin, admin y supervisor, y en Configuración → Roles aparece "Tendencia" dentro de Reportes. | _(se llena al cerrar)_ |
| 2 | En la base de desarrollo, para el mismo rango y sucursal, el total de monto vendido, el número de ventas y el ticket de la tendencia coinciden con los KPIs del Dashboard, y la utilidad con Ventas y utilidad. | _(se llena al cerrar)_ |
| 3 | Una venta de las 23:30 hora de México aparece en ese día, y las semanas van de lunes a domingo. | _(se llena al cerrar)_ |
| 4 | Con "Año anterior", por día un jueves se compara con un jueves, por mes cada mes con el mismo mes, y los KPIs comparan a la fecha. | _(se llena al cerrar)_ |
| 5 | Los periodos pasados sin ventas salen en 0, los futuros no tienen valor y el periodo en curso está marcado. | _(se llena al cerrar)_ |
| 6 | Una granularidad fuera de su límite aparece deshabilitada en la pantalla y el backend la rechaza con 400. | _(se llena al cerrar)_ |
| 7 | Solo el administrador central en el consolidado puede comparar "Por sucursal", y un usuario con sucursal asignada no ve la tendencia de otra sucursal, ni mandando otro `branch_id`. | _(se llena al cerrar)_ |
| 8 | Con la métrica Utilidad y ventas sin costo en el rango, aparece el aviso. | _(se llena al cerrar)_ |
| 9 | El Dashboard se ve igual que antes (misma paleta). | _(se llena al cerrar)_ |
| 10 | La pestaña se ve y se usa bien en móvil. | _(se llena al cerrar)_ |
| 11 | `shared-features/feat-tendencia-de-ventas.md` existe y está en el índice. | _(se llena al cerrar)_ |
| 12 | Los tests del backend y del frontend pasan. | _(se llena al cerrar)_ |

## Dudas abiertas

Surgieron al redactar. La spec sigue en **Borrador** hasta resolverlas.

1. **Periodos parciales en los extremos del rango.** Los presets van por meses calendario, pero "Últimos 3 meses" se agrupa por semana, y una semana de lunes a domingo casi nunca empieza el día 1. Lo mismo pasa con "Personalizado" a mitad de semana o de mes. El primer y el último periodo quedan con menos días y parecen caídos.
   - **(a)** Se mantienen los periodos del calendario: los de los extremos solo suman los días dentro del rango y se marcan "parcial" en el tooltip. Los totales cuadran exactamente con el Dashboard para el rango elegido. *(Recomendada.)*
   - **(b)** El rango se extiende a periodos completos: por ejemplo, del lunes de la primera semana al domingo de la última. No hay periodos parciales, pero los totales cubren días fuera del rango elegido y ya no cuadran con el Dashboard para ese rango.
2. **"Año anterior" en la tarjeta de mejor periodo.** Hay dos opciones:
   - **(a)** El valor del periodo alineado del año anterior. Por ejemplo, si el mejor mes es diciembre 2025, se muestra diciembre 2024. *(Recomendada.)*
   - **(b)** El mejor periodo del año anterior, con su etiqueta.
3. **Ticket promedio en periodos sin ventas.** Sin ventas no hay ticket.
   - **(a)** El periodo queda sin valor y la línea del ticket se corta ahí. Las demás métricas siguen en 0. *(Recomendada.)*
   - **(b)** Vale 0, como las demás métricas, aunque un ticket de $0 no existe y la línea se desploma.

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-20 | Antes de redactar se resolvieron 10 dudas:<br>1. Presets propios de tendencia, alineados al calendario, empezando en Últimos 12 meses.<br>2. Sin filtro de ventas sin costo; solo un aviso con la métrica Utilidad.<br>3. "Año anterior" a 364 días por día y por semana, y por mes calendario.<br>4. Periodos pasados sin ventas en 0, futuros sin valor.<br>5. Límites por granularidad: 92 días, 2 años y 5 años.<br>6. Se documenta en `shared-features/`.<br>7. Siempre gráfica de líneas.<br>8. KPIs por métrica, con el cambio contra el año anterior.<br>9. El año anterior se compara a la fecha, y el periodo en curso se marca.<br>10. Las ventas y el ticket se cuentan igual que en el Dashboard. | Usuario |
| 2026-10-20 | Creación de la spec, en **Borrador**, con 3 dudas abiertas que surgieron al redactar. | — |
