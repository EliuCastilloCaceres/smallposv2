# 12 — Módulo de gastos

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Terminada** | 2026-10-27 | 2026-10-27 |

## Objetivo

Es la primera parte del **paso 5** del orden de [`docs/reportes-borrador.md`](../docs/reportes-borrador.md) (§6), con las decisiones #1–#4, #8, #8b y #33–#38 de §3.1. El paso 5 se divide en dos specs (decisión 3 de esta spec):
- **esta spec (12):** el módulo para registrar gastos, separar los retiros de caja de los gastos y dejar el histórico fuera de los gastos;
- **la spec 13:** la pestaña de reporte de gastos y la utilidad neta en Ventas y utilidad.

Hoy no hay forma de saber en qué ni cuánto gasta el negocio. La única salida de dinero que se registra es la de caja (`cash_movements` con `movement_type = 'expense'`): no tiene categoría, mezcla retiros con gastos y no cubre lo que se paga fuera de caja (renta, nómina por transferencia). Es para supervisores, administradores y cajeros.

**Datos de la copia de producción** (2026-10-27, desde el arranque del sistema el 2026-08-25):
- **Salidas de caja como `expense`:** 343, por $243,285.68.
  - 1 es "Retiro en corte de caja" ($9,123.00).
  - Unas 271 (~$202,866) son **pagos a proveedores de mercancía** hechos con el "Retiro manual" del POS: "PAGO DE PEPSI", "PAGO DE COCA-COLA", "PAGO DE BIMBO", "COMPRA DE VOLT Y ELECTROLIT"…
  - Unas 64 (~$21,320) son gastos de operación: luz ("PAGO DE CORRIENTE"), comida, caridad.
  - El resto son retiros y ajustes.
  - Hay 126 descripciones distintas, escritas a mano.
- **Utilidad bruta del mismo periodo:** $31,419.21. Si todas esas salidas contaran como gasto, la utilidad neta daría unos −$202,000. Las compras de mercancía ya cuentan como costo cuando se venden (decisión #8), así que contarlas como gasto las cuenta dos veces.
- **Entradas manuales (`income`):** 58, por $5,310.50, casi todas "SOBRANTE". No cambian.
- **Métodos de pago activos:** Efectivo (`cash`), Tarjeta (`card`), Transferencia Bancaria (`transfer`) y Crédito (`credit`).

**Base que ya existe:**
- **Caja:** `cashRegisterService.createMovement` (`POST /api/cash-registers/:registerId/movements`, con `pos.use`) registra el "Ingreso manual" y el "Retiro manual" del POS (`Pos/modals/CashMovementsModal.jsx`). `CloseRegisterModal.jsx` registra el retiro del corte como `expense` con la descripción "Retiro en corte de caja".
- **Cuadre de caja:** el efectivo esperado suma `sale`, `income`, `credit_payment` y `layaway_payment`, y resta `expense` y `return`. Esas listas están escritas a mano en cinco lugares: `closeRegister` y `getSessionStatus` de `cashRegisterService`, las dos consultas de Sesiones de caja de `reportService` y `dashboardService.getOpenCashRegisters`.
- **Etiquetas de los movimientos:** `CashMovementsModal.jsx`, `Pos/printCorteReport.js` y `Reports/modals/CashSessionDetailModal.jsx`.
- **Archivos:** `middlewares/uploadImage.js` (multer) solo acepta imágenes y las sirve públicas desde `public/images/`. `docker-compose.prod.yml` monta como volumen `public/images/products` y `public/images/receipts`.
- **Categorías de productos:** se administran en Configuración → Categorías.
- **Proveedores:** `GET /api/providers` pide `providers.read`, que el cajero no tiene.

## Historias de usuario

- Como **supervisor**, quiero registrar cada gasto con su categoría, monto, método de pago y comprobante, para saber en qué y cuánto gasta el negocio.
- Como **cajero**, quiero registrar desde el POS un gasto que pago con el efectivo de mi caja, para que el corte cuadre sin capturarlo dos veces.
- Como **cajero**, quiero registrar el pago a un proveedor de mercancía desde mi caja con su proveedor, para que quede a quién se le pagó sin contarlo como gasto.
- Como **supervisor**, quiero que los retiros de efectivo no cuenten como gasto, para que el gasto refleje lo que de verdad se gastó.
- Como **administrador**, quiero crear, editar y desactivar las categorías de gasto, para ordenarlas como las usa el negocio.
- Como **supervisor**, quiero cancelar un gasto mal capturado con su motivo, para corregirlo sin borrar el registro.

## Alcance

**Incluye**
- Categorías de gasto: tabla, categorías iniciales, una marca "cuenta en la utilidad neta" y su pantalla en Configuración.
- Gastos: tabla, API, módulo **Gastos** en el menú (lista, filtros, registro, detalle y cancelación) y comprobante adjunto.
- **Pagado desde caja:** el gasto genera su salida de caja, desde el módulo o desde el POS.
- **Retiros:** tipo de movimiento propio para el retiro manual y el del corte; ya no son gastos.
- **Histórico:** el retiro del corte pasa a retiro y las demás salidas quedan como "salida de caja histórica", fuera de los gastos.
- Permisos `expenses.read`, `expenses.create`, `expenses.cancel` y `expenses.categories`.
- Tests de todo lo anterior.
- **Documentación en `shared-features/`:** sí, como `feat-modulo-de-gastos.md` (decisión del usuario, 2026-10-27).

**No incluye**
- La pestaña de reporte de gastos, el permiso `reports.expenses` y la utilidad neta en Ventas y utilidad: van en la spec 13. Ahí se usa la marca "cuenta en la utilidad neta".
- El módulo de Compras y las cuentas por pagar (decisiones #5–#7): un pago a proveedor de mercancía se registra mientras tanto con su categoría (requisito 4).
- Editar un gasto: se cancela y se vuelve a capturar (decisión #34). Tampoco se agrega el comprobante después.
- Recategorizar o convertir en gastos las salidas de caja históricas (decisión 1).
- Validar que la caja tenga efectivo suficiente: hoy el retiro manual tampoco lo valida.
- Gastos recurrentes, presupuestos y exportación (decisión #30).
- Portar el módulo a smallpos-saas: aquí solo se documenta.

## Requisitos

### Categorías de gasto
1. Una tabla de **categorías de gasto**, separada de las de productos (decisión #2), con:
   - nombre único;
   - la marca **"Cuenta en la utilidad neta"**, encendida por defecto;
   - estado activa o inactiva.
2. Una migración crea las categorías iniciales:
   - Renta, Servicios, Nómina, Insumos, Mantenimiento y Otros (decisión #2), que cuentan en la utilidad neta;
   - **"Pago a proveedor (mercancía)"**, que **no** cuenta (decisión 2 de esta spec).
3. Se administran en **Configuración → Categorías de gasto** (decisión 6):
   - la pestaña la ve quien tiene `expenses.categories`;
   - se puede crear, editar (nombre y marca) y activar o desactivar una categoría, pero no borrarla;
   - una categoría inactiva no se puede usar en un gasto nuevo, y los gastos que ya la tienen la conservan.
4. **Pagos a proveedores de mercancía** (decisión 2): mientras no exista el módulo de Compras, se registran como gasto con la categoría "Pago a proveedor (mercancía)" y su proveedor. Descuentan de la caja como cualquier gasto, pero la spec 13 no los cuenta en la utilidad neta, porque su costo ya cuenta al vender.

### Gastos
5. Cada gasto guarda:
   - **fecha** del gasto, **categoría**, **monto** (mayor a 0) y **descripción** (obligatoria, hasta 255 caracteres);
   - **sucursal** y **método de pago**;
   - **proveedor**, opcional;
   - **folio** de factura o ticket, opcional, hasta 50 caracteres;
   - **comprobante**, opcional (requisito 10);
   - quién lo registró y cuándo (decisión #36).
6. **Método de pago:** los métodos activos, excepto Crédito (decisión #38).
7. **Fecha** (decisión 8): por defecto hoy, en hora de México. Puede ser una fecha pasada, pero nunca futura. Un gasto pagado desde caja siempre es de hoy.
8. **Sucursal:** un usuario con sucursal asignada registra y ve solo los de la suya; el backend la fuerza. El administrador central elige la sucursal al registrar y ve todas.
9. **Validaciones:** la categoría, el método de pago y el proveedor, si viene, deben estar activos. Un dato inválido responde 400 con un mensaje en español.

### Comprobante
10. El comprobante es una foto o un PDF (decisión #36):
    - formatos jpg, png, webp o pdf, de hasta 5 MB;
    - se guarda fuera de la carpeta pública, con un nombre generado, y se descarga con `GET /api/expenses/:id/receipt`, que pide `expenses.read` y respeta el alcance por sucursal;
    - en producción, la carpeta de comprobantes es un volumen de `docker-compose.prod.yml`, como las imágenes de productos, para que no se pierda al reconstruir el contenedor.

### Pagado desde caja
11. Un gasto con método **Efectivo** se puede marcar como **"Pagado desde caja"** (decisión #8b):
    - se elige una caja con sesión abierta de la sucursal del gasto (desde el POS, es la caja del POS);
    - al registrarlo, en la misma transacción se crea su salida en `cash_movements`, de tipo `expense`, ligada al gasto. La descripción es "Gasto #id: categoría – descripción", recortada a 100 caracteres;
    - la salida resta del efectivo esperado, como hoy el retiro manual.
12. Un gasto que no se paga desde caja no crea ningún movimiento de caja.

### Cancelación
13. Un gasto **no se edita**: se cancela con motivo y se vuelve a capturar (decisión #34).
    - Cancelar pide `expenses.cancel` y un **motivo** obligatorio, de hasta 255 caracteres.
    - Se guarda quién lo canceló, cuándo y el motivo; el gasto queda en la lista como cancelado.
    - Un gasto cancelado no se puede volver a cancelar.
14. **Reingreso** de un gasto pagado desde caja (decisión 5):
    - si su sesión de caja **sigue abierta**, la cancelación crea en esa sesión un movimiento `expense_refund` ("Reingreso del gasto #id"), que suma al efectivo esperado;
    - si la sesión **ya se cerró**, el gasto se cancela sin reingreso. La pantalla avisa: *"La sesión de caja ya se cerró, así que no se registró el reingreso. Si el dinero regresó, regístralo como Ingreso manual en la caja abierta."*

### Retiros y salidas de caja
15. **Tipos de movimiento** en `cash_movements`:

    | Tipo | Qué es | Etiqueta | Efectivo esperado |
    |---|---|---|---|
    | `withdrawal` | **Retiro**, manual o del corte (decisión #3) | Retiro | Resta |
    | `expense` | Gasto pagado desde caja, ligado a su gasto | Gasto | Resta |
    | `expense_refund` | Reingreso de un gasto cancelado | Reingreso de gasto | Suma |
    | `legacy_expense` | Salida de caja anterior a esta spec | Salida de caja (histórico) | Resta |

    Los demás tipos (`sale`, `income`, `credit_payment`, `layaway_payment` y `return`) no cambian. El cuadre de caja tampoco: retiros y gastos siguen restando (decisión #3).
16. Las listas de tipos que suman y que restan pasan a un solo lugar del backend, que usan los cinco cálculos del efectivo esperado. Así un tipo nuevo no se olvida en ninguno.
17. **POS:**
    - "Retiro manual" pasa a llamarse **"Retiro"** y se registra como `withdrawal`;
    - el retiro del corte (`CloseRegisterModal.jsx`) se registra como `withdrawal`;
    - `POST /api/cash-registers/:registerId/movements` acepta `income` y `withdrawal`. Responde 400 con `expense`: los gastos se registran como gastos.
18. **Etiquetas:** el POS, el reporte impreso del corte y el detalle de Sesiones de caja muestran las etiquetas del requisito 15.
19. **Histórico** (decisión 1). Una migración de datos:
    - convierte en `withdrawal` las salidas `expense` con descripción "Retiro en corte de caja";
    - convierte las demás salidas `expense` en `legacy_expense`.

    Ninguna se convierte en gasto, así que la utilidad neta de la spec 13 solo cuenta lo que se registre en Gastos desde ahora.

### Gasto desde el POS
20. En **Movimientos de caja** del POS hay tres opciones: **Ingreso**, **Retiro** y **Gasto**. "Gasto" solo la ve quien tiene `expenses.create`. Es un gasto pagado en efectivo desde la caja del POS, de hoy, con:
    - categoría, monto y descripción;
    - proveedor y folio opcionales;
    - comprobante opcional, que en un teléfono se puede tomar con la cámara.

    Al guardarlo aparece en la lista de movimientos de la sesión como "Gasto".
21. **Cajero** (decisión 7): tiene `expenses.create`, pero no `expenses.read`, así que no ve el menú Gastos. El backend acepta un gasto de un usuario sin `expenses.read` solo si es pagado desde caja, en efectivo y de una caja con sesión abierta de su sucursal.

### Módulo Gastos
22. Entrada **Gastos** en el menú, con `expenses.read` (decisión #33).
23. **Filtros**, arriba, que se combinan entre sí:
    - periodo con los presets de Ventas y las fechas que cubre;
    - sucursal, solo para el administrador central;
    - categoría, método de pago y proveedor;
    - estado: **Activos** (por defecto), Cancelados o Todos;
    - búsqueda por descripción o folio.
24. **Lista**, paginada de 20 en 20 y ordenada por fecha del gasto (la más reciente primero, y luego por hora de registro). Columnas:
    - fecha, categoría, descripción (con el folio debajo), proveedor y método de pago (con la marca "Desde caja");
    - monto;
    - sucursal, solo para el administrador central en el consolidado;
    - un ícono si tiene comprobante.

    Un gasto cancelado se ve tachado, con la etiqueta "Cancelado". En móvil, la lista se ve como tarjetas.
25. Arriba de la lista, el **total** y el número de gastos **activos** del filtro. El desglose por categoría y la tendencia van en el reporte de la spec 13.
26. **Registrar:** el botón "Nuevo gasto", con `expenses.create`, abre el formulario de los requisitos 5–11. "Pagado desde caja" solo aparece con Efectivo, y entonces pide la caja abierta.
27. **Detalle:** al tocar un gasto se abre con todos sus datos:
    - quién lo registró y cuándo;
    - el comprobante, para verlo o descargarlo;
    - su salida de caja, si se pagó desde caja;
    - si está cancelado, quién lo canceló, cuándo, el motivo y si hubo reingreso.

    Con `expenses.cancel`, un gasto activo tiene el botón **"Cancelar gasto"**, que pide el motivo y confirma.

### Endpoints
28. Endpoints:

    | Endpoint | Permiso | Qué hace |
    |---|---|---|
    | `GET /api/expenses` | `expenses.read` | Lista con filtros, paginación y el total de los activos |
    | `GET /api/expenses/:id` | `expenses.read` | Detalle |
    | `GET /api/expenses/:id/receipt` | `expenses.read` | Descarga del comprobante |
    | `GET /api/expenses/options` | `expenses.create` o `expenses.read` | Categorías activas, métodos de pago sin Crédito, proveedores activos y cajas abiertas de la sucursal, para los formularios. Así el cajero no necesita `providers.read`. |
    | `POST /api/expenses` | `expenses.create` | Registra el gasto, con el comprobante (multipart) |
    | `POST /api/expenses/:id/cancel` | `expenses.cancel` | Cancela con motivo |
    | `GET /api/expense-categories` | `expenses.categories` | Todas las categorías, para Configuración |
    | `POST`, `PUT /:id` y `PATCH /:id/status` en `/api/expense-categories` | `expenses.categories` | Crear, editar y activar o desactivar |

    Todos respetan el alcance por sucursal.

### Permisos
29. Una migración crea `expenses.read`, `expenses.create`, `expenses.cancel` y `expenses.categories` y los asigna por nombre de rol (decisión #33):

    | Rol | read | create | cancel | categories |
    |---|---|---|---|---|
    | superadmin y admin | ✓ | ✓ | ✓ | ✓ |
    | supervisor | ✓ | ✓ | ✓ | |
    | cajero | | ✓ | | |
    | almacenista | | | | |

    No se asignan a roles creados por el usuario.
30. La pantalla de permisos muestra el módulo `expenses` como **"Gastos"** y la acción `categories` como **"Categorías"**.

### Migraciones
31. Cada migración hace un cambio acotado (`docs/migraciones.md`):
    1. tabla de categorías de gasto, con sus categorías iniciales;
    2. tabla de gastos;
    3. datos del histórico de caja (requisito 19), en una transacción;
    4. permisos (requisito 29), en una transacción.

### Documentación
32. `shared-features/feat-modulo-de-gastos.md` documenta la spec con la estructura de `sf-index.md` y se agrega al índice.

## Tareas

- [x] **T1. Tablas de categorías y de gastos** (requisitos 1, 2 y 31).
  — tests: las dos migraciones crean las tablas; las 7 categorías iniciales existen, y solo "Pago a proveedor (mercancía)" no cuenta en la utilidad neta.
- [x] **T2. Retiros y tipos de movimiento** (requisitos 15–19).
  — tests:
  - el retiro manual y el del corte se guardan como `withdrawal`, y `expense` responde 400;
  - el efectivo esperado resta `withdrawal`, `expense` y `legacy_expense`, y suma `expense_refund`, en el cierre, el estado de la sesión, Sesiones de caja y el Dashboard;
  - la migración del histórico convierte "Retiro en corte de caja" en `withdrawal` y lo demás en `legacy_expense`, y no toca otros tipos;
  - las etiquetas del POS, del corte impreso y del detalle de Sesiones de caja.
- [x] **T3. Permisos y menú** (requisitos 22, 29 y 30).
  — tests: la migración asigna cada permiso a los roles de la tabla y a ningún rol creado por el usuario; el menú muestra Gastos solo con `expenses.read`; las etiquetas de Permisos.
- [x] **T4. Categorías de gasto** (requisito 3).
  — tests: la API crea, edita, activa y desactiva, con nombre único y 403 sin `expenses.categories`; la pestaña solo aparece con el permiso.
- [x] **T5. API de gastos** (requisitos 5–14, 21 y 28).
  — tests:
  - registro con y sin comprobante, y las validaciones (monto, fecha futura, categoría inactiva, Crédito, comprobante de otro formato o de más de 5 MB);
  - pagado desde caja: crea su salida ligada, exige Efectivo, caja abierta de la sucursal y fecha de hoy;
  - un usuario sin `expenses.read` solo puede registrar gastos pagados desde caja;
  - lista con cada filtro, paginación y el total de los activos;
  - alcance por sucursal en la lista, el detalle, el comprobante y el registro;
  - cancelación: motivo obligatorio, reingreso con la sesión abierta, sin reingreso con la sesión cerrada, y 400 al cancelar dos veces;
  - respuestas 403 por permiso.
- [x] **T6. Módulo Gastos** (requisitos 22–27).
  — tests, con la API simulada: filtros y sus parámetros, lista y estado cancelado, total de activos, formulario (Pagado desde caja solo con Efectivo, con la caja), detalle y cancelación con motivo, incluido el aviso sin reingreso; botones según los permisos.
- [x] **T7. Gasto desde el POS** (requisitos 17 y 20).
  — tests, con la API simulada: las tres opciones, "Gasto" solo con `expenses.create`, el gasto se manda con la caja del POS y aparece en la lista de movimientos, y el retiro se manda como `withdrawal`.
- [x] **T8. Volumen de comprobantes y documentación** (requisitos 10 y 32).
  — tests: no lleva tests de código.

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | Un supervisor registra un gasto con comprobante desde el módulo Gastos, lo ve en la lista y en su detalle, y lo cancela con motivo. | 2026-10-27, copia de producción (`marksexpressv2`) con un supervisor temporal:<br>- **API:** registró "Renta de octubre (QA)" con un PNG, proveedor y folio; salió en la lista de octubre y en su detalle, el comprobante se descargó como `image/png`, se canceló con motivo, y cancelarlo otra vez respondió 400.<br>- **Pantalla** (Edge sin ventana, 1366 px): registró "Luz de octubre (QA)" con comprobante y pagado desde caja, lo abrió desde la lista y lo canceló con motivo.<br>Tests `create-expense`, `list-expenses`, `cancel-expense`, `Expenses.test`, `ExpenseFormModal.test` y `ExpenseDetailModal.test`. |
| 2 | Un cajero registra desde el POS un gasto pagado desde su caja, el efectivo esperado del corte lo resta, y no ve el menú Gastos. | 2026-10-27, copia de producción con un cajero temporal y una caja temporal abierta con $500:<br>- **API:** un gasto de $120 desde caja dejó el esperado en $380, con la salida "Gasto #1: Servicios – Garrafones de agua (QA)". La lista y un gasto fuera de caja respondieron 403.<br>- **POS** (390 px): registró "Agua para la tienda (QA)" ($80) en Movimientos de efectivo → Gasto, con comprobante; salió como "Gasto" y el esperado bajó a $420 ($500 + $345.50 − $425.50).<br>- **Menú del cajero:** POS, Dashboard, Ventas, Productos, Inventario, Clientes, Apartados, Créditos y Reportes, sin Gastos.<br>- **Corte:** con un gasto de $50 y un retiro de $100, esperado $450, contado $450, diferencia $0.<br>Tests `create-expense` y `CashMovementsModal.test`. |
| 3 | Cancelar un gasto pagado desde caja con la sesión abierta registra el reingreso; con la sesión cerrada se cancela sin reingreso y lo avisa. | 2026-10-27, copia de producción:<br>- con la sesión abierta, cancelar el gasto de $120 registró "Reingreso del gasto #1" y el esperado volvió a $500;<br>- después del corte, cancelar el gasto de $50 respondió `refund: session_closed`, sin reingreso;<br>- en la pantalla, cancelar "Luz de octubre (QA)" mostró "Se registró el reingreso de $345.50 en Caja QA spec 12.".<br>El aviso de la sesión cerrada: tests `ExpenseDetailModal.test` y `cancel-expense`. |
| 4 | El retiro manual y el del corte se guardan como retiro, y el cuadre de caja da lo mismo que antes. | Tests `movement-types`: el retiro manual y el del corte se guardan como `withdrawal`, `expense` responde 400, y el esperado es el mismo en el cierre, el estado de la sesión, Sesiones de caja (lista y detalle) y el Dashboard. También `CloseRegisterModal.test` y `CashMovementsModal.test`. En la copia de producción, el retiro de $100 del corte quedó como `withdrawal` y el corte cuadró. |
| 5 | En la copia de producción, después de migrar, el "Retiro en corte de caja" es un retiro y las otras 342 salidas son salidas históricas; ninguna es un gasto, y el efectivo esperado de las sesiones no cambia. | 2026-10-27, la migración `010` se aplicó sola en la copia de producción a las 18:54:36 (hora del servidor). Antes se guardó una foto de las 343 salidas y del esperado de cada sesión:<br>- "Retiro en corte de caja" quedó como `withdrawal` ($9,123.00);<br>- las otras 342, como `legacy_expense` ($234,162.68);<br>- ningún movimiento quedó como `expense`, y son los mismos 343 ids;<br>- el esperado de las 113 sesiones es idéntico al de antes de migrar.<br>Test `010-split-cash-withdrawals.test.js`. |
| 6 | Un administrador crea, edita y desactiva categorías de gasto en Configuración; una categoría inactiva no aparece al registrar. | 2026-10-27, copia de producción con un admin temporal: creó "QA Temporal", que cuenta en la utilidad neta por defecto; la renombró, le quitó la marca y la desactivó. Ya no salió en las opciones del formulario, y un gasto con ella respondió 400. El supervisor recibe 403 en `/expense-categories`. Hay captura de Configuración → Categorías de gasto. Tests `expense-categories`, `ExpenseCategoriesTab.test` y `Settings.test`. |
| 7 | Los permisos por defecto son los del requisito 29, y un usuario de sucursal no ve ni registra gastos de otra sucursal. | 2026-10-27, copia de producción después de la `011`:<br>- superadmin y admin tienen los 4 permisos; supervisor, read, create y cancel; "Cajero", create;<br>- almacenista y los roles creados por el usuario ("Supervisor_Ventas" y "Cajero N3") no tienen ninguno.<br>Con una sucursal temporal: el detalle de un gasto de otra sucursal responde 404 al supervisor; su lista, aunque pida esa sucursal, solo trae la suya; y su registro, aunque pida esa sucursal, se guarda en la suya. El admin central ve las dos. Tests `011-add-expenses-permissions`, `list-expenses`, `create-expense` y `cancel-expense`. |
| 8 | El módulo Gastos y el gasto del POS se ven y se usan bien en móvil. | 2026-10-27, capturas a 390 px de la lista como tarjetas, los filtros con el botón "Filtros", el detalle, el formulario de nuevo gasto y el gasto en Movimientos de efectivo del POS. Las capturas encontraron que el buscador de los filtros medía 220 px de alto en móvil y en escritorio no ocupaba su espacio; se corrigió en `expenses.css` y se volvió a revisar. |
| 9 | `shared-features/feat-modulo-de-gastos.md` existe y está en el índice. | `shared-features/feat-modulo-de-gastos.md`, en la tabla de `sf-index.md`. |
| 10 | Los tests del backend y del frontend pasan. | 2026-10-27: backend 296/296 (36 archivos), frontend 232/232 (32 archivos). |

## Dudas abiertas

- _Ninguna._

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| 2026-10-27 | Antes de redactar se resolvieron 8 dudas:<br>1. Las salidas de caja históricas no se convierten en gastos: el retiro del corte pasa a retiro y las demás quedan como salida de caja histórica. Cambia la decisión #4 del borrador, porque casi todas son pagos de mercancía.<br>2. Mientras no exista Compras, un pago a proveedor de mercancía se registra en Gastos con la categoría "Pago a proveedor (mercancía)", que no cuenta en la utilidad neta.<br>3. El paso 5 del borrador se divide en dos specs: esta (el módulo) y la 13 (el reporte y la utilidad neta).<br>4. Se documenta en `shared-features/`.<br>5. Un gasto pagado desde caja registra su reingreso al cancelarse solo si su sesión sigue abierta; si no, se cancela sin reingreso y se avisa.<br>6. Las categorías de gasto se administran en Configuración, con el permiso nuevo `expenses.categories`.<br>7. El cajero registra gastos desde el POS, solo pagados desde su caja, y no ve el menú Gastos.<br>8. La fecha de un gasto puede ser hoy o una pasada, nunca futura; un gasto pagado desde caja es de hoy. | Usuario |
| 2026-10-27 | Creación de la spec, en **Borrador**. | — |
| 2026-10-27 | Se aprueba la spec: pasa a **Lista**. | Usuario |
| 2026-10-27 | T1 terminada: migraciones `008-add-expense-categories.sql` y `009-add-expenses.sql`, con sus tests. | — |
| 2026-10-27 | T2 terminada:<br>- `helpers/cashMovements.js` con los tipos que suman y restan, que usan los cinco cálculos del efectivo esperado;<br>- `createMovement` acepta `income` y `withdrawal`;<br>- migración `010-split-cash-withdrawals.sql`;<br>- etiquetas del POS, del corte impreso y del detalle de Sesiones de caja.<br>Antes de escribir la `010` se guardó una foto de las salidas y del esperado de cada sesión en la copia de producción, porque nodemon aplica la migración en cuanto cambia un `.js`. | — |
| 2026-10-27 | T3 terminada: migración `011-add-expenses-permissions.sql`, entrada Gastos en el menú y etiquetas en Permisos. | — |
| 2026-10-27 | T4 terminada: API `/api/expense-categories` y pestaña Configuración → Categorías de gasto. | — |
| 2026-10-27 | T5 terminada: API `/api/expenses` y comprobante privado en `backend/storage/expense-receipts`. Se agregó `requireAnyPermission` a `middlewares/auth.js` para `GET /api/expenses/options`. Las listas de los filtros (categoría, método y proveedor) salen de esas opciones, así que solo muestran lo activo. | — |
| 2026-10-27 | T6 y T7 terminadas: módulo Gastos (`components/Expenses/`) y la opción Gasto en Movimientos de efectivo del POS. Comparten `Expenses/expenseForm.js`. | — |
| 2026-10-27 | T8 terminada:<br>- volumen `./backend/storage/expense-receipts` en `docker-compose.prod.yml`, y la carpeta fuera de git y de la imagen;<br>- `shared-features/feat-modulo-de-gastos.md`;<br>- helpers nuevos de tests en `docs/tests.md`.<br>**Hallazgo:** el Nginx del frontend de producción acepta 1 MB por petición por defecto y rechazaría un comprobante de 5 MB, así que se subió `client_max_body_size` a 6 MB en `/api/` (requisito 10). | — |
| 2026-10-27 | Verificación en la copia de producción con usuarios temporales (`claude_qa_admin`, `claude_qa_sup` y `claude_qa_caj`), la caja "Caja QA spec 12" y la sucursal "Sucursal QA spec 12". Al terminar se borraron con sus gastos, la categoría de prueba, los movimientos, las sesiones, los refresh tokens y los comprobantes. Se llena la evidencia de los 10 criterios de aceptación. Queda en **Lista** hasta que el usuario apruebe pasarla a Terminada. | — |
| 2026-10-27 | Se aprueba el cierre: pasa a **Terminada**. | Usuario |
