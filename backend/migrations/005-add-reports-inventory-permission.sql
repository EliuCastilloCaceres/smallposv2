-- Permiso del reporte de Valuación de inventario (spec 07, requisito 1).
--
-- reports.inventory se asigna a superadmin, admin, supervisor y almacenista,
-- buscados por nombre, igual que reports.profit y reports.trend en las
-- migraciones 003 y 004. Los demás roles, incluidos los creados por el
-- usuario, no lo reciben; se ajustan después desde Configuración → Roles.
--
-- Solo cambia datos, así que va en una transacción: si algo falla no queda el
-- permiso creado sin asignar.

START TRANSACTION;

INSERT INTO permissions (module, action, description)
VALUES ('reports', 'inventory', 'Reporte de valuación de inventario');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM roles r
  JOIN permissions p ON p.module = 'reports' AND p.action = 'inventory'
 WHERE r.name IN ('superadmin', 'admin', 'supervisor', 'almacenista');

COMMIT;
