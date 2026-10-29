-- Permisos del módulo de compras (spec 14, requisito 36).
--
-- Se asignan por nombre de rol, como los permisos de gastos:
--   superadmin, admin y supervisor: read, create y cancel;
--   cajero:      create (solo compras pagadas desde su caja, desde el POS);
--   almacenista: read y create.
-- Los roles creados por el usuario no reciben ninguno; se ajustan después
-- desde Configuración → Roles.
--
-- Solo cambia datos, así que va en una transacción: si algo falla no quedan
-- permisos creados sin asignar.

START TRANSACTION;

INSERT INTO permissions (module, action, description) VALUES
  ('purchases', 'read',   'Ver compras'),
  ('purchases', 'create', 'Registrar compras'),
  ('purchases', 'cancel', 'Cancelar compras');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM roles r
  JOIN permissions p ON p.module = 'purchases'
 WHERE r.name IN ('superadmin', 'admin', 'supervisor');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM roles r
  JOIN permissions p ON p.module = 'purchases' AND p.action = 'create'
 WHERE r.name = 'cajero';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM roles r
  JOIN permissions p ON p.module = 'purchases' AND p.action IN ('read', 'create')
 WHERE r.name = 'almacenista';

COMMIT;
