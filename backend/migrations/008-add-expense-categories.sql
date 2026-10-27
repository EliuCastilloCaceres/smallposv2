-- Categorías de gasto (spec 12, requisitos 1 y 2).
--
-- Separadas de las categorías de productos (`categories`). Cada una tiene la
-- marca counts_in_net_profit, que usa la utilidad neta de la spec 13:
-- "Pago a proveedor (mercancía)" no cuenta, porque el costo de la mercancía
-- ya cuenta al venderse; las demás categorías iniciales sí.

CREATE TABLE expense_categories (
  expense_category_id  int          NOT NULL AUTO_INCREMENT,
  name                 varchar(100) NOT NULL,
  counts_in_net_profit tinyint(1)   NOT NULL DEFAULT '1',
  is_active            tinyint(1)   NOT NULL DEFAULT '1',
  created_at           datetime     DEFAULT CURRENT_TIMESTAMP,
  updated_at           datetime     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (expense_category_id),
  UNIQUE KEY uq_expense_category_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO expense_categories (name, counts_in_net_profit) VALUES
  ('Renta',                        1),
  ('Servicios',                    1),
  ('Nómina',                       1),
  ('Insumos',                      1),
  ('Mantenimiento',                1),
  ('Otros',                        1),
  ('Pago a proveedor (mercancía)', 0);
