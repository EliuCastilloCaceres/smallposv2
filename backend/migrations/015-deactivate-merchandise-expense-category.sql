-- Desactiva la categoría de gasto "Pago a proveedor (mercancía)" (spec 14,
-- requisito 26).
--
-- La spec 12 la creó para registrar los pagos de mercancía mientras no
-- existiera el módulo de Compras. Desde la spec 14, esos pagos se registran
-- como compras, con sus productos y su costo. Los gastos que ya la tienen la
-- conservan y no cambian; un administrador puede reactivarla desde
-- Configuración → Categorías de gasto.
--
-- Solo cambia datos, así que va en una transacción, como las migraciones de
-- permisos.

START TRANSACTION;

UPDATE expense_categories
   SET is_active = 0
 WHERE name = 'Pago a proveedor (mercancía)';

COMMIT;
