-- =============================================================
-- seed_testing.sql — Datos de prueba unificados para testing
-- Ejecutar DESPUÉS del schema_v2.sql
-- =============================================================
-- Usuarios de prueba
-- ┌─────────────┬─────────────┬────────────┬──────────────────────┐
-- │ username    │ password    │ rol        │ branch_id            │
-- ├─────────────┼─────────────┼────────────┼──────────────────────┤
-- │ admin       │ Admin123!   │ admin      │ NULL (central)       │
-- │ supervisor  │ Super123!  │ supervisor │ 1 (Sucursal central) │
-- │ cajero      │ Cajero123! │ cajero     │ 1 (Sucursal central) │
-- │ almacen     │ Almacen123!│ almacenista│ 1 (Sucursal central) │
-- └─────────────┴─────────────┴────────────┴──────────────────────┘
-- =============================================================

SET NAMES utf8mb4;
SET AUTOCOMMIT = 0;
START TRANSACTION;

-- =============================================================
-- 0. BRANCH — sucursal central (versión completa unificada)
-- =============================================================
INSERT IGNORE INTO `branches`
  (`branch_id`, `name`, `address`, `state`, `city`, `zip_code`, `phone_number`, `is_active`)
VALUES
  (1, 'Sucursal Central', 'Av. Insurgentes Sur 1234, Col. Del Valle', 'Ciudad de México', 'Benito Juárez', '03100', '5555123456', 1);

-- =============================================================
-- 1. ROLES
-- =============================================================
INSERT IGNORE INTO `roles` (`role_id`, `name`, `description`) VALUES
  (1, 'admin',       'Administrador central — acceso total a todas las sucursales'),
  (2, 'supervisor',  'Supervisor de sucursal — reportes y configuración local'),
  (3, 'cajero',      'Cajero — operaciones de POS y caja'),
  (4, 'almacenista', 'Almacenista — gestión de inventario');

-- =============================================================
-- 2. PERMISSIONS
-- =============================================================
INSERT IGNORE INTO `permissions` (`module`, `action`, `description`) VALUES
  ('pos',        'use',     'Operar el punto de venta'),
  ('orders',     'read',    'Ver historial de ventas'),
  ('orders',     'cancel',  'Cancelar una venta'),
  ('products',   'read',    'Ver catálogo'),
  ('products',   'create',  'Crear productos'),
  ('products',   'update',  'Editar productos'),
  ('products',   'delete',  'Desactivar productos'),
  ('inventory',  'read',    'Ver inventario'),
  ('inventory',  'adjust',  'Hacer ajustes de inventario'),
  ('inventory',  'transfer','Solicitar traspasos'),
  ('customers',  'read',    'Ver clientes'),
  ('customers',  'create',  'Crear clientes'),
  ('customers',  'update',  'Editar clientes'),
  ('credit',     'read',    'Ver créditos'),
  ('credit',     'create',  'Otorgar crédito'),
  ('credit',     'approve', 'Aprobar límite de crédito'),
  ('layaway',    'read',    'Ver apartados'),
  ('layaway',    'create',  'Crear apartados'),
  ('providers',  'read',    'Ver proveedores'),
  ('providers',  'create',  'Crear proveedores'),
  ('providers',  'update',  'Editar proveedores'),
  ('users',      'read',    'Ver usuarios'),
  ('users',      'create',  'Crear usuarios'),
  ('users',      'update',  'Editar usuarios'),
  ('reports',    'basic',   'Reportes básicos de caja'),
  ('reports',    'advanced','Reportes avanzados de ventas y margen'),
  ('settings',   'read',    'Ver configuración'),
  ('settings',   'update',  'Modificar configuración');

-- =============================================================
-- 3. ROLE_PERMISSIONS — permisos por rol
-- =============================================================

-- ── admin (role_id = 1): acceso total ─────────────────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, `permission_id` FROM `permissions`;

-- ── supervisor (role_id = 2) ──────────────────────────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
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
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
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
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
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
-- 4. USERS — usuarios de prueba con hashes bcrypt (rounds=10)
-- =============================================================

INSERT IGNORE INTO `users`
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
-- 5. CASH REGISTERS — caja para poder abrir el POS
-- =============================================================

INSERT IGNORE INTO `cash_registers`
  (`cash_register_id`, `branch_id`, `name`, `is_active`)
VALUES
  (1, 1, 'Caja 1', 1);

-- =============================================================
-- 6. CATEGORIES — 5 categorías
-- =============================================================
INSERT IGNORE INTO `categories`
  (`category_id`, `name`, `description`, `color`, `is_active`)
VALUES
  (1, 'Electrónica', 'Dispositivos electrónicos y accesorios', '#3B82F6', 1),
  (2, 'Hogar',       'Artículos para el hogar y decoración',   '#10B981', 1),
  (3, 'Alimentos',   'Productos comestibles y despensa',       '#F59E0B', 1),
  (4, 'Bebidas',     'Refrescos, jugos y bebidas en general',  '#EF4444', 1),
  (5, 'Papelería',   'Útiles escolares y de oficina',          '#8B5CF6', 1);

-- =============================================================
-- 7. PROVIDERS — 10 proveedores
-- =============================================================
INSERT IGNORE INTO `providers`
  (`provider_id`, `name`, `rfc`, `zip_code`, `address`, `state`, `city`, `phone_number`, `email`, `is_active`)
VALUES
  (1,  'ElectroMundo SA de CV',       'EME010101ABC', '01000', 'Av. Reforma 100, Col. Centro',              'Ciudad de México', 'Cuauhtémoc',   '5555111111', 'ventas@electromundo.com',    1),
  (2,  'Hogar y Estilo SRL',          'HYE020202DEF', '44100', 'Calle Juárez 45, Zona Centro',              'Jalisco',          'Guadalajara',  '3333222222', 'contacto@hogaryestilo.mx',   1),
  (3,  'Distribuidora del Norte',     'DDN030303GHI', '64000', 'Av. Lincoln 890, Col. Mitras',              'Nuevo León',       'Monterrey',    '8183333333', 'pedidos@delnorte.com',       1),
  (4,  'Alimentos Frescos del Valle', 'AFV040404JKL', '72500', 'Calle 5 de Mayo 234, Col. Centro',          'Puebla',           'Puebla',       '2224444444', 'ventas@frescosvalle.com',    1),
  (5,  'Bebidas Refrescantes MX',     'BRM050505MNO', '86000', 'Blvd. Adolfo López Mateos 567',             'Tabasco',          'Villahermosa', '9935555555', 'distribucion@brmx.com',      1),
  (6,  'Papel y Más S.A. de C.V.',    'PMS060606PQR', '50000', 'Calle Hidalgo 78, Centro Histórico',        'México',           'Toluca',       '7226666666', 'ventas@papelymas.mx',        1),
  (7,  'Importadora Tecnológica',     'ITE070707STU', '22000', 'Av. Constitución 321, Zona Río',            'Baja California',  'Tijuana',      '6647777777', 'importaciones@itec.com',     1),
  (8,  'Casa del Chef',               'CDC080808VWX', '31000', 'Blvd. García de León 654, Col. San Jerónimo','Michoacán',       'Morelia',      '4438888888', 'chef@casadelchef.mx',        1),
  (9,  'Dulces y Snacks La Esperanza','DSE090909YZA', '87000', 'Calle Abasolo 12, Col. Centro',             'Tamaulipas',       'Ciudad Victoria','8349999999','dulces@laesperanza.com',    1),
  (10, 'Mayoreo Express',             'MAE101010BCD', '45000', 'Av. Vallarta 2000, Col. Arcos Vallarta',    'Jalisco',          'Guadalajara',  '3330000000', 'mayoreo@express.mx',         1);

-- =============================================================
-- 8. CUSTOMERS — 10 clientes
-- =============================================================
INSERT IGNORE INTO `customers`
  (`customer_id`, `first_name`, `last_name`, `address`, `state`, `city`, `zip_code`, `phone_number`, `rfc`, `email`, `credit_limit`, `credit_balance`, `is_active`)
VALUES
  (1,  'Juan',      'Pérez García',    'Calle Allende 123, Col. Centro',           'Ciudad de México', 'Coyoacán',      '04000', '5511111111', 'PEGJ800101ABC', 'juan.perez@gmail.com',      5000.00,  0.00, 1),
  (2,  'Ana',       'López Hernández', 'Av. Hidalgo 456, Col. Juárez',             'Jalisco',          'Guadalajara',   '44100', '3322222222', 'LOHA850202DEF', 'ana.lopez@hotmail.com',     8000.00,  0.00, 1),
  (3,  'Roberto',   'Martínez Silva',  'Calle Madero 789, Col. Obispado',          'Nuevo León',       'Monterrey',     '64000', '8133333333', 'MASR900303GHI', 'roberto.mtz@outlook.com',   3000.00,  0.00, 1),
  (4,  'Carmen',    'Ramírez Torres',  'Av. Juárez 101, Col. Centro',              'Puebla',           'Puebla',        '72000', '2224444444', 'RATC880404JKL', 'carmen.rt@gmail.com',       10000.00, 0.00, 1),
  (5,  'Fernando',  'Sánchez Ruiz',    'Blvd. Kukulcán 55, Zona Hotelera',         'Quintana Roo',     'Cancún',        '77500', '9985555555', 'SARF750505MNO', 'fer.sanchez@live.com',      2500.00,  0.00, 1),
  (6,  'Diana',     'Flores Cruz',     'Calle Independencia 22, Col. San Ángel',   'México',           'Toluca',        '50000', '7226666666', 'FRCD920606PQR', 'diana.flores@yahoo.com',    6000.00,  0.00, 1),
  (7,  'Miguel',    'Castro Vargas',   'Av. Revolución 333, Col. Condesa',         'Ciudad de México', 'Cuauhtémoc',    '06100', '5577777777', 'CAVM830707STU', 'miguel.castro@mail.com',    4000.00,  0.00, 1),
  (8,  'Patricia',  'Morales Reyes',   'Calle Zaragoza 88, Centro Histórico',      'Michoacán',        'Morelia',       '58000', '4438888888', 'MORP870808VWX', 'paty.morales@gmail.com',    7000.00,  0.00, 1),
  (9,  'Alejandro', 'Ortiz Mendoza',   'Blvd. Diaz Ordaz 999, Col. Del Valle',     'Nuevo León',       'San Pedro',     '66200', '8199999999', 'ORMA810909YZA', 'alex.ortiz@outlook.com',    3500.00,  0.00, 1),
  (10, 'Laura',     'Gutiérrez Luna',  'Av. Universidad 1500, Col. Copilco',       'Ciudad de México', 'Coyoacán',      '04360', '5500000000', 'GULL891010BCD', 'laura.gl@gmail.com',        9000.00,  0.00, 1);

-- =============================================================
-- 9. PRODUCTS — 58 productos (algunos variables, otros no)
-- =============================================================
INSERT IGNORE INTO `products`
  (`product_id`, `provider_id`, `category_id`, `is_variable`, `sku`, `name`, `description`, `color`, `purchase_price`, `sale_price`, `uom`, `image`, `is_active`)
VALUES
  -- Electrónica (cat 1) — prov 1, 7
  (1,  1, 1, 0, 'ELEC-001', 'Audífonos Bluetooth Pro',      'Audífonos inalámbricos con cancelación de ruido', 'Negro',  350.00,  599.00,  'pza', NULL, 1),
  (2,  1, 1, 0, 'ELEC-002', 'Cargador Rápido USB-C 65W',    'Cargador de pared con puerto USB-C de 65W',       'Blanco', 180.00,  349.00,  'pza', NULL, 1),
  (3,  1, 1, 0, 'ELEC-003', 'Cable HDMI 2.1 3m',            'Cable HDMI de alta velocidad, 3 metros',          'Negro',  45.00,   129.00,  'pza', NULL, 1),
  (4,  7, 1, 0, 'ELEC-004', 'Mouse Inalámbrico Ergonómico', 'Mouse óptico inalámbrico ergonómico',             'Gris',   120.00,  249.00,  'pza', NULL, 1),
  (5,  7, 1, 0, 'ELEC-005', 'Teclado Mecánico RGB',         'Teclado mecánico con iluminación RGB',            'Negro',  450.00,  899.00,  'pza', NULL, 1),
  (6,  1, 1, 0, 'ELEC-006', 'Batería Portátil 20000mAh',    'Power bank de 20000 mAh con carga rápida',        'Azul',   280.00,  549.00,  'pza', NULL, 1),
  (7,  7, 1, 0, 'ELEC-007', 'Webcam Full HD 1080p',         'Cámara web Full HD con micrófono integrado',      'Negro',  200.00,  449.00,  'pza', NULL, 1),
  (8,  1, 1, 0, 'ELEC-008', 'Hub USB 3.0 7 Puertos',        'Hub expansor USB con 7 puertos y alimentación',   'Plateado',95.00,  199.00,  'pza', NULL, 1),
  (9,  7, 1, 0, 'ELEC-009', 'Soporte para Laptop Ajustable','Soporte elevador de aluminio para laptop',        'Gris',   150.00,  329.00,  'pza', NULL, 1),
  (10, 1, 1, 0, 'ELEC-010', 'Adaptador Bluetooth 5.0',      'Adaptador USB Bluetooth 5.0 para PC',             'Negro',  60.00,   149.00,  'pza', NULL, 1),
  (11, 1, 1, 0, 'ELEC-011', 'Funda para Laptop 15.6"',      'Funda acolchada para laptop de 15.6 pulgadas',    'Azul',   90.00,   199.00,  'pza', NULL, 1),
  (12, 7, 1, 0, 'ELEC-012', 'Disco Duro Externo 1TB',       'Disco duro externo portátil 1TB USB 3.0',         'Negro',  650.00,  1199.00, 'pza', NULL, 1),

  -- Hogar (cat 2) — prov 2, 8
  (13, 2, 2, 0, 'HOGA-001', 'Set de Sartenes Antiadherentes','Set de 3 sartenes con revestimiento cerámico',   'Rojo',   320.00,  699.00,  'set', NULL, 1),
  (14, 2, 2, 0, 'HOGA-002', 'Lámpara de Escritorio LED',    'Lámpara LED regulable con puerto USB',            'Blanco', 180.00,  399.00,  'pza', NULL, 1),
  (15, 2, 2, 0, 'HOGA-003', 'Organizador de Baño 3 Niveles','Estante organizador de plástico resistente',      'Blanco', 120.00,  279.00,  'pza', NULL, 1),
  (16, 8, 2, 0, 'HOGA-004', 'Juego de Cuchillos Chef 6pzs', 'Set de cuchillos de acero inoxidable',            'Negro',  280.00,  599.00,  'set', NULL, 1),
  (17, 2, 2, 0, 'HOGA-005', 'Alfombra de Baño Antideslizante','Alfombra absorbente antideslizante 50x80cm',    'Beige',  80.00,   189.00,  'pza', NULL, 1),
  (18, 8, 2, 0, 'HOGA-006', 'Vaso de Vidrio Borosilicato 4pzs','Set de 4 vasos de vidrio templado',             'Transparente',70.00,159.00,  'set', NULL, 1),
  (19, 2, 2, 0, 'HOGA-007', 'Cortinas Blackout 2pzs',       'Par de cortinas opacas con ganchos incluidos',    'Gris',   200.00,  449.00,  'set', NULL, 1),
  (20, 8, 2, 0, 'HOGA-008', 'Tabla de Cortar Bambú',        'Tabla de cortar de bambú con ranura para jugos',  'Madera', 90.00,   199.00,  'pza', NULL, 1),
  (21, 2, 2, 0, 'HOGA-009', 'Tetera de Acero Inoxidable 2L','Tetera con silbato y mango ergonómico',           'Plateado',150.00, 329.00,  'pza', NULL, 1),
  (22, 8, 2, 0, 'HOGA-010', 'Set de Toallas 3pzs',          'Set de toallas de algodón egipcio',               'Blanco', 250.00,  549.00,  'set', NULL, 1),

  -- Alimentos (cat 3) — prov 4, 8, 9
  (23, 4, 3, 0, 'ALIM-001', 'Arroz Integral 1kg',           'Arroz integral de grano largo, bolsa 1kg',        'Marrón', 18.00,   39.00,   'pza', NULL, 1),
  (24, 4, 3, 0, 'ALIM-002', 'Frijol Negro Premium 1kg',     'Frijol negro seleccionado, bolsa 1kg',            'Negro',  22.00,   45.00,   'pza', NULL, 1),
  (25, 8, 3, 0, 'ALIM-003', 'Aceite de Oliva Extra Virgen 500ml','Aceite de oliva español, botella 500ml',      'Verde',  55.00,   119.00,  'pza', NULL, 1),
  (26, 4, 3, 0, 'ALIM-004', 'Pasta de Tomate 350g',         'Pasta de tomate concentrada, lata 350g',          'Rojo',   12.00,   28.00,   'pza', NULL, 1),
  (27, 9, 3, 0, 'ALIM-005', 'Galletas de Chocolate 200g',   'Galletas con chispas de chocolate, paquete 200g', 'Marrón', 15.00,   35.00,   'pza', NULL, 1),
  (28, 4, 3, 0, 'ALIM-006', 'Lentejas Secas 500g',          'Lentejas seleccionadas, bolsa 500g',              'Verde',  16.00,   34.00,   'pza', NULL, 1),
  (29, 8, 3, 0, 'ALIM-007', 'Miel de Abeja Natural 250g',   'Miel 100% pura de abeja, frasco 250g',            'Ámbar',  45.00,   99.00,   'pza', NULL, 1),
  (30, 9, 3, 0, 'ALIM-008', 'Chocolates Surtidos 150g',     'Caja de chocolates surtidos premium',             'Marrón', 35.00,   79.00,   'pza', NULL, 1),
  (31, 4, 3, 0, 'ALIM-009', 'Harina de Trigo 1kg',          'Harina de trigo todo uso, bolsa 1kg',             'Blanco', 14.00,   32.00,   'pza', NULL, 1),
  (32, 8, 3, 0, 'ALIM-010', 'Salsa de Soja 250ml',          'Salsa de soja tradicional, botella 250ml',        'Negro',  18.00,   39.00,   'pza', NULL, 1),
  (33, 9, 3, 0, 'ALIM-011', 'Palomitas de Maíz 90g',        'Palomitas listas para microondas, bolsa 90g',     'Amarillo',10.00,  22.00,   'pza', NULL, 1),
  (34, 4, 3, 0, 'ALIM-012', 'Atún en Agua 140g',            'Filete de atún en agua, lata 140g',               'Plateado',18.00,  38.00,   'pza', NULL, 1),

  -- Bebidas (cat 4) — prov 5, 10
  (35, 5, 4, 0, 'BEBI-001', 'Agua Mineral 1.5L',            'Agua mineral natural, botella 1.5 litros',        'Transparente',8.00, 18.00, 'pza', NULL, 1),
  (36, 5, 4, 0, 'BEBI-002', 'Refresco Cola 600ml',          'Refresco de cola, botella de 600ml',              'Marrón', 10.00,   22.00,   'pza', NULL, 1),
  (37, 10,4, 0, 'BEBI-003', 'Jugo de Naranja 1L',           'Jugo de naranja 100% natural, cartón 1L',         'Naranja',22.00,   48.00,   'pza', NULL, 1),
  (38, 5, 4, 0, 'BEBI-004', 'Cerveza Artesanal IPA 355ml',  'Cerveza artesanal estilo IPA, lata 355ml',        'Dorado', 25.00,   55.00,   'pza', NULL, 1),
  (39, 10,4, 0, 'BEBI-005', 'Té Helado Limón 500ml',        'Té helado sabor limón, botella 500ml',            'Amarillo',12.00,  26.00,   'pza', NULL, 1),
  (40, 5, 4, 0, 'BEBI-006', 'Agua de Coco 330ml',           'Agua de coco natural, lata 330ml',                'Blanco', 18.00,   39.00,   'pza', NULL, 1),
  (41, 10,4, 0, 'BEBI-007', 'Café Molido Orgánico 250g',    'Café molido orgánico de Chiapas, bolsa 250g',     'Marrón', 55.00,   119.00,  'pza', NULL, 1),
  (42, 5, 4, 0, 'BEBI-008', 'Bebida Energética 473ml',      'Bebida energética, lata 473ml',                   'Azul',   20.00,   42.00,   'pza', NULL, 1),
  (43, 10,4, 0, 'BEBI-009', 'Vino Tinto Cabernet 750ml',    'Vino tinto Cabernet Sauvignon, botella 750ml',    'Rojo',   120.00,  249.00,  'pza', NULL, 1),
  (44, 5, 4, 0, 'BEBI-010', 'Smoothie de Fresa 300ml',      'Smoothie de fresa natural, botella 300ml',        'Rosa',   28.00,   59.00,   'pza', NULL, 1),

  -- Papelería (cat 5) — prov 6, 10
  (45, 6, 5, 0, 'PAPE-001', 'Cuaderno Profesional 100h',    'Cuaderno de rayas, 100 hojas, tapa dura',         'Azul',   25.00,   55.00,   'pza', NULL, 1),
  (46, 6, 5, 0, 'PAPE-002', 'Bolígrafo Azul Punto Fino 12pzs','Caja con 12 bolígrafos de punta fina',           'Azul',   35.00,   79.00,   'cja', NULL, 1),
  (47, 10,5, 0, 'PAPE-003', 'Resma de Papel Bond 500h',     'Resma de papel bond tamaño carta, 500 hojas',     'Blanco', 65.00,   139.00,  'pza', NULL, 1),
  (48, 6, 5, 0, 'PAPE-004', 'Marcadores Permanentes 8pzs',  'Set de 8 marcadores permanentes de colores',      'Surtido',40.00,   89.00,   'set', NULL, 1),
  (49, 10,5, 0, 'PAPE-005', 'Grapadora Metálica + Grapas',  'Grapadora metálica de media banda con 1000 grapas','Negro',  45.00,   99.00,   'pza', NULL, 1),
  (50, 6, 5, 0, 'PAPE-006', 'Tijeras Escolares 3pzs',       'Set de 3 tijeras escolares de punta roma',        'Surtido',30.00,   69.00,   'set', NULL, 1),
  (51, 10,5, 0, 'PAPE-007', 'Cinta Adhesiva Transparente',  'Cinta adhesiva transparente, rollo grande',       'Transparente',8.00,19.00,  'pza', NULL, 1),
  (52, 6, 5, 0, 'PAPE-008', 'Folder de Cartón 10pzs',       'Caja con 10 folders de cartón tamaño oficio',     'Manila', 50.00,   109.00,  'cja', NULL, 1),
  (53, 10,5, 0, 'PAPE-009', 'Post-it Notas Adhesivas 5pzs', 'Bloc de notas adhesivas de colores, 5 piezas',    'Surtido',28.00,   59.00,   'set', NULL, 1),
  (54, 6, 5, 0, 'PAPE-010', 'Corrector Líquido 2pzs',       'Set de 2 correctores líquidos de secado rápido',  'Blanco', 22.00,   49.00,   'set', NULL, 1),

  -- Productos variables (cat 1 y 2)
  (55, 1, 1, 1, 'ELEC-100', 'Funda para Celular Universal', 'Funda protectora de silicona para smartphone',    NULL,     40.00,   89.00,   'pza', NULL, 1),
  (56, 2, 2, 1, 'HOGA-100', 'Almohada de Memory Foam',      'Almohada ortopédica de memory foam',              NULL,     120.00,  279.00,  'pza', NULL, 1),
  (57, 1, 1, 1, 'ELEC-101', 'Protector de Pantalla Vidrio', 'Protector de pantalla de vidrio templado',        NULL,     25.00,   59.00,   'pza', NULL, 1),
  (58, 2, 2, 1, 'HOGA-101', 'Cobertor de Microfibra',       'Cobertor ligero de microfibra para cama',         NULL,     180.00,  399.00,  'pza', NULL, 1);

-- =============================================================
-- 10. PRODUCT_VARIANTS — variantes para productos variables
-- =============================================================
INSERT IGNORE INTO `product_variants`
  (`variant_id`, `product_id`, `sku`, `label`, `is_active`)
VALUES
  -- Funda para celular (product_id 55)
  (1, 55, 'ELEC-100-BK', 'Negro',  1),
  (2, 55, 'ELEC-100-BL', 'Azul',   1),
  (3, 55, 'ELEC-100-RD', 'Rojo',   1),
  (4, 55, 'ELEC-100-CL', 'Clear',  1),

  -- Almohada (product_id 56)
  (5, 56, 'HOGA-100-ST', 'Estándar', 1),
  (6, 56, 'HOGA-100-KG', 'King Size', 1),

  -- Protector pantalla (product_id 57)
  (7, 57, 'ELEC-101-55', '5.5"',  1),
  (8, 57, 'ELEC-101-65', '6.5"',  1),
  (9, 57, 'ELEC-101-67', '6.7"',  1),

  -- Cobertor (product_id 58)
  (10, 58, 'HOGA-101-MT', 'Matrimonial', 1),
  (11, 58, 'HOGA-101-QN', 'Queen',       1),
  (12, 58, 'HOGA-101-KG', 'King',        1);

-- =============================================================
-- 11. INVENTORY_STOCK — stock en sucursal 1 para todos los productos
-- =============================================================
INSERT IGNORE INTO `inventory_stock`
  (`branch_id`, `product_id`, `variant_id`, `quantity`)
VALUES
  -- Electrónica (1-12)
  (1, 1,  NULL, 45.000), (1, 2,  NULL, 30.000), (1, 3,  NULL, 60.000),
  (1, 4,  NULL, 25.000), (1, 5,  NULL, 15.000), (1, 6,  NULL, 40.000),
  (1, 7,  NULL, 20.000), (1, 8,  NULL, 35.000), (1, 9,  NULL, 28.000),
  (1, 10, NULL, 50.000), (1, 11, NULL, 22.000), (1, 12, NULL, 12.000),

  -- Hogar (13-22)
  (1, 13, NULL, 18.000), (1, 14, NULL, 24.000), (1, 15, NULL, 30.000),
  (1, 16, NULL, 16.000), (1, 17, NULL, 40.000), (1, 18, NULL, 20.000),
  (1, 19, NULL, 14.000), (1, 20, NULL, 25.000), (1, 21, NULL, 19.000),
  (1, 22, NULL, 10.000),

  -- Alimentos (23-34)
  (1, 23, NULL, 120.000), (1, 24, NULL, 100.000), (1, 25, NULL, 45.000),
  (1, 26, NULL, 80.000),  (1, 27, NULL, 90.000),  (1, 28, NULL, 70.000),
  (1, 29, NULL, 35.000),  (1, 30, NULL, 50.000),  (1, 31, NULL, 110.000),
  (1, 32, NULL, 60.000),  (1, 33, NULL, 150.000), (1, 34, NULL, 85.000),

  -- Bebidas (35-44)
  (1, 35, NULL, 200.000), (1, 36, NULL, 180.000), (1, 37, NULL, 90.000),
  (1, 38, NULL, 60.000),  (1, 39, NULL, 120.000), (1, 40, NULL, 75.000),
  (1, 41, NULL, 40.000),  (1, 42, NULL, 100.000), (1, 43, NULL, 30.000),
  (1, 44, NULL, 55.000),

  -- Papelería (45-54)
  (1, 45, NULL, 80.000),  (1, 46, NULL, 50.000),  (1, 47, NULL, 40.000),
  (1, 48, NULL, 35.000),  (1, 49, NULL, 25.000),  (1, 50, NULL, 45.000),
  (1, 51, NULL, 100.000), (1, 52, NULL, 30.000),  (1, 53, NULL, 60.000),
  (1, 54, NULL, 55.000),

  -- Productos variables: stock por variante
  -- Funda celular (55)
  (1, 55, 1,  20.000), (1, 55, 2,  18.000), (1, 55, 3,  15.000), (1, 55, 4,  22.000),
  -- Almohada (56)
  (1, 56, 5,  12.000), (1, 56, 6,  8.000),
  -- Protector pantalla (57)
  (1, 57, 7,  25.000), (1, 57, 8,  30.000), (1, 57, 9,  20.000),
  -- Cobertor (58)
  (1, 58, 10, 10.000), (1, 58, 11, 6.000),  (1, 58, 12, 5.000);

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
--   (SELECT COUNT(*) FROM products)      AS total_productos,
--   (SELECT COUNT(*) FROM product_variants) AS total_variantes,
--   (SELECT COUNT(*) FROM inventory_stock WHERE branch_id = 1) AS total_stock_suc1;
