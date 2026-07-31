-- =============================================================
-- seed_dev.sql — Datos de prueba para desarrollo
-- Ejecutar DESPUÉS del schema_v2.sql
-- =============================================================
-- Usuarios de prueba
-- ┌─────────────┬─────────────┬────────────┬──────────────────────┐
-- │ username    │ password    │ rol        │ branch_id            │
-- ├─────────────┼─────────────┼────────────┼──────────────────────┤
-- │ admin       │ Admin123!   │ admin      │ NULL (central)       │
-- │ supervisor  │ Super123!   │ supervisor │ 1 (Sucursal central) │
-- │ cajero      │ Cajero123!  │ cajero     │ 1 (Sucursal central) │
-- │ almacen     │ Almacen123! │ almacenista│ 1 (Sucursal central) │
-- └─────────────┴─────────────┴────────────┴──────────────────────┘
-- =============================================================

SET NAMES utf8mb4;
SET AUTOCOMMIT = 0;
START TRANSACTION;

-- =============================================================
-- 1. ROLE_PERMISSIONS — permisos por rol
-- =============================================================

-- ── admin (role_id = 1): acceso total ─────────────────────────
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, `permission_id` FROM `permissions`;

-- ── supervisor (role_id = 2) ──────────────────────────────────
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 2, `permission_id` FROM `permissions`
WHERE CONCAT(`module`, '.', `action`) IN (
  'pos.use',
  'orders.read',
  'orders.cancel',
  'products.read',
  'products.create',
  'products.update',
  'inventory.read',
  'inventory.adjust',
  'inventory.transfer',
  'customers.read',
  'customers.create',
  'customers.update',
  'credit.read',
  'credit.create',
  'layaway.read',
  'layaway.create',
  'providers.read',
  'reports.basic',
  'reports.advanced',
  'settings.read'
);

-- ── cajero (role_id = 3) ──────────────────────────────────────
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 3, `permission_id` FROM `permissions`
WHERE CONCAT(`module`, '.', `action`) IN (
  'pos.use',
  'orders.read',
  'products.read',
  'inventory.read',
  'customers.read',
  'customers.create',
  'credit.read',
  'credit.create',
  'layaway.read',
  'layaway.create',
  'reports.basic'
);

-- ── almacenista (role_id = 4) ─────────────────────────────────
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 4, `permission_id` FROM `permissions`
WHERE CONCAT(`module`, '.', `action`) IN (
  'products.read',
  'products.create',
  'products.update',
  'inventory.read',
  'inventory.adjust',
  'inventory.transfer',
  'providers.read'
);

-- =============================================================
-- 2. USERS — usuarios de prueba con hashes bcrypt (rounds=10)
-- =============================================================

INSERT INTO `users`
  (`user_id`, `first_name`, `last_name`, `username`, `password_hash`, `role_id`, `branch_id`, `position`, `is_active`)
VALUES
  -- Admin central: branch_id NULL → acceso a todas las sucursales
  (1, 'Admin',      'Central',    'admin',      '$2b$10$gE/ezqg4E2qulp.02rKKau53.ziWB5Vo7gZOwyjY6IDsb.86kkx3m', 1, NULL, 'Administrador',  1),
  -- Supervisor de sucursal 1
  (2, 'Laura',      'Méndez',     'supervisor', '$2b$10$9xLuIA0AEsjZGcUeAQw6T.5fj5wZcMDB3/N.LUMsMTeFg8zlnMX46', 2, 1,    'Supervisora',    1),
  -- Cajero de sucursal 1
  (3, 'Carlos',     'Ruiz',       'cajero',     '$2b$10$NbczjKGQzGhajoHYw5PLAuNEccaB972kLQcsysSy7mC6gMJII4Ojq', 3, 1,    'Cajero',         1),
  -- Almacenista de sucursal 1
  (4, 'María',      'González',   'almacen',    '$2b$10$Eo5k5dty8aukax6cstJaQ.TdLfBA2sJpMHP.wfv/j3Z06/vY.zy3K', 4, 1,    'Almacenista',    1);

-- =============================================================
-- 3. CASH REGISTERS — caja para poder abrir el POS
-- =============================================================

INSERT INTO `cash_registers`
  (`cash_register_id`, `branch_id`, `name`, `is_active`)
VALUES
  (1, 1, 'Caja 1', 1);

COMMIT;

-- =============================================================
-- Verificación rápida (ejecutar por separado si lo necesitas)
-- =============================================================
-- SELECT u.username, r.name AS rol, u.branch_id,
--        COUNT(rp.permission_id) AS num_permisos
-- FROM users u
-- JOIN roles r ON u.role_id = r.role_id
-- LEFT JOIN role_permissions rp ON r.role_id = rp.role_id
-- GROUP BY u.user_id;
