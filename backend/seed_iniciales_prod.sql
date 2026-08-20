-- =============================================================
-- Ejecutar DESPUÉS de la creacion del schema
-- =============================================================
-- Usuario principal Superadmin
-- ┌─────────────┬─────────────┬────────────┬──────────────────────┐
-- │ username    │ password    │ rol        │ branch_id            │
-- ├─────────────┼─────────────┼────────────┼──────────────────────┤
-- │ superadmin  │ Admin123!   │ superadmin │ NULL (central)       │
-- └─────────────┴─────────────┴────────────┴──────────────────────┘
-- =============================================================

SET NAMES utf8mb4;
SET AUTOCOMMIT = 0;
START TRANSACTION;

-- =============================================================
-- BRANCH — sucursal central
-- =============================================================
INSERT IGNORE INTO `branches`
  (`branch_id`, `name`, `address`, `state`, `city`, `zip_code`, `phone_number`, `is_active`)
VALUES
  (1, 'Sucursal Central', null, null, null, null, null, 1);

-- =============================================================
-- ROLES (superadmin = 1, admin = 2, supervisor = 3, cajero = 4, almacenista = 5)
-- =============================================================
INSERT IGNORE INTO `roles` (`role_id`, `name`, `description`, `is_system`) VALUES
  (1, 'superadmin',  'Dueño del sistema. Todos los permisos. Único e inmutable.', 1),
  (2, 'admin',       'Administrador central — acceso total a todas las sucursales', 1),
  (3, 'supervisor',  'Supervisor de sucursal — reportes y configuración local', 0),
  (4, 'cajero',      'Cajero — operaciones de POS y caja', 0),
  (5, 'almacenista', 'Almacenista — gestión de inventario', 0);

-- =============================================================
-- PERMISSIONS
-- =============================================================
INSERT IGNORE INTO `permissions` (`module`, `action`, `description`) VALUES
  ('pos',              'use',      'Operar el punto de venta'),
  ('dashboard',        'read',      'Ver informacion del dashboard'),
  ('orders',           'read',     'Ver historial de ventas'),
  ('orders',           'cancel',   'Cancelar una venta'),
  ('products',         'read',     'Ver catálogo'),
  ('products',         'create',   'Crear productos'),
  ('products',         'update',   'Editar productos'),
  ('products',         'delete',   'Desactivar productos'),
  ('inventory',        'read',     'Ver inventario'),
  ('inventory',        'adjust',   'Hacer ajustes de inventario'),
  ('inventory',        'transfer', 'Solicitar traspasos'),
  ('customers',        'read',     'Ver clientes'),
  ('customers',        'create',   'Crear clientes'),
  ('customers',        'update',   'Editar clientes'),
  ('credit',           'read',     'Ver créditos'),
  ('credit',           'create',   'Otorgar crédito'),
  ('credit',           'approve',  'Aprobar límite de crédito'),
  ('layaway',          'read',     'Ver apartados'),
  ('layaway',          'create',   'Crear apartados'),
  ('providers',        'read',     'Ver proveedores'),
  ('providers',        'create',   'Crear proveedores'),
  ('providers',        'update',   'Editar proveedores'),
  ('users',            'read',     'Ver usuarios'),
  ('users',            'create',   'Crear usuarios'),
  ('users',            'update',   'Editar usuarios'),
  ('reports',          'basic',    'Reportes básicos de caja'),
  ('reports',          'advanced', 'Reportes avanzados de ventas y margen'),
  ('settings',         'read',     'Ver configuración'),
  ('returns',          'read',     'Ver devoluciones'),
  ('returns',          'create',   'Crear devoluciones'),
  ('roles',            'create',   'Crear roles'),
  ('roles',            'read',     'Ver roles'),
  ('roles',            'update',   'Editar roles y permisos'),
  ('roles',            'delete',   'Eliminar roles'),
  ('branches',         'read',     'Ver sucursales'),
  ('branches',         'create',   'Crear sucursales'),
  ('branches',         'update',   'Editar sucursales'),
  ('branches',         'delete',   'Eliminar sucursales'),
  ('categories',       'read',     'Ver categorías'),
  ('categories',       'create',   'Crear categorías'),
  ('categories',       'update',   'Editar categorías'),
  ('categories',       'delete',   'Eliminar categorías'),
  ('payment_methods',  'read',     'Ver métodos de pago'),
  ('payment_methods',  'create',   'Crear métodos de pago'),
  ('payment_methods',  'update',   'Editar métodos de pago'),
  ('payment_methods',  'delete',   'Eliminar métodos de pago'),
  ('cash_registers',   'read',     'Ver cajas registradoras'),
  ('cash_registers',   'create',   'Crear cajas registradoras'),
  ('cash_registers',   'update',   'Editar cajas registradoras'),
  ('cash_registers',   'delete',   'Eliminar cajas registradoras');

-- =============================================================
-- . ROLE_PERMISSIONS — permisos por rol
-- =============================================================

-- ── superadmin (role_id = 1): acceso total ────────────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, `permission_id` FROM `permissions`;

-- ── admin (role_id = 2): acceso total ─────────────────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 2, `permission_id` FROM `permissions`;

-- ── supervisor (role_id = 3) ──────────────────────────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 3, `permission_id` FROM `permissions`
WHERE CONCAT(`module`, '.', `action`) IN (
  'pos.use',
  'dashboard.read',
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

-- ── cajero (role_id = 4) ──────────────────────────────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 4, `permission_id` FROM `permissions`
WHERE CONCAT(`module`, '.', `action`) IN (
  'pos.use',
  'dashboard.read',
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

-- ── almacenista (role_id = 5) ─────────────────────────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 5, `permission_id` FROM `permissions`
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
-- USERS 
-- =============================================================

INSERT IGNORE INTO `users`
  (`user_id`, `first_name`, `last_name`, `username`, `password_hash`, `role_id`, `branch_id`, `position`, `is_active`)
VALUES
  -- Superadmin: branch_id NULL → acceso total
  (1, 'Super',      'Admin',      'superadmin', '$2b$10$gE/ezqg4E2qulp.02rKKau53.ziWB5Vo7gZOwyjY6IDsb.86kkx3m', 1, NULL, 'Super Administrador', 1);

-- =============================================================
-- CASH REGISTERS — caja para poder abrir el POS
-- =============================================================

INSERT IGNORE INTO `cash_registers`
  (`cash_register_id`, `branch_id`, `name`, `is_active`)
VALUES
  (1, 1, 'Caja 1', 1);

-- =============================================================
-- CATEGORIES — 5 categorías
-- =============================================================
INSERT IGNORE INTO `categories`
  (`category_id`, `name`, `description`, `color`, `is_active`)
VALUES
  (1, 'Sin Categoria', 'Artículos sin categoria',              '#8C887C', 1),
  (2, 'Abarrotes',   'Artículos de primera necesidad',         '#FBBF24', 1),
  (3, 'Hogar',       'Artículos para el hogar y decoración',   '#10B981', 1),
  (4, 'Alimentos',   'Productos comestibles y despensa',       '#F59E0B', 1),
  (5, 'Bebidas',     'Refrescos, jugos y bebidas en general',  '#EF4444', 1),
  (6, 'Papelería',   'Útiles escolares y de oficina',          '#8B5CF6', 1),
  (7, 'Electrónica', 'Dispositivos electrónicos y accesorios', '#3B82F6', 1);

-- =============================================================
-- PROVIDERS — 
-- =============================================================
INSERT IGNORE INTO `providers`
  (`provider_id`, `name`, `rfc`, `zip_code`, `address`, `state`, `city`, `phone_number`, `email`, `is_active`)
VALUES
  (1,  'Proveedor generico', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1);
 
-- =============================================================
-- CUSTOMERS
-- =============================================================
INSERT IGNORE INTO `customers`
  (`customer_id`, `first_name`, `last_name`, `address`, `state`, `city`, `zip_code`, `phone_number`, `rfc`, `email`, `credit_limit`, `credit_balance`, `is_active`)
VALUES
  (1,  'Publico en general',  NULL,    NULL, NULL, NULL, NULL, NULL, 'XAXX010101000', NULL,  0.00,  0.00, 1);


-- =============================================================
-- PAYMENT METHODS 
-- =============================================================
  INSERT IGNORE INTO `payment_methods` (`code`, `name`, `is_active`) VALUES
('cash', 'Efectivo', 1),
('card', 'Tarjeta', 1),
('transfer', 'Transferencia Bancaria', 1),
('credit', 'Crédito', 1);


COMMIT;

-- =============================================================
-- Verificación rápida (ejecutar por separado si lo necesitas)
-- =============================================================
-- SELECT
--   (SELECT COUNT(*) FROM branches)      AS total_sucursales,
--   (SELECT COUNT(*) FROM roles)         AS total_roles,
--   (SELECT COUNT(*) FROM permissions)   AS total_permisos,
--   (SELECT COUNT(*) FROM categories)    AS total_categorias,
--   (SELECT COUNT(*) FROM providers)     AS total_proveedores,
--   (SELECT COUNT(*) FROM customers)     AS total_clientes,
