-- Permiso del reporte de Compras (spec 16, requisitos 1 y 21).
--
-- reports.purchases se asigna a superadmin, admin y supervisor, buscados por
-- nombre, como los demás permisos de reportes (decisión #29b del borrador).
-- El cajero, el almacenista y los roles creados por el usuario no lo
-- reciben; se ajustan después desde Configuración → Roles. Con
-- reports.expenses, también deja sumar los gastos con proveedor.
--
-- Solo cambia datos, así que va en una transacción: si algo falla no queda el
-- permiso creado sin asignar.

START TRANSACTION;

INSERT INTO permissions (module, action, description)
VALUES ('reports', 'purchases', 'Reporte de compras');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM roles r
  JOIN permissions p ON p.module = 'reports' AND p.action = 'purchases'
 WHERE r.name IN ('superadmin', 'admin', 'supervisor');

COMMIT;
