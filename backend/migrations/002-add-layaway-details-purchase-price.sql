-- Costo de cada línea del apartado, congelado al crearlo; al liquidarse, la
-- venta usa este costo y no el del catálogo de ese día (spec 03,
-- requisitos 12 y 15).
--
-- Los detalles que ya existen se llenan con el costo actual del producto: es
-- lo más cercano al día en que se apartaron que se puede saber. Después se
-- quita el DEFAULT, para que un INSERT sin costo falle en vez de guardar 0.

ALTER TABLE layaway_details
  ADD COLUMN purchase_price decimal(12,2) NOT NULL DEFAULT '0.00' AFTER unit_price;

UPDATE layaway_details ld
  JOIN products p ON p.product_id = ld.product_id
   SET ld.purchase_price = p.purchase_price;

ALTER TABLE layaway_details
  ALTER COLUMN purchase_price DROP DEFAULT;
