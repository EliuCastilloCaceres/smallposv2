-- Permiso del reporte de Rotación de inventario (spec 10, requisito 1).
--
-- reports.rotation se asigna a superadmin, admin, supervisor y almacenista,
-- buscados por nombre, igual que reports.inventory en la migración 005. Los
-- demás roles, incluidos los creados por el usuario, no lo reciben; se ajustan
-- después desde Configuración → Roles.
--
-- Solo cambia datos, así que va en una transacción: si algo falla no queda el
-- permiso creado sin asignar.

START TRANSACTION;

INSERT INTO permissions (module, action, description)
VALUES ('reports', 'rotation', 'Reporte de rotación de inventario');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM roles r
  JOIN permissions p ON p.module = 'reports' AND p.action = 'rotation'
 WHERE r.name IN ('superadmin', 'admin', 'supervisor', 'almacenista');

COMMIT;
