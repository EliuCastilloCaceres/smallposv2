-- Permiso del reporte de Ventas y utilidad y eliminación de reports.advanced,
-- que nadie usaba (spec 04, requisitos 1 y 2).
--
-- reports.profit se asigna a superadmin, admin y supervisor, buscados por
-- nombre. Los demás roles, incluidos los creados por el usuario, no lo
-- reciben; se ajustan después desde Configuración → Roles. Al borrar
-- reports.advanced, sus asignaciones en role_permissions se van en cascada.
--
-- Solo cambia datos, así que va en una transacción: si algo falla no queda el
-- permiso creado sin asignar.

START TRANSACTION;

INSERT INTO permissions (module, action, description)
VALUES ('reports', 'profit', 'Reporte de ventas y utilidad');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM roles r
  JOIN permissions p ON p.module = 'reports' AND p.action = 'profit'
 WHERE r.name IN ('superadmin', 'admin', 'supervisor');

DELETE FROM permissions
 WHERE module = 'reports' AND action = 'advanced';

COMMIT;
