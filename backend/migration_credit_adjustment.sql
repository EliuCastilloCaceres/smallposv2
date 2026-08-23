-- Agrega la porción de una devolución que se resolvió como reducción de
-- deuda de crédito en vez de salir como efectivo/tarjeta de caja.
--
-- amount_refunded sigue representando el VALOR TOTAL devuelto (lo que
-- impulsa el dashboard: income = o.total - amount_refunded), sin importar
-- cómo se liquidó con el cliente. credit_adjustment_amount es la porción
-- de ese valor que se aplicó como reducción de credit_sales.balance en vez
-- de salir de caja:
--
--   efectivo_real_que_salió_de_caja = amount_refunded - credit_adjustment_amount
--
-- Queda en 0.00 para devoluciones normales (no ligadas a una venta a
-- crédito, o ligadas a una ya completamente pagada).
ALTER TABLE returns
  ADD COLUMN credit_adjustment_amount decimal(12,2) NOT NULL DEFAULT 0.00
  AFTER amount_refunded;
