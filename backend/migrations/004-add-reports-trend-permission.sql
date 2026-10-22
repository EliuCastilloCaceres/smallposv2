-- Permiso del reporte de Tendencia de ventas (spec 05, requisito 1).
--
-- reports.trend se asigna a superadmin, admin y supervisor, buscados por
-- nombre, igual que reports.profit en la migración 003. Los demás roles,
-- incluidos los creados por el usuario, no lo reciben; se ajustan después
-- desde Configuración → Roles.
--
-- Solo cambia datos, así que va en una transacción: si algo falla no queda el
-- permiso creado sin asignar.

START TRANSACTION;

INSERT INTO permissions (module, action, description)
VALUES ('reports', 'trend', 'Reporte de tendencia de ventas');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM roles r
  JOIN permissions p ON p.module = 'reports' AND p.action = 'trend'
 WHERE r.name IN ('superadmin', 'admin', 'supervisor');

COMMIT;
