# Shared Features — índice

Esta carpeta documenta las **features** y **fixes** que se hacen en **smallposv2** y que se deben implementar, o por lo menos considerar, en el proyecto derivado **smallpos-saas**.

Los dos proyectos comparten la misma base de código. La diferencia es que smallpos-saas está pensado para **multitenant**: hay una base de datos por tenant, un `platform_db` y RBAC con `createSecureRouter`. Por eso cada mejora se documenta aquí, para decidir con calma si se lleva al otro proyecto y cómo.

## Convenciones

- **Un archivo por feature o fix**, con prefijo y nombre en kebab-case:
  - `feat-<tema>.md` → funcionalidad nueva. Ej. `feat-totales-credito.md`
  - `fix-<tema>.md` → corrección de un error. Ej. `fix-redondeo-corte-caja.md`
- **Idioma:** español.
- Cada archivo nuevo se agrega a la tabla de [Índice](#índice).

## Estados

El estado indica en qué punto está la mejora **respecto al proyecto destino** (smallpos-saas). En el proyecto origen ya está hecha.

| Estado | Significado |
|---|---|
| **Borrador** | Documentada, todavía sin revisar ni decidir si se implementa. |
| **Revisada** | Ya se revisó y se decidió implementarla, con los ajustes anotados. |
| **En progreso** | Se está implementando en el proyecto destino. |
| **Implementada** | Ya está en el proyecto destino y cumple los criterios de aceptación. |

Si se decide **no** implementarla, se anota en el resumen del archivo y se deja en *Revisada* con esa nota.

## Estructura de cada archivo

1. **Cabecera:** estado, tipo, proyecto origen, proyecto destino, commit de origen y fecha.
2. **Resumen:** qué se hizo.
3. **Motivo:** por qué se hizo.
4. **Historias de usuario:** formato *"Como [rol], quiero [acción] para [beneficio]"*.
5. **Archivos modificados**
6. **Archivos agregados**
7. **Tareas realizadas:** checklist.
8. **Criterios de aceptación:** se llenan **después de implementar**.
9. **Notas para portar:** diferencias conocidas con el proyecto destino. Es opcional, pero recomendada.

## Índice

| Archivo | Tipo | Estado | Origen | Resumen |
|---|---|---|---|---|
| [feat-filtro-metodo-pago-ventas.md](feat-filtro-metodo-pago-ventas.md) | feat | Borrador | smallposv2 · `60aa180` | Filtro por método de pago en Ventas; el pie suma solo el método filtrado. |
| [feat-totales-credito.md](feat-totales-credito.md) | feat | Borrador | smallposv2 · `60aa180` | Pie de totales (Total, Pagado, Saldo pendiente) en Créditos. |
| [feat-filtro-cliente-credito.md](feat-filtro-cliente-credito.md) | feat | Borrador | smallposv2 · `60aa180` | Dropdown de clientes con crédito para filtrar el listado de Créditos. |
| [fix-sesion-al-recargar.md](fix-sesion-al-recargar.md) | fix | Implementada | smallposv2 · `c4c34d5`–`265e89f` | Un solo refresh en curso por pestaña para que recargar no cierre la sesión; la revocación por reutilización conserva `revoked_at`. |
| [fix-costos-e-indices.md](fix-costos-e-indices.md) | fix | Implementada | smallposv2 · `deb907d`–`5e756ea` | El servidor toma el costo de venta del catálogo, los apartados lo congelan al crearse, índices de fecha y runner de migraciones SQL. |
| [feat-reporte-ventas-y-utilidad.md](feat-reporte-ventas-y-utilidad.md) | feat | Borrador | smallposv2 · spec 04 | Pestaña Ventas y utilidad (utilidad bruta y margen por producto, categoría, sucursal y proveedor), permiso por reporte, guard de `/reports` y alcance por sucursal de Sesiones de caja. |
| [feat-tendencia-de-ventas.md](feat-tendencia-de-ventas.md) | feat | Borrador | smallposv2 · spec 05 | Pestaña Tendencia de ventas con Recharts: monto, ventas, utilidad y ticket por día, semana o mes, con comparación contra el año anterior o por sucursal, y permiso `reports.trend`. |
| [feat-costo-en-tabla-productos.md](feat-costo-en-tabla-productos.md) | feat | Borrador | smallposv2 · spec 06 | Columnas Costo y Margen en la tabla de Productos, costo 0 en naranja, filtro "Sin costo" (`no_cost` en `GET /api/products`) y una sola fórmula de margen para la tabla, el detalle y el formulario. |
| [feat-valuacion-de-inventario.md](feat-valuacion-de-inventario.md) | feat | Borrador | smallposv2 · spec 07 | Pestaña Valuación de inventario: artículos, unidades y valor al costo y a venta del stock, con apartado y total en tienda, tabla agrupable, exclusión de categorías, filtro de sin costo, alertas y permiso `reports.inventory`. |
| [feat-rediseno-ventas-y-tendencia.md](feat-rediseno-ventas-y-tendencia.md) | feat | Borrador | smallposv2 · spec 08 | Ventas y utilidad y Tendencia de ventas con el orden de Valuación: filtros arriba con las fechas del periodo, resumen como cuenta (ventas − costo = utilidad), desglose ordenable desde los encabezados y controles de la gráfica como botones. Piezas compartidas en `Reports/components/`. |
| [feat-filtro-de-costo-en-productos.md](feat-filtro-de-costo-en-productos.md) | feat | Borrador | smallposv2 · spec 09 | Selector de costo en Productos con sin costo, costo mayor al precio y los dos juntos (`cost_issue` en `GET /api/products`), costo mayor al precio en rojo y el mismo nombre en la alerta de Valuación. |
| [feat-rotacion-de-inventario.md](feat-rotacion-de-inventario.md) | feat | Borrador | smallposv2 · spec 10 | Pestaña Rotación de inventario: productos sin venta en 30, 60, 90 o 180 días por sucursal, valor detenido al costo, sugerencias de traspaso, rebaja (nunca debajo del costo) y promoción, edición de productos desde la lista y permiso `reports.rotation`. |
| [feat-modulo-de-gastos.md](feat-modulo-de-gastos.md) | feat | Borrador | smallposv2 · spec 12 | Módulo Gastos: categorías de gasto con la marca "cuenta en la utilidad neta", gastos con comprobante privado, pagado desde caja con su salida ligada, cancelación con reingreso, gasto desde el POS, retiros con tipo propio, salidas históricas fuera de los gastos, tipos de caja en un solo helper y permisos `expenses.*`. |
| [feat-reporte-de-gastos-y-utilidad-neta.md](feat-reporte-de-gastos-y-utilidad-neta.md) | feat | Borrador | smallposv2 · spec 13 | Pestaña Gastos en Reportes (total, promedio, lo que cuenta en la utilidad neta y desglose por categoría, sucursal, proveedor o método de pago) y utilidad neta en Ventas y utilidad (resumen y por sucursal), con permiso `reports.expenses` y aviso del primer gasto registrado. |
| [feat-modulo-de-compras.md](feat-modulo-de-compras.md) | feat | Borrador | smallposv2 · spec 14 | Módulo Compras: compras con sus líneas y comprobante privado, entrada al inventario, costo promedio ponderado global, pagado desde caja con reingreso al cancelar, cancelación todo o nada, compra desde el POS con lector de códigos de barras, fin del motivo "Compra a proveedor", categoría de mercancía inactiva y permisos `purchases.*`. |
| [feat-comprobante-despues-de-guardar.md](feat-comprobante-despues-de-guardar.md) | feat | Borrador | smallposv2 · spec 15 | Agregar o reemplazar el comprobante de un gasto o de una compra desde su detalle (`PUT /:id/receipt` con `read` y `create`, solo activos, el archivo anterior se borra) y quién lo subió y cuándo (`receipt_uploaded_by` y `receipt_uploaded_at`). |
