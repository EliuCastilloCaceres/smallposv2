-- Registro de CADA cobro (efectivo o no) en el momento y sesión/caja real en
-- que ocurre. Sustituye a order_payments como fuente para el corte de caja
-- ("¿cuánto se cobró de cada método en ESTA sesión?") — order_payments sigue
-- existiendo y sigue siendo la fuente correcta para "¿qué compró/pagó esta
-- orden en total?", pero para eso no importa CUÁNDO se cobró cada parte, y
-- para el corte de caja sí importa.
CREATE TABLE `payment_events` (
  `payment_event_id` INT NOT NULL AUTO_INCREMENT,
  `source_type`       VARCHAR(20) NOT NULL,   -- 'order' | 'layaway' | 'credit'
  `source_id`         INT NOT NULL,           -- order_id / layaway_id / credit_sale_id
  `branch_id`         INT NOT NULL,
  `cash_register_id`  INT NOT NULL,
  `session_id`        INT NOT NULL,
  `payment_method_id` INT NOT NULL,
  `amount`            DECIMAL(12,2) NOT NULL,
  `user_id`           INT NOT NULL,
  `created_at`        DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_event_id`),
  KEY `idx_payment_events_session`  (`session_id`),
  KEY `idx_payment_events_register` (`cash_register_id`),
  KEY `idx_payment_events_method`   (`payment_method_id`),
  KEY `idx_payment_events_source`   (`source_type`, `source_id`),
  CONSTRAINT `fk_pe_register` FOREIGN KEY (`cash_register_id`) REFERENCES `cash_registers` (`cash_register_id`),
  CONSTRAINT `fk_pe_session`  FOREIGN KEY (`session_id`)       REFERENCES `cash_register_sessions` (`session_id`),
  CONSTRAINT `fk_pe_method`   FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods` (`payment_method_id`),
  CONSTRAINT `fk_pe_branch`   FOREIGN KEY (`branch_id`) REFERENCES `branches` (`branch_id`),
  CONSTRAINT `fk_pe_user`     FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `chk_pe_source_type` CHECK (`source_type` IN ('order','layaway','credit'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
