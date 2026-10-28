-- Permiso del reporte de Gastos (spec 13, requisito 1).
--
-- reports.expenses se asigna a superadmin, admin y supervisor, buscados por
-- nombre, como los demás permisos de reportes (decisión #29b del borrador).
-- El cajero, el almacenista y los roles creados por el usuario no lo
-- reciben; se ajustan después desde Configuración → Roles. Con
-- reports.profit, también deja ver la utilidad neta en Ventas y utilidad.
--
-- Solo cambia datos, así que va en una transacción: si algo falla no queda el
-- permiso creado sin asignar.

START TRANSACTION;

INSERT INTO permissions (module, action, description)
VALUES ('reports', 'expenses', 'Reporte de gastos');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM roles r
  JOIN permissions p ON p.module = 'reports' AND p.action = 'expenses'
 WHERE r.name IN ('superadmin', 'admin', 'supervisor');

COMMIT;
