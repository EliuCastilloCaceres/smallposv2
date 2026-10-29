-- Compras y sus líneas (spec 14, requisitos 1–3).
--
-- Una compra no se edita: se cancela con motivo (status, cancel_reason,
-- cancelled_by, cancelled_at). Si se pagó desde caja, cash_movement_id es su
-- salida de caja (tipo 'purchase'), y refund_cash_movement_id el reingreso
-- ('purchase_refund') que se registra al cancelarla con la sesión abierta.
-- El comprobante se guarda fuera de la carpeta pública: receipt_file es el
-- nombre generado en disco y receipt_name el nombre original del archivo.
--
-- Cada línea guarda el costo del producto antes y después de la compra
-- (cost_before, cost_after), porque el costo promedio no se recalcula al
-- cancelar. variant_key sigue el patrón de inventory_stock: un producto no
-- se repite con la misma variante en una compra.

CREATE TABLE purchases (
  purchase_id             int           NOT NULL AUTO_INCREMENT,
  branch_id               int           NOT NULL,
  purchase_date           date          NOT NULL,
  provider_id             int           NOT NULL,
  payment_method_id       int           NOT NULL,
  folio                   varchar(50)   DEFAULT NULL,
  notes                   varchar(255)  DEFAULT NULL,
  total                   decimal(12,2) NOT NULL,
  receipt_file            varchar(100)  DEFAULT NULL,
  receipt_name            varchar(255)  DEFAULT NULL,
  cash_movement_id        int           DEFAULT NULL,
  status                  enum('active','cancelled') NOT NULL DEFAULT 'active',
  cancel_reason           varchar(255)  DEFAULT NULL,
  cancelled_by            int           DEFAULT NULL,
  cancelled_at            datetime      DEFAULT NULL,
  refund_cash_movement_id int           DEFAULT NULL,
  created_by              int           NOT NULL,
  created_at              datetime      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (purchase_id),
  UNIQUE KEY uq_purchases_cash_movement (cash_movement_id),
  UNIQUE KEY uq_purchases_refund_movement (refund_cash_movement_id),
  KEY idx_purchases_date (purchase_date),
  KEY idx_purchases_branch_date (branch_id, purchase_date),
  KEY fk_pur_provider (provider_id),
  KEY fk_pur_payment_method (payment_method_id),
  KEY fk_pur_created_by (created_by),
  KEY fk_pur_cancelled_by (cancelled_by),
  CONSTRAINT fk_pur_branch          FOREIGN KEY (branch_id)               REFERENCES branches (branch_id),
  CONSTRAINT fk_pur_provider        FOREIGN KEY (provider_id)             REFERENCES providers (provider_id),
  CONSTRAINT fk_pur_payment_method  FOREIGN KEY (payment_method_id)       REFERENCES payment_methods (payment_method_id),
  CONSTRAINT fk_pur_cash_movement   FOREIGN KEY (cash_movement_id)        REFERENCES cash_movements (cash_movement_id),
  CONSTRAINT fk_pur_refund_movement FOREIGN KEY (refund_cash_movement_id) REFERENCES cash_movements (cash_movement_id),
  CONSTRAINT fk_pur_created_by      FOREIGN KEY (created_by)              REFERENCES users (user_id),
  CONSTRAINT fk_pur_cancelled_by    FOREIGN KEY (cancelled_by)            REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE purchase_items (
  purchase_item_id int           NOT NULL AUTO_INCREMENT,
  purchase_id      int           NOT NULL,
  product_id       int           NOT NULL,
  variant_id       int           DEFAULT NULL,
  quantity         decimal(12,3) NOT NULL,
  unit_cost        decimal(12,2) NOT NULL,
  subtotal         decimal(12,2) NOT NULL,
  cost_before      decimal(12,2) NOT NULL,
  cost_after       decimal(12,2) NOT NULL,
  variant_key      int GENERATED ALWAYS AS (IFNULL(variant_id, 0)) STORED,
  PRIMARY KEY (purchase_item_id),
  UNIQUE KEY uq_purchase_items_line (purchase_id, product_id, variant_key),
  KEY fk_pi_product (product_id),
  KEY fk_pi_variant (variant_id),
  CONSTRAINT fk_pi_purchase FOREIGN KEY (purchase_id) REFERENCES purchases (purchase_id),
  CONSTRAINT fk_pi_product  FOREIGN KEY (product_id)  REFERENCES products (product_id),
  CONSTRAINT fk_pi_variant  FOREIGN KEY (variant_id)  REFERENCES product_variants (variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
