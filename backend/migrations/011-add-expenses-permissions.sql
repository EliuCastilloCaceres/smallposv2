-- Permisos del módulo de gastos (spec 12, requisito 29).
--
-- Se asignan por nombre de rol, como los permisos de reportes:
--   superadmin y admin: read, create, cancel y categories;
--   supervisor:         read, create y cancel;
--   cajero:             create (solo gastos pagados desde su caja, desde el POS);
--   almacenista:        ninguno.
-- Los roles creados por el usuario no reciben ninguno; se ajustan después
-- desde Configuración → Roles.
--
-- Solo cambia datos, así que va en una transacción: si algo falla no quedan
-- permisos creados sin asignar.

START TRANSACTION;

INSERT INTO permissions (module, action, description) VALUES
  ('expenses', 'read',       'Ver gastos'),
  ('expenses', 'create',     'Registrar gastos'),
  ('expenses', 'cancel',     'Cancelar gastos'),
  ('expenses', 'categories', 'Administrar las categorías de gasto');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM roles r
  JOIN permissions p ON p.module = 'expenses'
 WHERE r.name IN ('superadmin', 'admin');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM roles r
  JOIN permissions p ON p.module = 'expenses' AND p.action IN ('read', 'create', 'cancel')
 WHERE r.name = 'supervisor';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM roles r
  JOIN permissions p ON p.module = 'expenses' AND p.action = 'create'
 WHERE r.name = 'cajero';

COMMIT;
