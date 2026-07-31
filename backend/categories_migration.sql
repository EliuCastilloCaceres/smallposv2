-- =============================================================
-- Migración: categorías de productos
-- Ejecutar DESPUÉS de schema_v2.sql
-- A diferencia de products (catálogo por sucursal), categories
-- es GLOBAL: se comparte entre todas las sucursales. Evita que
-- cada sucursal tenga que recrear las mismas categorías básicas
-- (Bebidas, Ropa, Electrónicos, etc.)
-- =============================================================

-- ------------------------------------------------------------
-- categories
-- ------------------------------------------------------------
CREATE TABLE `categories` (
  `category_id`  int(11)      NOT NULL AUTO_INCREMENT,
  `name`         varchar(100) NOT NULL,
  `description`  varchar(255)     DEFAULT NULL,
  `color`        varchar(20)      DEFAULT NULL,  -- hex, para distinguir visualmente en la UI
  `is_active`    tinyint(1)   NOT NULL DEFAULT 1,
  `created_at`   datetime         DEFAULT current_timestamp(),
  `updated_at`   datetime         DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `uq_category_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- products — agregar category_id
-- Nullable: permite productos sin categorizar (ej. mientras se
-- migran datos existentes o el negocio no usa categorías aún).
-- ON DELETE SET NULL: si se borra una categoría, el producto no
-- se borra, solo pierde la referencia. (En la práctica, las
-- categorías solo se desactivan, nunca se borran — ver service).
-- ------------------------------------------------------------
ALTER TABLE `products`
  ADD COLUMN `category_id` int(11) DEFAULT NULL AFTER `provider_id`,
  ADD CONSTRAINT `fk_product_category`
    FOREIGN KEY (`category_id`) REFERENCES `categories` (`category_id`)
    ON DELETE SET NULL;
 
-- Índice para filtrar productos por categoría rápidamente
CREATE INDEX `idx_products_category` ON `products` (`category_id`);
