-- Quién subió el comprobante de cada gasto y cuándo (spec 15, requisitos 1,
-- 3 y 11). Desde la spec 15 el comprobante se puede agregar o reemplazar
-- después de registrar el gasto, así que ya no es siempre quien lo registró.
-- Los comprobantes que ya existen se subieron al registrar el gasto; los
-- gastos sin comprobante quedan con las dos columnas vacías.

ALTER TABLE expenses
  ADD COLUMN receipt_uploaded_by int      DEFAULT NULL AFTER receipt_name,
  ADD COLUMN receipt_uploaded_at datetime DEFAULT NULL AFTER receipt_uploaded_by,
  ADD KEY fk_exp_receipt_uploaded_by (receipt_uploaded_by),
  ADD CONSTRAINT fk_exp_receipt_uploaded_by FOREIGN KEY (receipt_uploaded_by) REFERENCES users (user_id);

UPDATE expenses
   SET receipt_uploaded_by = created_by,
       receipt_uploaded_at = created_at
 WHERE receipt_file IS NOT NULL;
