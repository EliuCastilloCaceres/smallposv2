# 11 — Fix: costo estimado para los productos y las ventas sin costo

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Terminada** | 2026-10-27 | 2026-10-27 |

## Objetivo

Más de mil productos del catálogo no tienen costo capturado (`purchase_price = 0`). Hoy su utilidad cuenta completa en Ventas y utilidad, Tendencia, Valuación y Rotación, y los reportes solo pueden avisarlo o excluirlos. Esta spec les asigna un **costo estimado con un margen pesimista de 15%**, en el catálogo y en las ventas ya hechas, para que la utilidad deje de estar inflada. Es para supervisores y administradores.

Es una corrección de datos, así que va en una migración (`docs/migraciones.md`) y llega a **producción** en el siguiente despliegue. Por decisión del usuario, el costo estimado **no queda marcado**: después no se puede distinguir de un costo capturado.

**Datos de la copia de producción** (2026-10-27):
- **Productos sin costo:** 1,133 (844 activos y 289 inactivos). 1,125 tienen precio de venta y 8 no tienen, así que a esos 8 no se les puede estimar un costo.
- **Margen real** de los 1,546 productos activos con costo y precio mayor al costo: promedio 27.5%, mediana 23.9%. Uno de cada cuatro gana menos de 19.9%, y uno de cada diez, menos de 15.2%. Por eso 15% es pesimista: solo 1 de cada 10 productos con costo real gana menos.
- **Líneas de venta con costo 0** en órdenes no canceladas: 34,987.
  - 29,678 son de 889 productos que siguen sin costo y tienen precio;
  - 4,789 son de 38 productos que hoy ya tienen costo, capturado después de venderse;
  - 520 son de 5 productos sin costo ni precio, pero casi todas tienen precio en la línea;
  - 4 tienen precio unitario 0.
  - Además hay 164 líneas con costo 0 en órdenes canceladas.
- Si las ventas pasadas tomaran el 85% del precio de **hoy**, 3,234 líneas quedarían con pérdida, porque el precio subió después de venderse. Por eso se usa el precio de cada línea.
- **Efecto:** el costo de las ventas pasadas sube $638,703.89 ($152,005.97 con el costo real de los 38 productos y $486,697.92 estimado), y la utilidad histórica baja lo mismo. El stock de los 819 productos sin costo que tienen existencias pasa a valer unos $221,205 al costo.
- **Apartados con costo 0:** ninguno.

## Historias de usuario

- Como **supervisor**, quiero que la utilidad de las ventas y del inventario no cuente completa la de los productos sin costo, para no tomar decisiones con una cifra inflada.
- Como **administrador**, quiero que el costo estimado sea pesimista, para que la utilidad real sea, en general, mayor y no menor a la que veo.

## Alcance

**Incluye**
- Una migración de datos que estima el costo de los productos sin costo y de las líneas de venta y de apartado con costo 0.
- El test de la migración.
- Revisar con la copia de producción cómo quedan los reportes.
- **Documentación en `shared-features/`:** no. Es una corrección de los datos de esta base, y los tenants de smallpos-saas tienen sus propios datos (decisión del usuario, 2026-10-27).

**No incluye**
- Marcar los costos estimados ni guardar un registro de cuáles se estimaron (decisión 3).
- Margen por categoría (decisión 2).
- Pedir el costo al crear un producto: un producto nuevo sin costo vuelve a quedar "sin costo", y los filtros y avisos de las specs 04, 06, 07, 09 y 10 lo siguen señalando.
- Corregir los productos con el costo mayor al precio (spec 09): es una tarea de datos aparte.
- Costo propio por variante: las variantes siguen usando el costo del producto.
- Cambios de código en los reportes: ya leen `products.purchase_price` y `order_details.purchase_price`.

## Requisitos

### Regla
1. **Costo estimado** = precio × 0.85, redondeado al centavo (`ROUND(…, 2)`), es decir, un margen de 15% (decisión 2). Por ejemplo, precio $12.35 → costo $10.50.
2. Lo que tenga precio 0 no se toca y sigue "sin costo".

### Productos
3. Todo producto con `purchase_price = 0` y `sale_price > 0`, activo o inactivo, toma el costo estimado de su precio de venta (decisión 5).

### Ventas y apartados
4. Toda línea de `order_details` con `purchase_price = 0` y `unit_price > 0` toma un costo, sin importar el estado de la orden:
   - si su producto **ya tenía costo** antes de esta migración, toma ese costo (decisión 4);
   - si no, toma el costo estimado del **precio unitario de la línea**, no el precio de hoy (decisión 3).
5. El 15% es sobre el precio unitario de la línea. Si la venta tuvo descuento, su utilidad real fue menor: el estimado es pesimista en el precio, pero no en el descuento.
6. Las líneas de `layaway_details` con `purchase_price = 0` siguen la misma regla. Hoy no hay ninguna, pero así un apartado activo no se liquida con costo 0.
7. **Orden:** primero se corrigen las líneas de venta y de apartado, y al final los productos. Si fuera al revés, las ventas de un producto recién estimado tomarían su costo como si fuera real (requisito 4).

### Migración
8. La migración `007-estimate-missing-costs.sql` hace todo en una transacción, como las migraciones de permisos: o se aplica completa o no se aplica.
9. No se puede revertir: el costo estimado no queda marcado (decisión 3). Antes de desplegarla en producción, hay que respaldar la base.

### Efecto en los reportes
10. No cambia código. Después de la migración:
    - **Ventas y utilidad y Tendencia:** el costo y la utilidad de las ventas pasadas reflejan el estimado. "Excluir ventas sin costo" ya casi no excluye nada: solo las líneas con precio 0.
    - **Valuación y Rotación:** el valor al costo sube, y "sin costo" solo cuenta los productos sin precio. Rotación sugiere rebajas para los productos que antes pedían capturar el costo.
    - **Productos:** el filtro "Sin costo" solo encuentra los productos sin precio.

## Tareas

- [x] **T1. Migración `007-estimate-missing-costs.sql`** (requisitos 1–9).
  — tests, con una base sin migrar a la que se le cargan los datos y después se migra:
  - un producto activo y uno inactivo sin costo toman el 85% de su precio, con el redondeo al centavo ($12.35 → $10.50);
  - un producto sin costo ni precio sigue en 0, y uno con costo no cambia;
  - una línea de venta de un producto sin costo toma el 85% del precio de la línea aunque el precio de hoy sea otro;
  - una línea de venta de un producto que ya tenía costo toma ese costo, no el estimado;
  - una línea con precio 0 sigue en 0; una línea de una orden cancelada también se corrige;
  - una línea de apartado sigue la misma regla;
  - una línea de venta con costo no cambia.
- [x] **T2. Revisar el efecto con la copia de producción** (requisito 10).
  — tests: no lleva tests de código; la evidencia va en los criterios de aceptación.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | En la copia de producción, después de la migración, los únicos productos sin costo son los que no tienen precio, y el costo de cada producto estimado es el 85% de su precio. | 2026-10-27, copia de producción (`marksexpressv2`), migración `007` aplicada a las 13:34:10 (hora del servidor): la migración cambió 1,125 productos (841 activos y 284 inactivos), identificados por su `updated_at`. Todos tienen precio y su costo es `ROUND(precio × 0.85, 2)`, sin ninguna diferencia. Los únicos 8 productos con costo 0 son los 8 sin precio. Test `007-estimate-missing-costs.test.js`. |
| 2 | No queda ninguna línea de venta ni de apartado con costo 0 y precio mayor a 0. Las líneas de los 38 productos que ya tenían costo tomaron ese costo; las demás, el 85% del precio de la línea. | 2026-10-27: comparado contra el dump del 21 de octubre (`backend/dumps/marksexpressv2.sql`), que tiene las mismas 35,151 líneas con costo 0 (34,987 en órdenes no canceladas y 164 en canceladas). Las 35,151 tienen hoy el costo que pide la regla, sin ninguna diferencia: 4,815 tomaron el costo real de los 38 productos que ya lo tenían, 4 siguen en 0 porque se vendieron a precio 0, y las demás tomaron el 85% del precio de su línea. Quedan 4 líneas con costo 0, todas con precio 0, y ninguna línea de apartado (no había). Test `007-estimate-missing-costs.test.js`. |
| 3 | La utilidad de Ventas y utilidad, Valuación y Rotación cambia según lo calculado en los datos de esta spec, y sus avisos de "sin costo" solo cuentan lo que no tiene precio. | 2026-10-27, API sobre la copia de producción después de la migración:<br>- **Ventas y utilidad:** el costo de las ventas no canceladas subió $638,703.89, lo mismo que se calculó antes de aplicarla. De abril de 2024 a hoy quedan $2,909,183.68 de venta neta, $2,699,017.17 de costo y $210,166.51 de utilidad (7.22%); en 2026, $103,931.42 (9.47%). "Sin costo" solo cuenta 4 líneas, que valen $0.<br>- **Valuación:** el disponible vale $554,426.66 al costo, antes $338,040.27, con margen de 12.52%. La alerta "Sin costo" bajó a 2 artículos, ambos sin precio.<br>- **Rotación, 30 días:** $366,220.69 detenidos (66.05% del inventario), antes $194,162.26 (57.44%); sin Recargas, $259,858.69 (71.19%), antes $87,800.26. Solo 1 producto sin costo, sin precio. |
| 4 | Los tests del backend y del frontend pasan. | 2026-10-27: backend 208/208 (26 archivos), frontend 188/188 (22 archivos). |

## Dudas abiertas

- _Ninguna._

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-27 | Antes de redactar se resolvieron 6 dudas:<br>1. Va en una spec nueva, después de cerrar la spec 10.<br>2. Margen pesimista fijo de 15%: costo = precio × 0.85.<br>3. El costo estimado no se marca. Las ventas pasadas con costo 0 también lo toman, calculado sobre el precio de cada línea.<br>4. Las ventas con costo 0 de productos que hoy ya tienen costo toman ese costo.<br>5. Se corrigen también los productos inactivos.<br>6. No se documenta en `shared-features/`. | Usuario |
| 2026-10-27 | Creación de la spec, en **Borrador**. | — |
| 2026-10-27 | Se aprueba la spec: pasa a **Lista**. | Usuario |
| 2026-10-27 | T1 terminada: migración `007-estimate-missing-costs.sql` y su test. El test carga los datos sobre la base ya migrada y vuelve a aplicar la `007`; si los productos se corrigieran antes que las ventas, el caso de Tenis fallaría. | Usuario |
| 2026-10-27 | T2 terminada. La migración se aplicó sola en la copia de producción al crear el archivo del test: nodemon reinicia el backend con cualquier `.js` nuevo de `backend/`, y al arrancar el backend aplica las migraciones pendientes. Por eso no hubo una foto exacta de antes, y la verificación se hizo con el `updated_at` de los productos y con el dump del 21 de octubre, que tiene las mismas líneas con costo 0. | Usuario |
| 2026-10-27 | Se llena la evidencia de los 4 criterios de aceptación. Queda en **Lista** hasta que el usuario apruebe pasarla a Terminada. | — |
| 2026-10-27 | Se aprueba el cierre: pasa a **Terminada**. | Usuario |
