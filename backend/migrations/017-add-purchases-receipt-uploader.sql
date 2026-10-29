-- Quién subió el comprobante de cada compra y cuándo (spec 15, requisitos 1,
-- 3 y 11). Desde la spec 15 el comprobante se puede agregar o reemplazar
-- después de registrar la compra, así que ya no es siempre quien la registró.
-- Los comprobantes que ya existen se subieron al registrar la compra; las
-- compras sin comprobante quedan con las dos columnas vacías.

ALTER TABLE purchases
  ADD COLUMN receipt_uploaded_by int      DEFAULT NULL AFTER receipt_name,
  ADD COLUMN receipt_uploaded_at datetime DEFAULT NULL AFTER receipt_uploaded_by,
  ADD KEY fk_pur_receipt_uploaded_by (receipt_uploaded_by),
  ADD CONSTRAINT fk_pur_receipt_uploaded_by FOREIGN KEY (receipt_uploaded_by) REFERENCES users (user_id);

UPDATE purchases
   SET receipt_uploaded_by = created_by,
       receipt_uploaded_at = created_at
 WHERE receipt_file IS NOT NULL;
