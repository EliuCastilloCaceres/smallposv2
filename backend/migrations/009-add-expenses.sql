-- Gastos (spec 12, requisitos 5–14).
--
-- Un gasto no se edita: se cancela con motivo (status, cancel_reason,
-- cancelled_by, cancelled_at). Si se pagó desde caja, cash_movement_id es su
-- salida de caja (tipo 'expense'), y refund_cash_movement_id el reingreso
-- ('expense_refund') que se registra al cancelarlo con la sesión abierta.
-- El comprobante se guarda fuera de la carpeta pública: receipt_file es el
-- nombre generado en disco y receipt_name el nombre original del archivo.

CREATE TABLE expenses (
  expense_id              int           NOT NULL AUTO_INCREMENT,
  branch_id               int           NOT NULL,
  expense_date            date          NOT NULL,
  expense_category_id     int           NOT NULL,
  amount                  decimal(12,2) NOT NULL,
  description             varchar(255)  NOT NULL,
  payment_method_id       int           NOT NULL,
  provider_id             int           DEFAULT NULL,
  folio                   varchar(50)   DEFAULT NULL,
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
  PRIMARY KEY (expense_id),
  UNIQUE KEY uq_expenses_cash_movement (cash_movement_id),
  UNIQUE KEY uq_expenses_refund_movement (refund_cash_movement_id),
  KEY idx_expenses_date (expense_date),
  KEY idx_expenses_branch_date (branch_id, expense_date),
  KEY fk_exp_category (expense_category_id),
  KEY fk_exp_payment_method (payment_method_id),
  KEY fk_exp_provider (provider_id),
  KEY fk_exp_created_by (created_by),
  KEY fk_exp_cancelled_by (cancelled_by),
  CONSTRAINT fk_exp_branch          FOREIGN KEY (branch_id)               REFERENCES branches (branch_id),
  CONSTRAINT fk_exp_category        FOREIGN KEY (expense_category_id)     REFERENCES expense_categories (expense_category_id),
  CONSTRAINT fk_exp_payment_method  FOREIGN KEY (payment_method_id)       REFERENCES payment_methods (payment_method_id),
  CONSTRAINT fk_exp_provider        FOREIGN KEY (provider_id)             REFERENCES providers (provider_id),
  CONSTRAINT fk_exp_cash_movement   FOREIGN KEY (cash_movement_id)        REFERENCES cash_movements (cash_movement_id),
  CONSTRAINT fk_exp_refund_movement FOREIGN KEY (refund_cash_movement_id) REFERENCES cash_movements (cash_movement_id),
  CONSTRAINT fk_exp_created_by      FOREIGN KEY (created_by)              REFERENCES users (user_id),
  CONSTRAINT fk_exp_cancelled_by    FOREIGN KEY (cancelled_by)            REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
