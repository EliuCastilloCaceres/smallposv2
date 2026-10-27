-- Salidas de caja anteriores al módulo de gastos (spec 12, requisito 19).
--
-- Hasta ahora el retiro manual del POS y el retiro del corte se guardaban
-- como 'expense', sin categoría y mezclados con pagos a proveedores. Desde la
-- spec 12, 'expense' es solo el gasto pagado desde caja, ligado a su gasto.
-- Por decisión del usuario (decisión 1 de la spec), las salidas históricas
-- no se convierten en gastos:
--   - las del corte ("Retiro en corte de caja") pasan a 'withdrawal';
--   - todas las demás, a 'legacy_expense' ("Salida de caja (histórico)").
-- Los tres tipos restan del efectivo esperado, así que el cuadre de las
-- sesiones no cambia.
--
-- Solo cambia datos, así que va en una transacción: o se aplica completa o
-- no se aplica.

START TRANSACTION;

UPDATE cash_movements
   SET movement_type = 'withdrawal'
 WHERE movement_type = 'expense' AND description = 'Retiro en corte de caja';

UPDATE cash_movements
   SET movement_type = 'legacy_expense'
 WHERE movement_type = 'expense';

COMMIT;
