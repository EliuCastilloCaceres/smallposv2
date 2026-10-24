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
| [fix-sesion-al-recargar.md](fix-sesion-al-recargar.md) | fix | Borrador | smallposv2 · `c4c34d5`–`265e89f` | Un solo refresh en curso por pestaña para que recargar no cierre la sesión; la revocación por reutilización conserva `revoked_at`. |
| [fix-costos-e-indices.md](fix-costos-e-indices.md) | fix | Borrador | smallposv2 · `deb907d`–`5e756ea` | El servidor toma el costo de venta del catálogo, los apartados lo congelan al crearse, índices de fecha y runner de migraciones SQL. |
| [feat-reporte-ventas-y-utilidad.md](feat-reporte-ventas-y-utilidad.md) | feat | Borrador | smallposv2 · spec 04 | Pestaña Ventas y utilidad (utilidad bruta y margen por producto, categoría, sucursal y proveedor), permiso por reporte, guard de `/reports` y alcance por sucursal de Sesiones de caja. |
| [feat-tendencia-de-ventas.md](feat-tendencia-de-ventas.md) | feat | Borrador | smallposv2 · spec 05 | Pestaña Tendencia de ventas con Recharts: monto, ventas, utilidad y ticket por día, semana o mes, con comparación contra el año anterior o por sucursal, y permiso `reports.trend`. |
| [feat-costo-en-tabla-productos.md](feat-costo-en-tabla-productos.md) | feat | Borrador | smallposv2 · spec 06 | Columnas Costo y Margen en la tabla de Productos, costo 0 en naranja, filtro "Sin costo" (`no_cost` en `GET /api/products`) y una sola fórmula de margen para la tabla, el detalle y el formulario. |
