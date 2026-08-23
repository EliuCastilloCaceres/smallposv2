-- Agrega trazabilidad: qué orden se generó al completar un apartado.
-- Nullable porque la enorme mayoría de las órdenes NO vienen de un apartado.
ALTER TABLE `orders`
  ADD COLUMN `layaway_id` INT NULL AFTER `customer_id`,
  ADD KEY `fk_order_layaway` (`layaway_id`),
  ADD CONSTRAINT `fk_order_layaway` FOREIGN KEY (`layaway_id`) REFERENCES `layaways` (`layaway_id`);
