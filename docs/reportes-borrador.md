# Borrador: nuevos reportes en el módulo de Reportes

> **Documento de orientación, no es una spec.** Sirve para aterrizar la idea y encontrar las ambigüedades.
> Con las [dudas abiertas](#8-dudas-abiertas) resueltas se redactan las specs en `specs/`, una a la vez, como pide `docs/constitution.md`.
> Mientras tanto no se escribe código.
>
> **Estado: dudas resueltas** (2026-10-17). Las 39 dudas y sus derivadas (6b, 8b, 10b…) tienen respuesta en [§8](#8-dudas-abiertas). Las secciones 2 a 6 ya reflejan esas decisiones.

## 1. Contexto

### Lo que se necesita (petición original)

1. Saber **en qué gasto**.
2. Saber **cuánto gasto**.
3. Saber **a quién le compro más**, o con quién gasto más.
4. Conocer la **utilidad de las ventas**.
5. Conocer los **totales del inventario**: cuántos productos tengo, cuánto representan en dinero y cuál es su utilidad estimada.
6. Una **gráfica de tendencia de ventas** basada en el historial, con filtro por fecha.
7. **Sugerencias de rotación** para productos que no se han movido: cambiar de ubicación, dar en promoción con otros productos, rebajar el precio, etc.

Todo esto iría en el módulo de **Reportes**, que ya existe.

### Estado actual del módulo de Reportes

- **Una sola pestaña**, *Sesiones de caja*:
  - `frontend/src/components/Reports/Reports.jsx` define el arreglo `TABS`.
  - El contenido vive en `tabs/CashSessionsTab.jsx` y el detalle en `modals/CashSessionDetailModal.jsx`.
  - `Reports.jsx` ya trae el comentario: *"Próximas tabs del módulo: ventas, inventario, crédito/apartados, devoluciones"*.
- **Backend:** `backend/src/routes/report_routes.js` → `reportController` → `reportService`. Hay dos endpoints:
  - `GET /reports/cash-sessions`
  - `GET /reports/cash-sessions/:id`

  Los dos piden `reports.basic`.
- **Permisos:** el seed ya define `reports.advanced` (*"Reportes avanzados de ventas y margen"*), pero **ninguna ruta ni pantalla lo usa**. Hoy lo tienen supervisor, admin y superadmin; el cajero tiene solo `reports.basic`.
- **Patrones a reutilizar:**
  - CSS con prefijo `rpt-`: KPIs, filtros, tabla, tarjetas en móvil y paginación.
  - Filtros de fecha y sucursal; el selector de sucursal solo lo ve el admin central.
  - Manejo de zona horaria con `backend/src/utils/timezone.js`.
- **Gráficas:** no hay librería. El Dashboard (`components/Dashboard/Dashboard.jsx`) tiene gráficas hechas a mano en SVG, pero **no están exportadas** para reutilizarse:
  - `SalesByHourChart`: barras con hover, apiladas por sucursal.
  - `PaymentDonut`: dona de pagos.
  - Paleta `CHART_COLORS`.

## 2. Resumen: ¿qué se puede hacer con los datos actuales?

| # | Necesidad | ¿Hay datos hoy? | Qué falta | Decisión |
|---|---|---|---|---|
| 1–2 | En qué y cuánto gasto | **Parcial** | Un registro de gastos con categoría. Hoy solo hay salidas de efectivo de caja, sin categoría y mezcladas con retiros. | **Módulo nuevo de gastos** con categorías editables; los retiros se separan (#1–#4). |
| 3 | A quién le compro más | **No** | Un registro de compras (entradas con costo y proveedor). | **Módulo nuevo de compras** con costo promedio ponderado (#5–#8). |
| 4 | Utilidad de las ventas | **Sí** | Nada para empezar. Hay riesgos de calidad del costo (ver §3.3 y §4). | Utilidad bruta y neta; antes va un `fix-` de costos (#9–#13). |
| 5 | Totales del inventario | **Sí** | Nada para empezar. Todo se calcula a precios actuales. | Valuación a costo del producto, con lo apartado aparte (#14–#18). |
| 6 | Tendencia de ventas | **Sí** | La gráfica (no hay librería) y un índice por fecha en `orders`. | Recharts, 4 métricas y comparación (#19–#22). |
| 7 | Rotación de inventario | **Parcial** | Ubicación física dentro de la sucursal y promociones/combos. Ninguno de los dos existe. | Solo sugerencias, sin módulos nuevos (#23–#28). |

## 3. Detalle por necesidad

### 3.1 En qué gasto y cuánto gasto (1–2)

**Qué existe hoy**
- **No hay módulo de gastos ni categorías de gasto.** `categories` es solo para productos.
- **La única salida de dinero registrada** es `cash_movements` con `movement_type = 'expense'`:
  - Columnas: `amount`, `description` (texto libre, 100 caracteres), `user_id`, `created_at` y `session_id`. La sucursal y la caja se obtienen a través de la sesión.
  - Solo cubre **efectivo dentro de una sesión de caja**.
  - Lo crea `cashRegisterService.createMovement`. En la UI aparece como "Retiro manual" (`CashMovementsModal.jsx`).
- **Retiros mezclados con gastos:** `CloseRegisterModal.jsx` también graba como `'expense'` el retiro de efectivo del corte (descripción `'Retiro en corte de caja'`). Hoy la única forma de separar un gasto real de un retiro es el texto de la descripción.

**Propuesta de reporte**
- KPIs:
  - Total gastado en el rango.
  - Número de gastos.
  - Gasto promedio.
- Gasto **por categoría**, que responde "en qué gasto", y gasto por sucursal.
- Tendencia del gasto en el tiempo (con la misma gráfica de §3.5).
- Detalle: lista de gastos con fecha, categoría, descripción, monto, método de pago y usuario.

**Qué falta y riesgos**
- Para responder "en qué gasto" hacen falta **categorías**. Con los datos actuales solo se puede responder "cuánto saqué de caja", agrupado por descripción libre.
- Los retiros de caja tienen que dejar de contarse como gasto.

**Decisiones** (ver #1–#4, #8, #8b y #33–#38)
- **Qué se registra:** todo gasto del negocio, dentro o fuera de caja.
- **Módulo nuevo de gastos,** con menú propio y permisos `expenses.read/create/cancel`. Cada gasto lleva:
  - fecha, **categoría** (editable), monto y descripción;
  - sucursal y método de pago (los activos, sin "Crédito");
  - proveedor opcional;
  - folio y comprobante adjunto.
- **Pagado desde caja:** si el gasto se paga con efectivo de la caja abierta, se genera solo la salida de caja ligada al gasto.
- **Retiros:** pasan a un tipo propio y no cuentan como gasto.
- **Histórico:** las salidas viejas se migran con regla; los retiros del corte se separan y el resto queda "Sin categoría".
- **Cancelación:** un gasto no se edita; se cancela con motivo.

### 3.2 A quién le compro más / con quién gasto más (3)

**Qué existe hoy**
- `providers` tiene los datos de contacto. La **única liga** con productos es `products.provider_id`, que guarda el proveedor *actual* del producto.
- **Las entradas de inventario no guardan costo ni proveedor:**
  - `inventory_movements` no tiene columnas `unit_cost` ni `provider_id`.
  - "Compra a proveedor" es solo un motivo de texto en el ajuste individual (`stockService.manualAdjustment` → `operation_type = 'purchase'`).
  - El ajuste masivo (`inventoryService.bulkAdjustment`) siempre graba `'entry'` o `'exit'`.
- **Se pierde la atribución:** al desactivar un proveedor, `providerService` pasa todos sus productos al proveedor genérico (id 1).
- **No hay** compras, órdenes de compra ni cuentas por pagar.

**Lo que sí se puede calcular hoy (aproximaciones)**
- **Ventas por proveedor actual:** `orderService.getSoldProducts` ya filtra por proveedor.
- **Valor del inventario por proveedor:** stock × costo actual.
- **Ninguna de las dos responde "a quién le compro más".**

**Propuesta de reporte**
- Ranking de proveedores por **monto comprado** en el rango, con número de compras y última compra.
- Participación de cada proveedor en el total comprado.
- "Con quién gasto más": compras más los gastos que tengan proveedor.

**Decisiones** (ver #5–#8b y #33–#38)
- **Módulo nuevo de compras,** con menú propio y permisos `purchases.read/create/cancel`. Cada compra tiene:
  - **encabezado:** proveedor, fecha, sucursal, método de pago, folio, comprobante y notas;
  - **líneas:** producto, variante, cantidad y costo unitario.
- **Inventario:** la compra genera la entrada de inventario, ligada a `inventory_movements` con `reference_type = 'purchase'`.
- **Costo del producto:** se actualiza con **costo promedio ponderado global**, usando el stock de todas las sucursales.
- **Pago:** toda compra se considera pagada; no hay cuentas por pagar por ahora. También puede pagarse desde caja.
- **Separación de gastos:** las compras no son gastos.
- **Cancelación:** solo se cancela, con motivo. Cancelar revierte la entrada si hay stock suficiente.
- **Inventario:** se quita el motivo "Compra a proveedor".

### 3.3 Utilidad de las ventas (4)

**Qué existe hoy**
- **El costo se congela al vender:** `order_details.purchase_price` guarda el costo del producto en ese momento, así que la utilidad histórica no cambia si después cambia el costo.
- **Ya hay una fórmula de ingreso neto** (prorratea el descuento de la orden y resta devoluciones) en `orderService.getSoldProducts` y `dashboardService.getTopProducts`:
  `(od.subtotal - od.discount) * (o.total / o.subtotal) - devuelto`
- **Utilidad posible hoy:**
  - Fórmula: ingreso neto − Σ (unidades vendidas − unidades devueltas) × `od.purchase_price`.
  - Ventas consideradas: status `completed`, `partial_refund` y `refunded`.
- **Reconocimiento de la venta:**
  - **Crédito:** cuenta el día de la venta.
  - **Apartado:** cuenta el día en que se liquida y se convierte en orden.

**Propuesta de reporte**
- KPIs:
  - Ventas netas.
  - Costo de lo vendido.
  - **Utilidad bruta**.
  - **Margen %**.
  - **Utilidad neta** (bruta − gastos), cuando exista el módulo de gastos.
- Tabla por producto, ordenable por utilidad o margen, con estas columnas: unidades, venta neta, costo, utilidad y margen.
- Agrupaciones: **producto, categoría, sucursal y proveedor** (#12).
- Filtros: fechas, sucursal y categoría, más un filtro para excluir las ventas marcadas "sin costo" (#10).

**Qué falta y riesgos**
- **El costo viene del cliente y no se valida.** `orderService.createOrder` guarda `item.purchase_price` tal como lo manda el POS; el frontend lo toma del catálogo con un respaldo `?? 0`. Puede haber ventas con costo 0, lo que infla la utilidad. *Posible fix previo:* que el servidor lea el costo de `products` al vender.
- **Apartados:** `layaway_details` no guarda costo. `layawayService.convertLayawayToOrder` usa el costo del día en que se liquida, no el del día en que se apartó.
- **Precio sobrescrito sin rastro:** el POS permite cambiar el precio de una línea y no se guarda el precio de lista original. La utilidad sale bien, pero no se puede saber cuánto se "regaló".
- **Fecha de las devoluciones:** se restan en la fecha de la venta, no en la de la devolución. Es el mismo criterio que usan Ventas y el Dashboard.
- **Variantes:** no tienen costo propio; el costo siempre es el del producto base.

**Decisiones** (ver #9–#13)
- **Primero va un `fix-` de costos:**
  - El servidor toma el costo de `products` al vender.
  - Los apartados congelan el costo al crearse.
  - Las ventas históricas con costo 0 se marcan como "sin costo".
- **Utilidad bruta y neta.**
- **Fechas:** las devoluciones se restan en la fecha de la venta, y las ventas a crédito cuentan el día de la venta.

### 3.4 Totales del inventario (5)

**Qué existe hoy**
- El stock vive en `inventory_stock`, por sucursal, producto y variante (`quantity`).
- **Catálogo global:** `products` no tiene sucursal.
- **Precios:** `products.purchase_price` (costo) y `products.sale_price` (precio de venta), sin historial.
- **Lógica de activos:** `getStockByBranch` ya filtra producto activo y, si el producto es variable, variante activa.

**Propuesta de reporte**
- KPIs:
  - **Productos distintos** con stock.
  - **Unidades totales.**
  - **Valor al costo**: Σ stock × `purchase_price`.
  - **Valor a precio de venta**: Σ stock × `sale_price`.
  - **Utilidad estimada**: valor de venta − valor al costo, y su margen %.
- Desglose por categoría, por proveedor y por sucursal (más consolidado).
- Alertas:
  - Productos con stock y costo 0.
  - Productos con precio menor al costo.

**Qué falta y riesgos**
- **Precios actuales:** todo se calcula a precios de hoy. No hay costo histórico ni promedio ponderado; eso requeriría el módulo de compras de §3.2.
- **Apartados:** las unidades apartadas ya están restadas de `inventory_stock`, aunque físicamente sigan en la tienda.
- **Mayoreo:** no hay precio de mayoreo ni listas de precios.
- **Stock bajo:** el umbral está fijo en el código (`< 5` / `<= 5`) y no hay stock mínimo por producto.

**Decisiones** (ver #14–#18)
- **Valuación:** al costo del producto. Será el promedio ponderado cuando exista Compras.
- **Qué entra:** productos y variantes activos con stock > 0.
  - Los inactivos con stock salen como alerta aparte.
  - Lo apartado se muestra en un renglón aparte.
- **KPIs de conteo:**
  - productos distintos, donde cada variante cuenta como uno;
  - unidades **desglosadas por unidad de medida**.
- **Vista:** consolidada y por sucursal. Un usuario con sucursal ve solo la suya.

### 3.5 Gráfica de tendencia de ventas (6)

**Qué existe hoy**
- **Fuente:** `orders.created_at`, con el total neto de devoluciones calculado igual que en `dashboardService.getKpis`.
- **Zona horaria:** `utils/timezone.js` ya resuelve la conversión:
  - `toServerRange` para el filtro.
  - `createdAtMx` para agrupar por día de México.
- **El Dashboard solo agrupa por hora del día** (`getSalesByHour`). **No hay tendencia por día, semana o mes en ningún lado.**

**Propuesta de reporte**
- Gráfica de línea o barras con filtro de fechas (incluye presets como Hoy, Semana y Mes, igual que el Dashboard).
- **Granularidad** según el rango: día, semana o mes.
- KPIs del periodo: total, promedio por periodo, mejor periodo.
- Comparación por sucursal o contra el mismo periodo del año anterior (ver decisiones).

**Qué falta y riesgos**
- **No hay librería de gráficas.**
- **`orders` no tiene índice en `created_at`** ni índice compuesto `(branch_id, created_at)`. Con rangos largos la consulta puede volverse lenta.

**Decisiones** (ver #19–#22b)
- **Librería:** se agrega **Recharts**.
- **Granularidad:** automática según el rango (día, semana o mes) y el usuario la puede cambiar.
- **Métricas,** con selector: monto vendido, número de ventas, utilidad bruta y ticket promedio. Unidades no.
- **Comparación,** una a la vez: "Ninguna", "Por sucursal" (admin central) o "Año anterior".

### 3.6 Sugerencias de rotación de inventario (7)

**Qué existe hoy**
- **Última venta por producto y sucursal:**
  - `MAX(orders.created_at)` desde `order_details`.
  - O `inventory_movements` con `operation_type = 'sale'`. Ojo: en apartados el movimiento es `'layaway_reserve'`.
- **Velocidad de venta:** unidades vendidas en N días, por sucursal.
- **Traspasos entre sucursales:** ya existen (`inventory_transfers`, con flujo pendiente → completado en `inventoryService`).
- **Rebajas:** `order_details.unit_price` está congelado por venta, así que se puede comparar el antes y después de una rebaja.

**Propuesta de reporte**
- **Lista de productos "sin movimiento":** con stock, pero sin ventas en X días. Columnas:
  - días desde la última venta;
  - stock;
  - valor inmovilizado al costo;
  - sucursal.
- **Sugerencia por producto, con reglas simples:**
  - **Traspasar a otra sucursal:** el producto se vende en otra sucursal y aquí no. Ese flujo de traspaso ya existe.
  - **Rebajar precio:** mucho tiempo sin venta y margen suficiente para bajar sin perder.
  - **Promoción con otros productos:** combinarlo con productos de alta rotación de la misma categoría.
  - **Cambiar de ubicación en tienda:** solo como aviso de texto (ver decisiones).

**Qué falta y riesgos**
- **No existe ubicación física** (anaquel, pasillo o almacén) dentro de la sucursal; la única ubicación es la sucursal.
- **No existen promociones, combos ni listas de precios.** Solo el descuento libre por orden en el POS.
- **No hay historial de precios** (`products.sale_price` se sobrescribe).
- **`inventory_movements` no tiene índice por fecha** (`branch_id, product_id, created_at`).

**Decisiones** (ver #23–#28)
- **"Sin movimiento":** filtro de 30 / 60 / 90 / 180 días, con 30 por defecto. En productos que nunca se vendieron, los días se cuentan desde la primera entrada de stock en la sucursal.
- **Sugerencias,** con reglas fijas documentadas en la spec:
  - **Traspaso a otra sucursal** donde el producto sí se vende.
  - **Aviso de texto** para moverlo a un lugar más visible o promocionarlo. No hay módulo de ubicaciones.
  - **Promoción con productos concretos,** por ejemplo los más vendidos de la categoría. Se aplica a mano en el POS.
  - **Rebaja de precio sugerida,** que nunca baja del costo: 30–60 días 10%, 60–90 días 20%, más de 90 días 30%.
- **El reporte es solo informativo:** las acciones se hacen en Inventario y en Productos, como hoy.

## 4. Hallazgos transversales

1. **El costo de venta no se valida en el servidor** (`orderService.createOrder`). Afecta la confiabilidad de cualquier reporte de utilidad. → **Se corrige en el `fix-` previo** (#10).
2. **Apartados sin costo propio:** el costo se toma al liquidar (`layawayService.convertLayawayToOrder`). → **Se congela al apartar, en el mismo `fix-`** (#10b).
3. **Faltan índices de fecha** en `orders`, `inventory_movements`, `cash_movements` y `returns`. Todos los reportes nuevos filtran por fecha. → **Se agregan en el `fix-` previo** (§6).
4. **No hay librería de gráficas.** → **Se agrega Recharts** (#22b).
5. **Permisos y acceso:**
   - La ruta `/reports` del frontend no tiene guard; solo se oculta en el menú. → **Se agrega en la primera spec de reportes** (#32).
   - `reports.advanced` existe y nadie lo usa. → **Se elimina, y se crea un permiso por reporte** (#29–#29c).
6. **No hay exportación** (CSV o impresión) en Reportes. → **Por ahora no se agrega** (#30).

## 5. Propuesta de organización del módulo

Pestañas del módulo de Reportes, cada una con su propio permiso (#29). Los nombres finales de los permisos se fijan en cada spec.

| Pestaña | Contenido | Permiso | Roles por defecto (#29b) | ¿Requiere módulo nuevo? |
|---|---|---|---|---|
| Sesiones de caja | Ya existe | `reports.basic` | Igual que hoy | — |
| Ventas y utilidad | §3.3 | `reports.profit` | Supervisor | No |
| Tendencia de ventas | §3.5 | `reports.trend` | Supervisor | No |
| Inventario | §3.4 | `reports.inventory` | Supervisor, almacenista | No |
| Rotación | §3.6 | `reports.rotation` | Supervisor, almacenista | No |
| Gastos | §3.1 | `reports.expenses` | Supervisor | Sí: gastos |
| Compras por proveedor | §3.2 | `reports.purchases` | Supervisor | Sí: compras |

Reglas para todas las pestañas:
- **Superadmin y admin** tienen todos los permisos.
- **Alcance por sucursal:** igual que en el Dashboard (#31).
- **Exportación:** no hay (#30).

Además de las pestañas, hay dos **menús nuevos** de captura (#33):
- **Gastos:** `expenses.read/create/cancel`.
- **Compras:** `purchases.read/create/cancel`.

## 6. Orden de las specs

Confirmado en la #39: primero lo que ya tiene datos y después los módulos nuevos. Siempre se trabaja **una spec a la vez**.

0. **`fix-` de costos e índices:**
   - El servidor toma el costo de `products` al vender (#10).
   - Los apartados congelan el costo al crearse (#10b).
   - Las ventas históricas con costo 0 se marcan "sin costo".
   - Se agregan índices de fecha.
1. **Ventas y utilidad** (utilidad bruta, más los cambios base del módulo):
   - guard de `/reports` (#32);
   - permisos por reporte;
   - eliminación de `reports.advanced` (#29–#29c).
2. **Tendencia de ventas,** con Recharts.
3. **Valuación del inventario.**
4. **Rotación de inventario,** con sugerencias.
5. **Módulo de gastos:**
   - categorías;
   - separación de retiros y migración del histórico;
   - opción "pagado desde caja";
   - reporte de gastos;
   - **utilidad neta** en el reporte de la spec 1.
6. **Módulo de compras:**
   - costo promedio ponderado;
   - se quita el motivo "Compra a proveedor" de Inventario;
   - reporte de compras por proveedor y de "con quién gasto más".

**Fuera por ahora, como posibles specs futuras:** cuentas por pagar (#7), exportación (#30), módulo de promociones (#25) y ubicaciones físicas (#24).

## 7. Lo que queda fuera de este borrador

- Implementación, diseño de pantallas y modelo de datos definitivo: van en cada spec.
- Facturación: ver `comming-soon/Facturacion.md`.

## 8. Dudas abiertas

### Gastos
1. ~~¿Qué cuenta como gasto?~~ → **Respondida: todo gasto del negocio.** Incluye el efectivo que sale de caja y los gastos pagados fuera de caja (renta, luz, nómina por transferencia o tarjeta). Un gasto debe poder registrarse sin sesión de caja.
2. ~~¿Se crea un módulo de gastos con categorías?~~ → **Respondida: sí, con categorías editables.** El admin puede crear, editar y desactivar categorías. Se siembran unas iniciales: Renta, Servicios, Nómina, Insumos, Mantenimiento y Otros.
3. ~~¿Se separan los retiros de caja de los gastos?~~ → **Respondida: sí.** Los retiros, tanto del corte de caja como los manuales, pasan a un tipo propio y no cuentan como gasto. El cuadre de caja no cambia: los dos siguen restando del efectivo esperado.
4. ~~¿Qué pasa con los gastos ya registrados?~~ → **Respondida: migrar con regla.**
   - Las salidas con descripción `'Retiro en corte de caja'` se convierten en retiros.
   - El resto pasa al módulo de gastos como **"Sin categoría"**, para recategorizarlas a mano si se quiere.

### Compras y proveedores
5. ~~¿Se crea un módulo de compras?~~ → **Respondida: sí.**
   - Cada compra registra proveedor, fecha, sucursal y líneas (producto, cantidad y costo unitario).
   - La compra genera la entrada de inventario.
6. ~~¿Las compras actualizan el costo del producto?~~ → **Respondida: sí, con costo promedio ponderado global.**
   - Fórmula: `(stock total × costo actual + cantidad comprada × costo de compra) / (stock total + cantidad comprada)`.
   - El stock total es la suma de todas las sucursales.
   - Se mantiene un solo `purchase_price` por producto, así que no cambia el modelo.
7. ~~¿Se registran cuentas por pagar?~~ → **Respondida: no por ahora.** Toda compra se considera pagada al registrarla. Las cuentas por pagar pueden ser una spec posterior.
8. ~~¿Cómo se relacionan compras y gastos?~~ → **Respondida: van separados.**
   - Las compras de mercancía **no** son gastos: son inventario, y su costo entra a la utilidad cuando se vende.
   - "A quién le compro más" se calcula con compras.
   - "Con quién gasto más" suma compras y los gastos que tengan proveedor, así que los gastos llevan **proveedor opcional**.
8b. ~~¿Cómo afecta al corte de caja un gasto o compra pagado con efectivo de caja?~~ → **Respondida: opción "pagado desde caja".**
   - Al registrar un gasto o una compra se elige el método de pago.
   - Si se paga con efectivo de la caja abierta, se genera automáticamente la salida de caja ligada a ese gasto o compra. Así el corte cuadra sin capturar dos veces.

### Utilidad de las ventas
9. ~~¿Utilidad bruta o neta?~~ → **Respondida: las dos.**
   - **Bruta** = ventas netas − costo de lo vendido.
   - **Neta** = bruta − gastos del periodo. Aparece cuando exista el módulo de gastos.
10. ~~¿Se valida el costo en el servidor? ¿Qué pasa con el histórico en 0?~~ → **Respondida: fix + marcar histórico.**
    - Primero va un `fix-`: el servidor toma el costo de `products` al vender y deja de confiar en el que manda el POS.
    - Las ventas históricas con costo 0 se muestran marcadas como "sin costo", y un filtro permite excluirlas del cálculo.
10b. ~~¿Se cambia cómo se toma el costo en apartados?~~ → **Respondida: sí, se guarda al apartar.**
    - El costo se congela en el detalle del apartado al crearlo y se usa al convertirlo en venta.
    - Entra en el mismo `fix-` de costos que la #10.
11. ~~¿En qué fecha se restan las devoluciones?~~ → **Respondida: en la fecha de la venta.**
    - Es el criterio actual de Ventas y del Dashboard, así que los módulos cuadran entre sí.
    - Un periodo pasado puede cambiar si después hay una devolución.
12. ~~¿Qué desgloses se necesitan?~~ → **Respondida:** por **producto**, **categoría**, **sucursal** (y consolidado para el admin central) y **proveedor** (el actual del producto). Por cajero y por método de pago no se necesitan.
13. ~~¿Cuándo cuentan las ventas a crédito?~~ → **Respondida: el día de la venta.**
    - Es el criterio actual del sistema.
    - Los abonos son cobranza y se consultan en Créditos.

### Inventario
14. ~~¿A qué costo se valoriza el inventario?~~ → **Respondida: al costo del producto,** es decir, stock × `purchase_price`.
    - Cuando exista el módulo de compras, ese costo será el promedio ponderado (#6), así que la valuación mejora sin cambiar el reporte.
    - No se usan lotes ni FIFO.
15. ~~¿Las unidades apartadas se cuentan como inventario?~~ → **Respondida: aparte, como "apartado".**
    - El inventario disponible no las incluye, igual que hoy.
    - El reporte muestra un renglón aparte con las unidades y el valor apartados, para saber cuánto hay físicamente.
16. ~~¿Qué productos entran en los totales?~~ → **Respondida: los activos con stock.**
    - Solo productos y variantes activos con stock > 0.
    - Los inactivos que todavía tengan stock se muestran como **alerta aparte**.
17. ~~¿Productos distintos, unidades o ambos?~~ → **Respondida: ambos.** El reporte lleva dos KPIs:
    - **productos distintos**, donde cada variante (por ejemplo, una talla) cuenta como uno;
    - **unidades totales** en stock.
17b. ~~¿Cómo se suman unidades con distinta unidad de medida?~~ → **Respondida: desglosadas por unidad,** por ejemplo "1,240 pza · 85.5 kg · 30 lt".
18. ~~¿Por sucursal o consolidado?~~ → **Respondida: ambos.**
    - El admin central ve el consolidado, con desglose por sucursal, y puede filtrar por una sucursal.
    - Un usuario con sucursal asignada ve solo la suya.

### Tendencia de ventas
19. ~~¿Cómo se elige la granularidad?~~ → **Respondida: automática y elegible.**
    - Se elige sola según el rango: hasta ~31 días → día; hasta ~6 meses → semana; más → mes.
    - El usuario la puede cambiar.
20. ~~¿Qué métrica muestra la gráfica?~~ → **Respondida: cuatro, con un selector:**
    - **monto vendido** (neto de devoluciones);
    - **número de ventas**;
    - **utilidad** bruta;
    - **ticket promedio**.

    **No** se incluyen unidades vendidas, porque mezclan unidades de medida (ver #17b).
21. ~~¿Contra qué se compara la gráfica?~~ → **Respondida:** contra **el mismo periodo del año anterior** y con **series por sucursal**. No se compara contra el periodo inmediato anterior.
21b. ~~¿Cómo se combinan las comparaciones?~~ → **Respondida: una a la vez.**
    - Hay un selector de comparación con las opciones "Ninguna", "Por sucursal" y "Año anterior".
    - Con "Año anterior" se compara el total o, si se filtró, la sucursal elegida.
    - "Por sucursal" aplica para el admin central en la vista consolidada.
22. ~~¿Librería o SVG propio?~~ → **Respondida: se agrega una librería,** que facilita las comparaciones y las gráficas futuras (gastos, utilidad).
22b. ~~¿Qué librería?~~ → **Respondida: Recharts.**
    - Son componentes React declarativos sobre SVG.
    - Se estiliza con las variables CSS del proyecto.

### Rotación de inventario
23. ~~¿Cuántos días sin venta cuentan como "sin movimiento"?~~ → **Respondida: configurable, 30 por defecto.**
    - Es un filtro del reporte con opciones 30 / 60 / 90 / 180 días.
    - No se guarda configuración.
23b. ~~¿Qué pasa con productos que nunca se vendieron o que son nuevos?~~ → **Respondida: los días se cuentan desde que hay stock.**
    - Si un producto nunca se vendió, se cuenta desde su primera entrada de stock en esa sucursal.
    - Así, un producto que llegó hace poco no aparece antes de tiempo.
24. ~~¿Qué significa "cambiar de ubicación"?~~ → **Respondida: las dos opciones.**
    - **Traspasar a otra sucursal:** se sugiere mover el producto a una sucursal donde sí se vende. Usa el flujo de traspasos que ya existe.
    - **Mover dentro de la sucursal:** es **solo un aviso de texto**, sin módulo de ubicaciones. Por ejemplo: *"Este producto lleva mucho tiempo sin venderse: ubícalo en un lugar más visible o realiza alguna promoción."*
25. ~~¿Promoción como sugerencia o como módulo?~~ → **Respondida: sugerencia con productos concretos.**
    - El reporte sugiere con qué productos combinarlo, por ejemplo los más vendidos de la misma categoría.
    - La promoción se aplica a mano en el POS con el descuento que ya existe.
    - No se crea un módulo de promociones.
26. ~~¿Qué hace la sugerencia de rebaja?~~ → **Respondida: sugiere un precio rebajado que nunca baja del costo.**
    - Es solo una sugerencia: el precio se sigue cambiando en Productos, como hoy.
    - El porcentaje depende de los días sin venta (ver #27).
27. ~~¿Reglas fijas o configurables?~~ → **Respondida: fijas y documentadas en la spec.** No hay pantalla de configuración.
    - **Rebaja según días sin venta,** siempre sin bajar del costo:
      - 30–60 días: 10%;
      - 60–90 días: 20%;
      - más de 90 días: 30%.
    - Las reglas exactas de cuándo sugerir traspaso, aviso o promoción se escriben en la spec, que el usuario aprueba.
    - Si hace falta ajustarlas después, se hace con una nueva spec.
28. ~~¿Se puede iniciar la acción desde el reporte?~~ → **Respondida: no, es solo informativo.** El traspaso se crea en Inventario y el precio se cambia en Productos, como hoy.

### Generales
29. ~~¿Quién ve cada reporte?~~ → **Respondida: hay un permiso de lectura por reporte,** asignable por rol: `reports.profit`, `reports.inventory`, `reports.trend`, `reports.rotation`, `reports.expenses` y `reports.purchases`. Los nombres finales se fijan en cada spec. Sesiones de caja sigue con `reports.basic`.
29b. ~~¿A qué roles se asignan por defecto?~~ → **Respondida: según el acceso actual:**
    - **Superadmin y admin:** todo.
    - **Supervisor:** todos los reportes nuevos.
    - **Cajero:** ninguno de los nuevos.
    - **Almacenista:** Inventario y Rotación.

    Después se ajustan por rol desde la UI.
29c. ~~¿Qué pasa con `reports.advanced`?~~ → **Respondida: se elimina** de los seeds y de `role_permissions` con una migración.
30. ~~¿Se necesita exportar?~~ → **Respondida: no por ahora.** La primera versión no lleva exportación; se puede agregar después con su propia spec.
31. ~~¿Alcance por sucursal?~~ → **Respondida: como en el Dashboard.**
    - Un usuario con sucursal asignada ve solo la suya; esto lo fuerza el backend.
    - El admin central ve el consolidado y puede filtrar por sucursal.
32. ~~¿Se agrega el guard a `/reports`?~~ → **Respondida: sí, en la primera spec de reportes.**
    - Reports valida los permisos al entrar, igual que el Dashboard.
    - Cada pestaña solo aparece si el usuario tiene su permiso.

### Módulos nuevos: gastos y compras
Estas dudas surgieron al decidir crear los dos módulos (#2 y #5).

33. ~~¿Dónde viven los módulos y con qué permisos?~~ → **Respondida: cada uno tiene menú propio y permisos CRUD.**
    - Hay dos entradas nuevas en el menú: **Gastos** y **Compras**.
    - Permisos: `expenses.read/create/cancel` y `purchases.read/create/cancel`.
    - Asignación por defecto:
      - **Supervisor:** todo.
      - **Cajero:** puede registrar gastos pagados desde su caja.
      - **Almacenista:** puede registrar compras.
34. ~~¿Se pueden editar o cancelar?~~ → **Respondida: solo cancelar, con motivo.**
    - No se editan: se cancelan y se vuelven a capturar.
    - Cancelar una compra revierte la entrada de inventario, si hay stock suficiente.
    - Si el dinero salió de caja, se registra el reingreso.
    - El costo promedio no se recalcula hacia atrás.
35. ~~¿Qué pasa con la entrada "Compra a proveedor" de Inventario?~~ → **Respondida: se quita ese motivo.**
    - Las compras solo se registran en Compras.
    - Inventario conserva sus entradas y salidas para ajustes, mermas y conteos.
36. ~~¿Qué datos lleva un gasto?~~ → **Respondida:**
    - fecha, categoría, monto y descripción;
    - sucursal y método de pago;
    - proveedor opcional;
    - **folio de factura o ticket** (texto);
    - **comprobante** (foto o PDF adjunto).
37. ~~¿Qué datos lleva una compra?~~ → **Respondida: los mismos que un gasto.**
    - **Encabezado:** proveedor, fecha, sucursal, método de pago, folio de factura o ticket, comprobante (foto o PDF) y notas.
    - **Líneas:** producto, variante, cantidad y costo unitario.
38. ~~¿Qué métodos de pago se usan en gastos y compras?~~ → **Respondida: los métodos activos, excepto "Crédito".** "Crédito" es el que se da a clientes, y no hay cuentas por pagar (#7). Con "Efectivo" se puede marcar "pagado desde caja" (#8b).

### Orden de trabajo
39. ~~¿En qué orden se hacen las specs?~~ → **Respondida: primero los reportes que ya tienen datos.** El orden queda en [§6](#6-orden-de-las-specs).
