-- Índices de fecha para Dashboard, Ventas, Devoluciones, inventario y los
-- reportes nuevos (spec 03, requisito 17). No se quita ningún índice existente.

ALTER TABLE orders
  ADD INDEX idx_orders_created          (created_at),
  ADD INDEX idx_orders_branch_created   (branch_id, created_at),
  ADD INDEX idx_orders_register_created (cash_register_id, created_at);

ALTER TABLE inventory_movements
  ADD INDEX idx_invmov_branch_created         (branch_id, created_at),
  ADD INDEX idx_invmov_branch_product_created (branch_id, product_id, created_at);

ALTER TABLE returns
  ADD INDEX idx_returns_created        (created_at),
  ADD INDEX idx_returns_branch_created (branch_id, created_at);
