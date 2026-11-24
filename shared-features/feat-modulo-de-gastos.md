# feat: Módulo de gastos

| Estado | Tipo | Origen | Destino | Commit origen | Fecha |
|---|---|---|---|---|---|
| **Implementada** | feat | smallposv2 | smallpos-saas | Commit de la spec 12 (un solo commit) | 2026-10-27 |

## Resumen

Agrega el módulo **Gastos** para registrar en qué y cuánto gasta el negocio, dentro o fuera de caja. Separa los retiros de caja de los gastos y deja las salidas de caja anteriores fuera de los gastos. La pestaña de reporte de gastos y la utilidad neta van en la spec 13.

- **Categorías de gasto:** tabla propia, separada de las de productos.
  - Cada categoría tiene la marca **"Cuenta en la utilidad neta"**, que usará la spec 13.
  - Categorías iniciales: Renta, Servicios, Nómina, Insumos, Mantenimiento y Otros, que cuentan en la utilidad neta, y **"Pago a proveedor (mercancía)"**, que no cuenta, porque el costo de la mercancía ya cuenta al venderse.
  - Se administran en **Configuración → Categorías de gasto** con el permiso `expenses.categories`: se crean, se editan (nombre y marca) y se activan o desactivan, pero no se borran.
- **Cada gasto** guarda:
  - fecha (hoy o pasada, nunca futura), categoría activa, monto mayor a 0 y descripción (hasta 255);
  - sucursal y método de pago (los activos, sin Crédito);
  - proveedor y folio opcionales (folio de hasta 50);
  - comprobante opcional;
  - quién lo registró y cuándo.
- **Comprobante:** foto (JPG, PNG o WEBP) o PDF de hasta 5 MB.
  - Se valida por extensión y por contenido real (magic bytes).
  - Se guarda **fuera de la carpeta pública** (`backend/storage/expense-receipts`), con un nombre generado.
  - Solo se descarga con `GET /api/expenses/:id/receipt`, que pide `expenses.read` y respeta la sucursal.
- **Pagado desde caja:** solo con Efectivo, de hoy y de una caja con sesión abierta de la sucursal del gasto. En la misma transacción se crea su salida en `cash_movements`, de tipo `expense`, ligada al gasto (`expenses.cash_movement_id`), con la descripción "Gasto #id: categoría – descripción", recortada a 100 caracteres.
- **Cancelación:** un gasto no se edita; se cancela con motivo, y quedan guardados quién lo canceló y cuándo.
  - Si se pagó desde caja y su sesión sigue abierta, se registra el reingreso (`expense_refund`, "Reingreso del gasto #id").
  - Si la sesión ya se cerró, se cancela sin reingreso, y la pantalla avisa que el dinero que regresó se registra como Ingreso manual.
- **Tipos de movimiento de caja:**

  | Tipo | Qué es | Efectivo esperado |
  |---|---|---|
  | `withdrawal` | Retiro, manual o del corte | Resta |
  | `expense` | Gasto pagado desde caja, ligado a su gasto | Resta |
  | `expense_refund` | Reingreso de un gasto cancelado | Suma |
  | `legacy_expense` | Salida de caja anterior al módulo, "Salida de caja (histórico)" | Resta |

  Las listas de tipos que suman y que restan pasan a un solo lugar, `backend/src/helpers/cashMovements.js`. Lo usan los cinco cálculos del efectivo esperado: el cierre, el estado de la sesión, la lista y el detalle de Sesiones de caja, y las cajas abiertas del Dashboard. Antes esas listas estaban escritas a mano en cada uno.
- **POS:**
  - el retiro manual y el del corte se registran como `withdrawal`;
  - `POST /api/cash-registers/:id/movements` acepta `income` y `withdrawal`, y responde 400 con `expense`;
  - "Movimientos de caja" tiene tres opciones: Ingreso, Retiro y Gasto.
  - **Gasto** solo aparece con `expenses.create`. Es un gasto en efectivo de la caja del POS, de hoy, con categoría, monto, descripción, proveedor y folio opcionales, y comprobante opcional (en el teléfono, con la cámara).
- **Histórico:** una migración de datos convierte el "Retiro en corte de caja" en `withdrawal` y todas las demás salidas `expense` en `legacy_expense`. Ninguna se convierte en gasto, así que la utilidad neta solo contará lo registrado en Gastos desde ahora.
- **Módulo Gastos** (menú y ruta `/expenses`, con `expenses.read`):
  - **filtros:**
    - periodo con los presets de Ventas y utilidad y las fechas que cubre;
    - sucursal, solo para el admin central;
    - categoría, método de pago y proveedor;
    - estado: Activos por defecto, Cancelados o Todos;
    - búsqueda por descripción o folio;
  - el total y el número de gastos **activos** del filtro;
  - lista paginada de 20, con los cancelados tachados; en móvil, tarjetas;
  - formulario de nuevo gasto, con "Pagado desde caja" solo con Efectivo;
  - detalle con el comprobante, la salida de caja y la cancelación con motivo.
- **Permisos:** `expenses.read`, `expenses.create`, `expenses.cancel` y `expenses.categories`.
  - superadmin y admin: los 4;
  - supervisor: read, create y cancel;
  - cajero: solo create. Sin `expenses.read` no ve el menú Gastos, y el backend solo le acepta gastos pagados desde una caja abierta de su sucursal.
- **Endpoints:**
  - `GET /api/expenses`, `GET /api/expenses/:id` y `GET /api/expenses/:id/receipt`;
  - `GET /api/expenses/options`, con `expenses.create` o `expenses.read`: categorías activas, métodos sin Crédito, proveedores activos, cajas abiertas y, para el admin central, las sucursales. Así el cajero no necesita `providers.read`;
  - `POST /api/expenses`, multipart con el comprobante en `receipt`;
  - `POST /api/expenses/:id/cancel`;
  - `/api/expense-categories`: GET, POST, `PUT /:id` y `PATCH /:id/status`.

Spec completa: [`specs/12-modulo-de-gastos.md`](../specs/12-modulo-de-gastos.md).

## Motivo

- No había forma de saber en qué ni cuánto gasta el negocio. La única salida registrada era la de caja: sin categoría, mezclada con retiros y sin lo que se paga fuera de caja (renta, nómina por transferencia). Son las peticiones #1 y #2 de `docs/reportes-borrador.md`.
- En la base de producción, las 343 salidas de caja (`expense`) sumaban $243,285.68, y unas 271 (~$202,866) eran pagos a proveedores de mercancía. Contarlas como gasto daba una utilidad neta de unos −$202,000, contra $31,419 de utilidad bruta, porque la mercancía ya cuenta como costo al venderse. Por eso:
  - el histórico no se convierte en gastos;
  - existe la categoría "Pago a proveedor (mercancía)", que no cuenta en la utilidad neta;
  - existe la marca por categoría.

## Historias de usuario

- Como **supervisor**, quiero registrar cada gasto con su categoría, monto, método de pago y comprobante, para saber en qué y cuánto gasta el negocio.
- Como **cajero**, quiero registrar desde el POS un gasto que pago con el efectivo de mi caja, para que el corte cuadre sin capturarlo dos veces.
- Como **cajero**, quiero registrar el pago a un proveedor de mercancía desde mi caja con su proveedor, para que quede a quién se le pagó sin contarlo como gasto.
- Como **supervisor**, quiero que los retiros de efectivo no cuenten como gasto, para que el gasto refleje lo que de verdad se gastó.
- Como **administrador**, quiero crear, editar y desactivar las categorías de gasto, para ordenarlas como las usa el negocio.
- Como **supervisor**, quiero cancelar un gasto mal capturado con su motivo, para corregirlo sin borrar el registro.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/app.js` | Monta `/api/expenses` y `/api/expense-categories`. |
| `backend/src/middlewares/auth.js` | `requireAnyPermission([módulo, acción], …)`: pasa con cualquiera de los permisos. |
| `backend/src/services/cashRegisterService.js` | El cierre y el estado de la sesión usan `helpers/cashMovements.js`; `createMovement` acepta `income` y `withdrawal`. |
| `backend/src/services/reportService.js` | La lista y el detalle de Sesiones de caja usan `helpers/cashMovements.js`. |
| `backend/src/services/dashboardService.js` | Las cajas abiertas usan `helpers/cashMovements.js`. |
| `backend/tests/setup/env.js` | `EXPENSE_RECEIPTS_DIR` apunta a una carpeta temporal en los tests. |
| `backend/.dockerignore`, `.gitignore` | Excluyen `backend/storage/`, la carpeta de comprobantes. |
| `docker-compose.prod.yml` | Volumen `./backend/storage/expense-receipts`. |
| `frontend/nginx.conf` | `client_max_body_size 6m` en `/api/`: el límite de 1 MB de Nginx rechazaba un comprobante de 5 MB. |
| `frontend/src/main.jsx`, `frontend/src/components/App.jsx` | Ruta `/expenses` y entrada Gastos en el menú, con `expenses.read`. |
| `frontend/src/components/Pos/modals/CashMovementsModal.jsx` | Opciones Ingreso, Retiro y Gasto; el retiro se manda como `withdrawal`; etiquetas de los tipos nuevos. |
| `frontend/src/components/Pos/modals/CloseRegisterModal.jsx` | El retiro del corte se manda como `withdrawal`. |
| `frontend/src/components/Pos/printCorteReport.js` | Etiquetas de los tipos nuevos. |
| `frontend/src/components/Pos/pos.css` | Estilos del formulario de gasto en el POS. |
| `frontend/src/components/Reports/modals/CashSessionDetailModal.jsx` | Etiquetas y colores de los tipos nuevos. |
| `frontend/src/components/Settings/Settings.jsx` | Pestaña "Categorías de gasto", con `expenses.categories`. |
| `frontend/src/components/Settings/settings.css` | Casilla con descripción (`set-check`). |
| `frontend/src/components/Settings/modals/PermissionsModal.jsx` | El módulo `expenses` se muestra como "Gastos" y la acción `categories` como "Categorías". |
| `frontend/src/components/App.test.jsx` | Gastos en el menú solo con `expenses.read`. |

## Archivos agregados

| Archivo | Qué es |
|---|---|
| `backend/migrations/008-add-expense-categories.sql` | Tabla `expense_categories` con las 7 categorías iniciales. |
| `backend/migrations/009-add-expenses.sql` | Tabla `expenses`. |
| `backend/migrations/010-split-cash-withdrawals.sql` | Salidas históricas: "Retiro en corte de caja" → `withdrawal`; las demás `expense` → `legacy_expense`. En una transacción. |
| `backend/migrations/011-add-expenses-permissions.sql` | Los 4 permisos, asignados por nombre de rol. En una transacción. |
| `backend/src/helpers/cashMovements.js` | Tipos que suman y restan al efectivo esperado, como listas y como SQL, y `sumCashMovements`. |
| `backend/src/middlewares/uploadExpenseReceipt.js` | Subida privada del comprobante (multer + `file-type`), con errores en español. |
| `backend/src/services/expenseService.js`, `controllers/expenseController.js`, `routes/expense_routes.js` | API de gastos. |
| `backend/src/services/expenseCategoryService.js`, `controllers/expenseCategoryController.js`, `routes/expense_category_routes.js` | API de categorías de gasto. |
| `backend/tests/helpers/expenses.js` | Archivos PNG y PDF de prueba, categorías por nombre y gastos directo en la BD. |
| `backend/tests/integration/migrations/008-…`, `009-…`, `010-…` y `011-….test.js` | Tests de las migraciones. |
| `backend/tests/integration/cash-registers/movement-types.test.js` | Retiro como `withdrawal`, 400 con `expense` y el efectivo esperado en los cinco cálculos. |
| `backend/tests/integration/expenses/*.test.js` | Categorías; registro (comprobante, validaciones, desde caja, cajero); lista, filtros, alcance y opciones; cancelación. |
| `backend/tests/unit/helpers/cashMovements.test.js` | Listas de tipos y `sumCashMovements`. |
| `frontend/src/components/Expenses/Expenses.jsx`, `expenses.css` | El módulo, con estilos `exp-*`. |
| `frontend/src/components/Expenses/expenseForm.js` | Piezas compartidas por el módulo y el POS: validación del comprobante, FormData y ver o descargar el comprobante. |
| `frontend/src/components/Expenses/modals/ExpenseFormModal.jsx`, `ExpenseDetailModal.jsx` | Nuevo gasto y detalle con cancelación. |
| `frontend/src/components/Settings/tabs/ExpenseCategoriesTab.jsx`, `modals/ExpenseCategoryModal.jsx` | Categorías de gasto en Configuración. |
| Tests del frontend | `Expenses.test.jsx`, `ExpenseFormModal.test.jsx`, `ExpenseDetailModal.test.jsx`, `ExpenseCategoriesTab.test.jsx`, `Settings.test.jsx`, `PermissionsModal.test.jsx`, `CashMovementsModal.test.jsx`, `CloseRegisterModal.test.jsx`, `CashSessionDetailModal.test.jsx` y `printCorteReport.test.js`. |

## Tareas realizadas

- [x] Tablas de categorías y de gastos.
- [x] Retiros y tipos de movimiento, con las listas en un solo lugar y la migración del histórico.
- [x] Permisos, menú y etiquetas de Permisos.
- [x] Categorías de gasto: API y pestaña en Configuración.
- [x] API de gastos: registro con comprobante, pagado desde caja, lista, detalle, comprobante, opciones y cancelación con reingreso.
- [x] Módulo Gastos.
- [x] Gasto desde el POS.
- [x] Volumen de comprobantes y esta documentación.

## Criterios de aceptación

Implementada en smallpos-saas con la Spec 22 (`specs/22-expenses-module.md`) el 2026-11-24. Las pruebas por la API se hicieron en `marksexpress` con usuarios reales y datos marcados con "(QA spec 22)". Al terminar, esos datos se borraron restaurando el backup tomado justo antes.

- [x] **Gasto en el módulo:**
  - un Supervisor registró fuera de caja un gasto de Renta de $3,500.00 por transferencia, con proveedor, folio y un PDF;
  - lo vio en la lista y en su detalle, y descargó el mismo PDF con su nombre original;
  - lo canceló con motivo. Cancelarlo otra vez responde 400.
- [x] **Gasto desde el POS:**
  - un Cajero abrió su caja con $500 y registró desde ella un gasto de $120 con foto. El esperado bajó a $380, y la salida dice "Gasto #id: Servicios – descripción";
  - no ve el menú Gastos;
  - la lista, un gasto fuera de caja y otra sucursal le responden 403.
- [x] **Reingreso:**
  - con la sesión abierta, cancelar el gasto registró "Reingreso del gasto #id" y el esperado subió $120;
  - con la sesión ya cerrada, cancelar otro gasto no registró reingreso y la sesión no cambió. La pantalla avisa que el dinero que regresó se registra como Entrada.
- [x] **Retiros:**
  - el retiro manual y el del corte se guardan como `withdrawal`;
  - un movimiento manual `expense` responde 400;
  - un corte con dos gastos, un reingreso y dos retiros cuadró: esperado $350, contado $350 y diferencia $0.
- [x] **Histórico:**
  - la migración `010` convirtió las 294 salidas de `marksexpress` en 36 retiros ($67,373.68) y 258 gastos ($141,719.00), cada gasto ligado a su salida y con la categoría que el usuario revisó;
  - de los 258 gastos, 67 ($25,726.50) cuentan en la utilidad neta;
  - el esperado de las 104 sesiones no cambió, y la segunda corrida dijo "Al día".
- [x] **Categorías:**
  - un Administrador creó una categoría, la renombró, le quitó la marca y la desactivó;
  - un nombre repetido responde 400;
  - la categoría inactiva no aparece al registrar, y un gasto con ella responde 400;
  - el Supervisor recibe 403 en `/api/expense-categories`.
- [x] **Permisos y sucursales:**
  - la migración `011` se aplicó a los dos tenants locales. Administrador tiene los 4; Supervisor, read, create y cancel; Cajero, create; los demás roles, ninguno;
  - un usuario de una sola sucursal no ve, no descarga ni registra gastos de otra.
- [x] **Comprobante privado:**
  - queda en `backend/storage/{subdominio}/expense-receipts`, y ninguna URL pública lo entrega;
  - `npm run backup` lo copió y `npm run restore` lo regresó con el mismo SHA-256.
- [x] **Pantalla:** el usuario la revisó en la app el 2026-11-24. El módulo Gastos y el gasto del POS se ven y se usan bien en escritorio (1366 px) y en el celular.
- [x] **Runbooks:**
  - `runbook-backup.md` dice que se respaldan los comprobantes;
  - `runbook-tenant-migrations.md` pide correr la vista previa del histórico antes de aplicar la `010` o de importar un dump con salidas de caja viejas.
- [x] **Tests:**
  - **backend:** `expenses.test.js` (58), `expenseCategories.test.js` (21), `uploadReceipt.test.js` (13), `cashMovements.test.js` (12) y `previewCashHistory.test.js` (6), más los de migraciones, permisos y backup;
  - **frontend:** `Expenses`, `ExpenseFormModal`, `ExpenseDetailModal`, `ExpenseCategoriesTab`, `CashMovementsModal` y los de las etiquetas;
  - **resultado:** en Docker pasan los del backend (1314/1314, 62 suites) y los del frontend (634/634, 62 archivos).

**Diferencias con smallposv2:**
- **El histórico se convierte en gastos:**
  - **sin `legacy_expense`:** ese tipo no existe en saas;
  - **reglas:** la migración `010-convert-cash-outflows.sql` clasifica cada salida `expense` vieja por su descripción. Son 11 reglas en orden, escritas para las descripciones de `marksexpress` (RF-25 de la spec):
    - pasan a retiro el corte, los ajustes, las recargas, los juguetes y zapatos y las entregas de dinero a una persona;
    - comida, renta, luz, super, agua y hojas pasan a su categoría;
    - "PAGO …" y "COMPRA(S) …" pasan a Pago a proveedor (mercancía);
    - lo demás pasa a Otros;
  - **datos de cada gasto:** toma de su salida la sucursal de la caja, la fecha en hora de México, el método Efectivo, la descripción, el usuario y la hora;
  - **por qué no la regla del plan:** era más simple, pero dejaba $83,905.18 en Otros, contando en la utilidad neta compras de mercancía, recargas y ajustes de caja.
- **Vista previa del histórico:**
  - `scripts/preview-cash-history.js` imprime, por tenant, cada descripción con su destino;
  - lee las reglas del archivo de la `010`.
- **Piezas genéricas:**
  - `helpers/cashOutflows.js` (validaciones, caja abierta y reingreso) y `middlewares/uploadReceipt.js` (comprobante privado) nacen genéricos, para que Compras los use. En smallposv2 se separaron con la spec 14;
  - `uploadExpenseReceipt.js` solo fija la carpeta.
- **Comprobantes por tenant:**
  - van en `backend/storage/{subdominio}/expense-receipts/`; la raíz se cambia con `STORAGE_DIR`;
  - la descarga solo busca en la carpeta del tenant de la petición;
  - el middleware ata `next` al contexto de la petición con `keepAsyncContext`, de `uploadImage.js`. Sin eso, el servicio pierde el tenant;
  - el volumen de producción es `./backend/storage:/app/storage`;
  - `npm run backup` copia la carpeta de cada tenant y `npm run restore` la regresa.
- **Sucursales:**
  - registrar va en `X-Branch-Id` (`branch: 'required'`); ver, descargar y cancelar, con el alcance (`branch: 'scope'`);
  - la columna de sucursal aparece cuando el alcance cubre más de una sucursal;
  - con "Todas mis sucursales", el formulario pide la sucursal del gasto entre las del usuario.
- **Permisos:**
  - van en `rbac/catalog.js`, y `permissionCodes.js` se regenera;
  - la `011` los asigna por nombre de rol, y **Administrador de sucursal** recibe lo mismo que Supervisor;
  - no se portan las etiquetas de `PermissionsModal.jsx` ni `requireAnyPermission`, porque saas tiene `anyPerm`.
- **Menú y Configuración:**
  - Gastos va en `MODULES` de `auth/modules.js`, después de Devoluciones, de donde salen la ruta y el menú. No se tocan `main.jsx` ni `App.jsx`;
  - usa el ícono `bi-cash-coin`, porque `bi-wallet2` ya es el de Suscripción;
  - la pestaña Categorías de gasto va en `settingsTabs.js`.
- **POS:**
  - en saas, los movimientos de efectivo eran "Entrada" y "Salida", y la salida se guardaba como `expense`. Pasan a Entrada, Retiro y Gasto;
  - el aviso de la sesión cerrada pide registrar el dinero como Entrada, no como Ingreso manual.
- **Efectivo esperado:** en saas, el estado de la sesión y el detalle de Sesiones de caja contaban como salida cualquier tipo que no fuera de entrada. Con `helpers/cashMovements.js`, un tipo que no está en ninguna lista ya no cuenta.
- **Estilos del módulo:** usa la `FilterCard` de Reportes, así que importa `reports.css` y su raíz lleva `rpt-root exp-root`.
- **Tests:**
  - los del backend simulan la base;
  - las migraciones se prueban revisando su SQL (`migrationFiles.test.js`), y contra MySQL al aplicarlas a los tenants locales;
  - los del frontend se adaptaron al `can()` de saas, a `useScope` y a `BranchContext`.

## Notas para portar a smallpos-saas

Revisado contra el código de smallpos-saas el 2026-10-27 (`e8f9985`).

- **Esquema por tenant:** saas no tiene el runner de migraciones SQL de [`fix-costos-e-indices.md`](fix-costos-e-indices.md). Las tablas `expense_categories` y `expenses` y la migración del histórico de caja se aplican a cada tenant con su propio paso (`scripts/migrate-*`), y un tenant nuevo debe nacer con las tablas y las categorías iniciales.
- **Histórico de caja:** antes de convertir las salidas, revisar las descripciones de cada tenant. La regla de esta base ("Retiro en corte de caja" → retiro; lo demás → histórico) sirve porque el POS escribe esa descripción fija en el corte.
- **Tipos de movimiento:** saas tiene las mismas listas a mano en `cashRegisterService` (cierre, estado y `createMovement`), `reportService` y `dashboardService`. Se reemplazan por `helpers/cashMovements.js` igual que aquí.
- **Permisos:**
  - **Catálogo:** se agregan a `PERMISSIONS` en `backend/src/rbac/catalog.js`, y se regenera `frontend/src/auth/permissionCodes.js`:
    - `expenses.read`: "Ver gastos";
    - `expenses.create`: "Registrar gastos";
    - `expenses.cancel`: "Cancelar gastos";
    - `expenses.categories`: "Administrar las categorías de gasto".
  - **Plantillas:** Supervisor recibe read, create y cancel, y Cajero solo create. Administrador lo recibe todo, y el Propietario tiene todo.
  - **Tenants existentes:** hace falta un paso de datos por tenant para los roles que ya existen.
  - **Menú:** entrada Gastos con `expenses.read` en `frontend/src/auth/modules.js`.
- **Rutas con `createSecureRouter`:**
  - `GET /options` con `{ anyPerm: ['expenses.create', 'expenses.read'], branch: 'scope' }`; saas ya tiene `anyPerm`, así que `requireAnyPermission` no se porta;
  - `GET /`, `/:id` y `/:id/receipt` con `expenses.read` y `branch: 'scope'`;
  - `POST /` con `expenses.create` y `branch: 'required'`;
  - `POST /:id/cancel` con `expenses.cancel` y `branch: 'scope'`;
  - `/expense-categories` con `expenses.categories`; son globales del tenant, sin sucursal.
- **Comprobantes por tenant:** en saas las imágenes se guardan en `public/images/{subdomain}/…` (`uploadImage.js` con `req.tenant`). El comprobante va en una carpeta **privada** por tenant, por ejemplo `storage/{subdomain}/expense-receipts`. La descarga busca el archivo en la carpeta del tenant del request, nunca solo por nombre.
- **Varias sucursales por usuario (Spec 12 de saas, sin `users.branch_id`):**
  - la lista, el detalle, el comprobante y la cancelación filtran con `branchIds` (`scopeBranchIds(req.branchScope)`);
  - el registro usa la sucursal del request (`X-Branch-Id`), y la caja del gasto pagado desde caja debe ser de esa sucursal;
  - la columna y el filtro de sucursal se muestran cuando el alcance cubre más de una sucursal, no solo para el "administrador central";
  - las sucursales del formulario salen del alcance del usuario, no de `options.branches`.
- **Etiquetas:** el modal de permisos de saas muestra la descripción del catálogo, así que el cambio de `PermissionsModal.jsx` no se porta.
- **Nginx:** revisar `client_max_body_size` en el proxy de saas para los comprobantes de 5 MB.
- **Tests:** los del backend de saas simulan `db`, así que los de integración se reescriben con esas simulaciones. Los del frontend se adaptan con los códigos de permiso de saas y `useScope`.
