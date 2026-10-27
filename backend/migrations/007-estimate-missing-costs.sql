-- Costo estimado para los productos y las ventas sin costo (spec 11).
--
-- Lo que tiene costo 0 y precio mayor a 0 toma un costo con un margen
-- pesimista de 15%: precio × 0.85, redondeado al centavo. Lo que tiene
-- precio 0 no se toca. El costo estimado no queda marcado (decisión 3 de la
-- spec), así que esta migración no se puede revertir.
--
-- Orden (requisito 7): primero las líneas de venta y de apartado y al final
-- los productos. Una línea cuyo producto ya tenía costo toma ese costo; las
-- demás, el 85% del precio de la línea, no el de hoy. Si los productos se
-- corrigieran antes, sus ventas tomarían el costo estimado como si fuera real.
--
-- Solo cambia datos, así que va en una transacción: o se aplica completa o
-- no se aplica.

START TRANSACTION;

-- Ventas de productos que ya tenían costo
UPDATE order_details od
  JOIN products p ON p.product_id = od.product_id
   SET od.purchase_price = p.purchase_price
 WHERE od.purchase_price = 0 AND od.unit_price > 0 AND p.purchase_price > 0;

-- Las demás ventas: 85% del precio de la línea
UPDATE order_details
   SET purchase_price = ROUND(unit_price * 0.85, 2)
 WHERE purchase_price = 0 AND unit_price > 0;

-- Apartados, con la misma regla
UPDATE layaway_details ld
  JOIN products p ON p.product_id = ld.product_id
   SET ld.purchase_price = p.purchase_price
 WHERE ld.purchase_price = 0 AND ld.unit_price > 0 AND p.purchase_price > 0;

UPDATE layaway_details
   SET purchase_price = ROUND(unit_price * 0.85, 2)
 WHERE purchase_price = 0 AND unit_price > 0;

-- Productos activos e inactivos: 85% de su precio de venta
UPDATE products
   SET purchase_price = ROUND(sale_price * 0.85, 2)
 WHERE purchase_price = 0 AND sale_price > 0;

COMMIT;
