-- =============================================================
-- SMP POS — Schema v2
-- Motor: MariaDB 10.3+
-- Convenciones:
--   · snake_case en todo
--   · FKs explícitas con nombre descriptivo
--   · Soft-delete con is_active tinyint(1)
--   · Timestamps: created_at datetime DEFAULT current_timestamp()
--                 updated_at datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
-- =============================================================

SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = '+00:00';
SET NAMES utf8mb4;

-- =============================================================
-- BLOQUE 1 — ESTRUCTURA ORGANIZACIONAL
-- =============================================================

-- ------------------------------------------------------------
-- branches (sucursales)
-- Cada sucursal es una unidad de negocio independiente.
-- ------------------------------------------------------------
CREATE TABLE `branches` (
  `branch_id`    int(11)      NOT NULL AUTO_INCREMENT,
  `name`         varchar(100) NOT NULL,
  `address`      varchar(255)     DEFAULT NULL,
  `state`        varchar(45)      DEFAULT NULL,
  `city`         varchar(100)     DEFAULT NULL,
  `zip_code`     varchar(10)      DEFAULT NULL,
  `phone_number` varchar(15)      DEFAULT NULL,
  `is_active`    tinyint(1)   NOT NULL DEFAULT 1,
  `created_at`   datetime         DEFAULT current_timestamp(),
  `updated_at`   datetime         DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- roles
-- RBAC: un rol agrupa permisos. Ejemplos: admin, cajero,
-- supervisor, almacenista.
-- ------------------------------------------------------------
CREATE TABLE `roles` (
  `role_id`     int(11)     NOT NULL AUTO_INCREMENT,
  `name`        varchar(50) NOT NULL,
  `description` varchar(255)    DEFAULT NULL,
  `is_active`   tinyint(1)  NOT NULL DEFAULT 1,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `uq_role_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- permissions
-- Granular: un permiso = una acción en un módulo.
-- Ejemplos: orders.create, credit.approve, reports.view
-- ------------------------------------------------------------
CREATE TABLE `permissions` (
  `permission_id` int(11)     NOT NULL AUTO_INCREMENT,
  `module`        varchar(50) NOT NULL,   -- 'orders', 'credit', 'inventory'…
  `action`        varchar(50) NOT NULL,   -- 'create', 'read', 'update', 'delete', 'approve'
  `description`   varchar(255)    DEFAULT NULL,
  PRIMARY KEY (`permission_id`),
  UNIQUE KEY `uq_module_action` (`module`, `action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- role_permissions  (N:M roles ↔ permissions)
-- ------------------------------------------------------------
CREATE TABLE `role_permissions` (
  `role_id`       int(11) NOT NULL,
  `permission_id` int(11) NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  CONSTRAINT `fk_rp_role`       FOREIGN KEY (`role_id`)       REFERENCES `roles`       (`role_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rp_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`permission_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================
-- BLOQUE 2 — USUARIOS Y SESIONES
-- =============================================================

-- ------------------------------------------------------------
-- users
-- Un usuario puede pertenecer a una sucursal por defecto,
-- pero un admin central tiene branch_id = NULL.
-- ------------------------------------------------------------
CREATE TABLE `users` (
  `user_id`        int(11)      NOT NULL AUTO_INCREMENT,
  `first_name`     varchar(45)      DEFAULT NULL,
  `last_name`      varchar(45)      DEFAULT NULL,
  `username`       varchar(45)  NOT NULL,
  `password_hash`  varchar(255) NOT NULL,
  `role_id`        int(11)      NOT NULL,
  `branch_id`      int(11)          DEFAULT NULL,  -- NULL = admin central
  `position`       varchar(45)      DEFAULT NULL,
  `address`        varchar(255)     DEFAULT NULL,
  `zip_code`       varchar(10)      DEFAULT NULL,
  `state`          varchar(45)      DEFAULT NULL,
  `city`           varchar(45)      DEFAULT NULL,
  `phone_number`   varchar(15)      DEFAULT NULL,
  `profile_image`  varchar(255)     DEFAULT NULL,
  `is_active`      tinyint(1)   NOT NULL DEFAULT 1,
  `created_at`     datetime         DEFAULT current_timestamp(),
  `updated_at`     datetime         DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_username` (`username`),
  CONSTRAINT `fk_user_role`   FOREIGN KEY (`role_id`)   REFERENCES `roles`    (`role_id`),
  CONSTRAINT `fk_user_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`branch_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- refresh_tokens
-- Cada login genera un refresh token rotativo.
-- El access token (JWT corto ~15 min) no se persiste.
-- ------------------------------------------------------------
CREATE TABLE `refresh_tokens` (
  `token_id`   int(11)      NOT NULL AUTO_INCREMENT,
  `user_id`    int(11)      NOT NULL,
  `token_hash` varchar(255) NOT NULL,          -- SHA-256 del token real
  `expires_at` datetime     NOT NULL,
  `revoked`    tinyint(1)   NOT NULL DEFAULT 0,
  `revoked_at` datetime         DEFAULT NULL,
  `user_agent` varchar(255)     DEFAULT NULL,  -- auditoría de dispositivo
  `ip_address` varchar(45)      DEFAULT NULL,
  `created_at` datetime         DEFAULT current_timestamp(),
  PRIMARY KEY (`token_id`),
  UNIQUE KEY `uq_token_hash` (`token_hash`),
  CONSTRAINT `fk_rt_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================
-- BLOQUE 3 — CATÁLOGO (por sucursal)
-- =============================================================

-- ------------------------------------------------------------
-- providers
-- Global: un proveedor puede surtir a varias sucursales.
-- ------------------------------------------------------------
CREATE TABLE `providers` (
  `provider_id`  int(11)      NOT NULL AUTO_INCREMENT,
  `name`         varchar(150) NOT NULL,
  `rfc`          varchar(20)      DEFAULT NULL,
  `zip_code`     varchar(10)      DEFAULT NULL,
  `address`      varchar(255)     DEFAULT NULL,
  `state`        varchar(45)      DEFAULT NULL,
  `city`         varchar(100)     DEFAULT NULL,
  `phone_number` varchar(15)      DEFAULT NULL,
  `email`        varchar(100)     DEFAULT NULL,
  `is_active`    tinyint(1)   NOT NULL DEFAULT 1,
  `created_at`   datetime         DEFAULT current_timestamp(),
  `updated_at`   datetime         DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`provider_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- products
-- Catálogo independiente por sucursal.
-- branch_id + sku deben ser únicos juntos.
-- ------------------------------------------------------------
CREATE TABLE `products` (
  `product_id`     int(11)      NOT NULL AUTO_INCREMENT,
  `branch_id`      int(11)      NOT NULL,
  `provider_id`    int(11)      NOT NULL,
  `is_variable`    tinyint(1)       DEFAULT 0,  -- tiene tallas/variantes
  `sku`            varchar(255)     DEFAULT NULL,
  `name`           varchar(100) NOT NULL,
  `description`    varchar(255)     DEFAULT NULL,
  `color`          varchar(45)      DEFAULT NULL,
  `purchase_price` double       NOT NULL DEFAULT 0,
  `sale_price`     double       NOT NULL DEFAULT 0,
  `uom`            varchar(45)      DEFAULT 'pza',  -- unidad de medida
  `image`          varchar(255)     DEFAULT NULL,
  `is_active`      tinyint(1)   NOT NULL DEFAULT 1,
  `created_at`     datetime         DEFAULT current_timestamp(),
  `updated_at`     datetime         DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`product_id`),
  UNIQUE KEY `uq_branch_sku` (`branch_id`, `sku`),
  CONSTRAINT `fk_product_branch`   FOREIGN KEY (`branch_id`)   REFERENCES `branches`  (`branch_id`),
  CONSTRAINT `fk_product_provider` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`provider_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- product_variants  (antes: sizes)
-- Renombrado para cubrir tallas, colores, capacidades, etc.
-- ------------------------------------------------------------
CREATE TABLE `product_variants` (
  `variant_id`  int(11)      NOT NULL AUTO_INCREMENT,
  `product_id`  int(11)      NOT NULL,
  `sku`         varchar(255)     DEFAULT NULL,
  `label`       varchar(50)  NOT NULL,   -- "S", "M", "L", "500ml", "Azul"…
  `is_active`   tinyint(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (`variant_id`),
  CONSTRAINT `fk_variant_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- inventory_stock
-- Stock real por (producto, variante, sucursal).
-- Esta es la única fuente de verdad del stock.
-- products ya NO tiene general_stock.
-- ------------------------------------------------------------
CREATE TABLE `inventory_stock` (
  `stock_id`   int(11) NOT NULL AUTO_INCREMENT,
  `branch_id`  int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `variant_id` int(11)     DEFAULT NULL,  -- NULL = producto sin variantes
  `quantity`   double  NOT NULL DEFAULT 0,
  `updated_at` datetime    DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`stock_id`),
  UNIQUE KEY `uq_stock` (`branch_id`, `product_id`, `variant_id`),
  CONSTRAINT `fk_stock_branch`  FOREIGN KEY (`branch_id`)  REFERENCES `branches`         (`branch_id`),
  CONSTRAINT `fk_stock_product` FOREIGN KEY (`product_id`) REFERENCES `products`         (`product_id`),
  CONSTRAINT `fk_stock_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`variant_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- inventory_movements  (antes: inventory)
-- Bitácora inmutable de cada movimiento de stock.
-- Nunca se borra un registro de aquí.
-- ------------------------------------------------------------
CREATE TABLE `inventory_movements` (
  `movement_id`     int(11)     NOT NULL AUTO_INCREMENT,
  `branch_id`       int(11)     NOT NULL,
  `product_id`      int(11)     NOT NULL,
  `variant_id`      int(11)         DEFAULT NULL,
  `operation_type`  varchar(30) NOT NULL,  -- 'purchase','sale','return','adjustment','transfer_out','transfer_in'
  `quantity`        double      NOT NULL,  -- positivo = entrada, negativo = salida
  `quantity_before` double      NOT NULL,  -- stock antes del movimiento
  `quantity_after`  double      NOT NULL,  -- stock después del movimiento
  `reason`          varchar(255)    DEFAULT NULL,
  `reference_id`    int(11)         DEFAULT NULL,  -- order_id, transfer_id, etc.
  `reference_type`  varchar(30)     DEFAULT NULL,  -- 'order','transfer','adjustment'
  `user_id`         int(11)     NOT NULL,
  `created_at`      datetime        DEFAULT current_timestamp(),
  PRIMARY KEY (`movement_id`),
  CONSTRAINT `fk_invmov_branch`   FOREIGN KEY (`branch_id`)  REFERENCES `branches`         (`branch_id`),
  CONSTRAINT `fk_invmov_product`  FOREIGN KEY (`product_id`) REFERENCES `products`         (`product_id`),
  CONSTRAINT `fk_invmov_variant`  FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`variant_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_invmov_user`     FOREIGN KEY (`user_id`)    REFERENCES `users`            (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- inventory_transfers
-- Traspaso de stock entre sucursales.
-- Se generan dos inventory_movements: transfer_out + transfer_in
-- ------------------------------------------------------------
CREATE TABLE `inventory_transfers` (
  `transfer_id`   int(11)     NOT NULL AUTO_INCREMENT,
  `from_branch_id` int(11)    NOT NULL,
  `to_branch_id`  int(11)     NOT NULL,
  `product_id`    int(11)     NOT NULL,
  `variant_id`    int(11)         DEFAULT NULL,
  `quantity`      double      NOT NULL,
  `status`        varchar(20) NOT NULL DEFAULT 'pending',  -- 'pending','confirmed','cancelled'
  `notes`         varchar(255)    DEFAULT NULL,
  `requested_by`  int(11)     NOT NULL,
  `confirmed_by`  int(11)         DEFAULT NULL,
  `confirmed_at`  datetime        DEFAULT NULL,
  `created_at`    datetime        DEFAULT current_timestamp(),
  PRIMARY KEY (`transfer_id`),
  CONSTRAINT `fk_tr_from`      FOREIGN KEY (`from_branch_id`) REFERENCES `branches`         (`branch_id`),
  CONSTRAINT `fk_tr_to`        FOREIGN KEY (`to_branch_id`)   REFERENCES `branches`         (`branch_id`),
  CONSTRAINT `fk_tr_product`   FOREIGN KEY (`product_id`)     REFERENCES `products`         (`product_id`),
  CONSTRAINT `fk_tr_variant`   FOREIGN KEY (`variant_id`)     REFERENCES `product_variants` (`variant_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tr_requested` FOREIGN KEY (`requested_by`)   REFERENCES `users`            (`user_id`),
  CONSTRAINT `fk_tr_confirmed` FOREIGN KEY (`confirmed_by`)   REFERENCES `users`            (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================
-- BLOQUE 4 — CLIENTES (globales)
-- =============================================================

CREATE TABLE `customers` (
  `customer_id`   int(11)      NOT NULL AUTO_INCREMENT,
  `first_name`    varchar(45)      DEFAULT NULL,
  `last_name`     varchar(45)      DEFAULT NULL,
  `address`       varchar(255)     DEFAULT NULL,
  `state`         varchar(45)      DEFAULT NULL,
  `city`          varchar(100)     DEFAULT NULL,
  `zip_code`      varchar(10)      DEFAULT NULL,
  `phone_number`  varchar(15)      DEFAULT NULL,
  `rfc`           varchar(20)      DEFAULT NULL,
  `email`         varchar(100)     DEFAULT NULL,
  `credit_limit`  double       NOT NULL DEFAULT 0,     -- 0 = sin crédito autorizado
  `credit_balance` double      NOT NULL DEFAULT 0,     -- saldo adeudado actual
  `is_active`     tinyint(1)   NOT NULL DEFAULT 1,
  `created_at`    datetime         DEFAULT current_timestamp(),
  `updated_at`    datetime         DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `customers` (`customer_id`, `first_name`, `is_active`) VALUES (1, 'Público general', 1);

-- =============================================================
-- BLOQUE 5 — CAJA Y VENTAS (por sucursal)
-- =============================================================

CREATE TABLE `cash_registers` (
  `cash_register_id` int(11)      NOT NULL AUTO_INCREMENT,
  `branch_id`        int(11)      NOT NULL,
  `name`             varchar(100) NOT NULL,
  `is_open`          tinyint(1)   NOT NULL DEFAULT 0,
  `is_active`        tinyint(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (`cash_register_id`),
  CONSTRAINT `fk_cr_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `cash_register_sessions` (
  `session_id`     int(11) NOT NULL AUTO_INCREMENT,
  `cash_register_id` int(11) NOT NULL,
  `user_id`        int(11) NOT NULL,
  `open_amount`    double      DEFAULT NULL,
  `close_amount`   double      DEFAULT NULL,
  `opened_at`      datetime    DEFAULT current_timestamp(),
  `closed_at`      datetime    DEFAULT NULL,
  PRIMARY KEY (`session_id`),
  CONSTRAINT `fk_crs_register` FOREIGN KEY (`cash_register_id`) REFERENCES `cash_registers` (`cash_register_id`),
  CONSTRAINT `fk_crs_user`     FOREIGN KEY (`user_id`)          REFERENCES `users`          (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `cash_movements` (
  `cash_movement_id` int(11)      NOT NULL AUTO_INCREMENT,
  `session_id`       int(11)      NOT NULL,
  `movement_type`    varchar(45)  NOT NULL,  -- 'income','expense','sale','return','credit_payment','layaway_payment'
  `amount`           double       NOT NULL,
  `description`      varchar(100)     DEFAULT NULL,
  `user_id`          int(11)      NOT NULL,
  `created_at`       datetime         DEFAULT current_timestamp(),
  PRIMARY KEY (`cash_movement_id`),
  CONSTRAINT `fk_cm_session` FOREIGN KEY (`session_id`) REFERENCES `cash_register_sessions` (`session_id`),
  CONSTRAINT `fk_cm_user`    FOREIGN KEY (`user_id`)    REFERENCES `users`                  (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- orders  (ventas)
-- ------------------------------------------------------------
CREATE TABLE `orders` (
  `order_id`         int(11)      NOT NULL AUTO_INCREMENT,
  `branch_id`        int(11)      NOT NULL,
  `cash_register_id` int(11)      NOT NULL,
  `customer_id`      int(11)      NOT NULL,
  `user_id`          int(11)      NOT NULL,
  `subtotal`         double       NOT NULL DEFAULT 0,
  `discount`         double       NOT NULL DEFAULT 0,
  `total`            double       NOT NULL DEFAULT 0,
  `payment_method`   varchar(45)      DEFAULT NULL,  -- 'cash','card','transfer','credit','mixed'
  `cash_received`    double       NOT NULL DEFAULT 0,
  `cash_change`      double       NOT NULL DEFAULT 0,
  `notes`            varchar(255)     DEFAULT NULL,
  `status`           varchar(20)  NOT NULL DEFAULT 'completed',  -- 'completed','cancelled','returned'
  `created_at`       datetime         DEFAULT current_timestamp(),
  `updated_at`       datetime         DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`order_id`),
  CONSTRAINT `fk_order_branch`    FOREIGN KEY (`branch_id`)        REFERENCES `branches`        (`branch_id`),
  CONSTRAINT `fk_order_register`  FOREIGN KEY (`cash_register_id`) REFERENCES `cash_registers`  (`cash_register_id`),
  CONSTRAINT `fk_order_customer`  FOREIGN KEY (`customer_id`)      REFERENCES `customers`       (`customer_id`),
  CONSTRAINT `fk_order_user`      FOREIGN KEY (`user_id`)          REFERENCES `users`           (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `order_details` (
  `order_detail_id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id`        int(11) NOT NULL,
  `product_id`      int(11) NOT NULL,
  `variant_id`      int(11)     DEFAULT NULL,
  `quantity`        double  NOT NULL,
  `unit_price`      double  NOT NULL,   -- precio al momento de la venta (snapshot)
  `purchase_price`  double  NOT NULL,   -- costo al momento (para margen en reportes)
  `discount`        double  NOT NULL DEFAULT 0,
  `subtotal`        double  NOT NULL,
  PRIMARY KEY (`order_detail_id`),
  CONSTRAINT `fk_od_order`   FOREIGN KEY (`order_id`)   REFERENCES `orders`           (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_od_product` FOREIGN KEY (`product_id`) REFERENCES `products`         (`product_id`),
  CONSTRAINT `fk_od_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`variant_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- returns  (devoluciones)
-- Ahora vinculadas a la orden original.
-- ------------------------------------------------------------
CREATE TABLE `returns` (
  `return_id`      int(11)      NOT NULL AUTO_INCREMENT,
  `order_id`       int(11)      NOT NULL,   -- FK a la venta original (corrige omisión anterior)
  `branch_id`      int(11)      NOT NULL,
  `customer_id`    int(11)      NOT NULL,
  `user_id`        int(11)      NOT NULL,
  `reason`         varchar(255)     DEFAULT NULL,
  `amount_refunded` double      NOT NULL DEFAULT 0,
  `refund_method`  varchar(45)      DEFAULT NULL,  -- 'cash','credit_note'
  `status`         varchar(20)  NOT NULL DEFAULT 'completed',
  `created_at`     datetime         DEFAULT current_timestamp(),
  PRIMARY KEY (`return_id`),
  CONSTRAINT `fk_ret_order`    FOREIGN KEY (`order_id`)    REFERENCES `orders`    (`order_id`),
  CONSTRAINT `fk_ret_branch`   FOREIGN KEY (`branch_id`)   REFERENCES `branches`  (`branch_id`),
  CONSTRAINT `fk_ret_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`),
  CONSTRAINT `fk_ret_user`     FOREIGN KEY (`user_id`)     REFERENCES `users`     (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `return_details` (
  `return_detail_id` int(11) NOT NULL AUTO_INCREMENT,
  `return_id`        int(11) NOT NULL,
  `product_id`       int(11) NOT NULL,
  `variant_id`       int(11)     DEFAULT NULL,
  `quantity`         double  NOT NULL,
  `unit_price`       double  NOT NULL,
  PRIMARY KEY (`return_detail_id`),
  CONSTRAINT `fk_rd_return`  FOREIGN KEY (`return_id`)  REFERENCES `returns`          (`return_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rd_product` FOREIGN KEY (`product_id`) REFERENCES `products`         (`product_id`),
  CONSTRAINT `fk_rd_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`variant_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================
-- BLOQUE 6 — APARTADOS (globales, abonable en cualquier sucursal)
-- =============================================================

CREATE TABLE `layaways` (
  `layaway_id`      int(11)      NOT NULL AUTO_INCREMENT,
  `customer_id`     int(11)      NOT NULL,
  `branch_id`       int(11)      NOT NULL,   -- sucursal donde se creó / donde está el producto
  `user_id`         int(11)      NOT NULL,
  `total_amount`    double       NOT NULL,
  `amount_paid`     double       NOT NULL DEFAULT 0,
  `balance`         double       NOT NULL,   -- total_amount - amount_paid
  `due_date`        date             DEFAULT NULL,
  `notes`           varchar(255)     DEFAULT NULL,
  `status`          varchar(20)  NOT NULL DEFAULT 'active',  -- 'active','completed','cancelled'
  `created_at`      datetime         DEFAULT current_timestamp(),
  `updated_at`      datetime         DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`layaway_id`),
  CONSTRAINT `fk_lay_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`),
  CONSTRAINT `fk_lay_branch`   FOREIGN KEY (`branch_id`)   REFERENCES `branches`  (`branch_id`),
  CONSTRAINT `fk_lay_user`     FOREIGN KEY (`user_id`)     REFERENCES `users`     (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `layaway_details` (
  `layaway_detail_id` int(11) NOT NULL AUTO_INCREMENT,
  `layaway_id`        int(11) NOT NULL,
  `product_id`        int(11) NOT NULL,
  `variant_id`        int(11)     DEFAULT NULL,
  `quantity`          double  NOT NULL,
  `unit_price`        double  NOT NULL,
  PRIMARY KEY (`layaway_detail_id`),
  CONSTRAINT `fk_ld_layaway`  FOREIGN KEY (`layaway_id`)  REFERENCES `layaways`        (`layaway_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ld_product`  FOREIGN KEY (`product_id`)  REFERENCES `products`        (`product_id`),
  CONSTRAINT `fk_ld_variant`  FOREIGN KEY (`variant_id`)  REFERENCES `product_variants`(`variant_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pagos del apartado — puede pagarse en cualquier sucursal
CREATE TABLE `layaway_payments` (
  `payment_id`   int(11)     NOT NULL AUTO_INCREMENT,
  `layaway_id`   int(11)     NOT NULL,
  `branch_id`    int(11)     NOT NULL,   -- sucursal donde se recibió el abono
  `user_id`      int(11)     NOT NULL,
  `amount`       double      NOT NULL,
  `payment_method` varchar(45) DEFAULT 'cash',
  `notes`        varchar(255)    DEFAULT NULL,
  `created_at`   datetime        DEFAULT current_timestamp(),
  PRIMARY KEY (`payment_id`),
  CONSTRAINT `fk_lp_layaway` FOREIGN KEY (`layaway_id`) REFERENCES `layaways`  (`layaway_id`),
  CONSTRAINT `fk_lp_branch`  FOREIGN KEY (`branch_id`)  REFERENCES `branches`  (`branch_id`),
  CONSTRAINT `fk_lp_user`    FOREIGN KEY (`user_id`)    REFERENCES `users`     (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================
-- BLOQUE 7 — CRÉDITO (global, abonable en cualquier sucursal)
-- =============================================================

-- Una venta a crédito genera un registro aquí
-- El saldo del cliente se actualiza en customers.credit_balance
CREATE TABLE `credit_sales` (
  `credit_sale_id` int(11)     NOT NULL AUTO_INCREMENT,
  `order_id`       int(11)     NOT NULL,   -- venta que originó el crédito
  `customer_id`    int(11)     NOT NULL,
  `total_amount`   double      NOT NULL,
  `amount_paid`    double      NOT NULL DEFAULT 0,
  `balance`        double      NOT NULL,
  `due_date`       date            DEFAULT NULL,
  `status`         varchar(20) NOT NULL DEFAULT 'active',  -- 'active','paid','overdue','cancelled'
  `created_at`     datetime        DEFAULT current_timestamp(),
  `updated_at`     datetime        DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`credit_sale_id`),
  UNIQUE KEY `uq_credit_order` (`order_id`),
  CONSTRAINT `fk_cs_order`    FOREIGN KEY (`order_id`)    REFERENCES `orders`    (`order_id`),
  CONSTRAINT `fk_cs_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Abonos al crédito — puede abonarse en cualquier sucursal
CREATE TABLE `credit_payments` (
  `payment_id`     int(11)     NOT NULL AUTO_INCREMENT,
  `credit_sale_id` int(11)     NOT NULL,
  `branch_id`      int(11)     NOT NULL,
  `user_id`        int(11)     NOT NULL,
  `amount`         double      NOT NULL,
  `payment_method` varchar(45)     DEFAULT 'cash',
  `notes`          varchar(255)    DEFAULT NULL,
  `created_at`     datetime        DEFAULT current_timestamp(),
  PRIMARY KEY (`payment_id`),
  CONSTRAINT `fk_cp_credit` FOREIGN KEY (`credit_sale_id`) REFERENCES `credit_sales` (`credit_sale_id`),
  CONSTRAINT `fk_cp_branch` FOREIGN KEY (`branch_id`)      REFERENCES `branches`     (`branch_id`),
  CONSTRAINT `fk_cp_user`   FOREIGN KEY (`user_id`)        REFERENCES `users`        (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================
-- BLOQUE 8 — CONFIGURACIÓN DE SUCURSAL
-- =============================================================

-- Cada sucursal tiene sus propios datos de recibo/ticket
CREATE TABLE `branch_receipts` (
  `receipt_id`  int(11)      NOT NULL AUTO_INCREMENT,
  `branch_id`   int(11)      NOT NULL,
  `store_name`  varchar(100) NOT NULL,
  `address`     varchar(255)     DEFAULT NULL,
  `rfc`         varchar(30)      DEFAULT NULL,
  `phone`       varchar(15)      DEFAULT NULL,
  `logo_image`  varchar(255)     DEFAULT NULL,
  `footer_text` varchar(255)     DEFAULT NULL,
  `is_active`   tinyint(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (`receipt_id`),
  UNIQUE KEY `uq_receipt_branch` (`branch_id`),
  CONSTRAINT `fk_br_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`branch_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================
-- BLOQUE 9 — DATOS SEMILLA (seed)
-- =============================================================

INSERT INTO `branches` (`branch_id`, `name`, `is_active`) VALUES (1, 'Sucursal principal', 1);

INSERT INTO `roles` (`role_id`, `name`, `description`) VALUES
  (1, 'admin',       'Administrador central — acceso total a todas las sucursales'),
  (2, 'supervisor',  'Supervisor de sucursal — reportes y configuración local'),
  (3, 'cajero',      'Cajero — operaciones de POS y caja'),
  (4, 'almacenista', 'Almacenista — gestión de inventario');

INSERT INTO `permissions` (`module`, `action`, `description`) VALUES
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

INSERT INTO `providers` (`provider_id`, `name`, `is_active`) VALUES (1, 'Proveedor genérico', 1);
INSERT INTO `customers` (`customer_id`, `first_name`, `is_active`) VALUES (1, 'Público general', 1);

COMMIT;
