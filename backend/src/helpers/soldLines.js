// src/helpers/soldLines.js
// Venta neta por línea de venta (order_details), compartida por Ventas →
// Productos vendidos (orderService.getSoldProducts) y el reporte de Ventas y
// utilidad (reportService.getProfitReport), para que los dos usen siempre el
// mismo criterio. Ver specs/04-reporte-ventas-y-utilidad.md, requisito 12.
//
// Los fragmentos esperan los alias `o` (orders) y `od` (order_details), y
// NET_* además el alias `ret` que agrega RETURNS_JOIN_SQL.

// Ventas que cuentan: 'partial_refund' sigue aportando ingreso por lo no
// devuelto, y 'refunded' también, porque devolver todas las unidades no
// implica reembolsar el 100% del dinero (tarifa de restock). El neteo de
// NET_SALE_SQL ya da $0 cuando el reembolso sí fue del 100%.
const SOLD_STATUSES_SQL = "o.status IN ('completed', 'partial_refund', 'refunded')";

// Prorratea el amount_refunded REAL de cada devolución entre sus líneas,
// usando el valor de lista de cada línea DENTRO de esa devolución como peso
// — no asume reembolso al 100%. Si se cobró tarifa de restock, la diferencia
// entre el valor de lista y lo realmente reembolsado se queda como ingreso
// del producto en vez de restarse de más.
const RETURN_ATTRIBUTION_SUBQUERY = `
  SELECT r.order_id, rd.product_id, rd.variant_id,
         SUM(rd.quantity) AS ret_qty,
         SUM(
           r.amount_refunded * (rd.quantity * rd.unit_price)
           / NULLIF(rf.face_value, 0)
         ) AS ret_amount_actual
  FROM return_details rd
  JOIN returns r ON rd.return_id = r.return_id
  JOIN (
    SELECT return_id, SUM(quantity * unit_price) AS face_value
    FROM return_details
    GROUP BY return_id
  ) rf ON rf.return_id = rd.return_id
  WHERE r.status = 'completed'
  GROUP BY r.order_id, rd.product_id, rd.variant_id
`;

const RETURNS_JOIN_SQL = `
  LEFT JOIN (${RETURN_ATTRIBUTION_SUBQUERY}) ret
       ON ret.order_id = od.order_id
      AND ret.product_id = od.product_id
      AND ret.variant_id <=> od.variant_id
`;

// Unidades vendidas menos las devueltas: el producto físicamente regresó al
// inventario (restoreSaleStock), así que ya no cuenta como vendido neto.
const NET_QUANTITY_SQL = 'od.quantity - COALESCE(ret.ret_qty, 0)';

// Subtotal de la línea neto de su descuento, prorrateado por el descuento a
// nivel de orden. od.discount siempre llega en 0 desde el PaymentModal (el
// descuento real se aplica a la orden completa: orders.discount /
// orders.total), así que o.total / o.subtotal es el % de la orden que
// realmente se cobró: una orden con 100% de descuento (total = 0) aporta $0
// por cada línea.
//
// Lo reembolsado se resta DESPUÉS de aplicar ese ratio — restarlo antes le
// aplicaría el descuento de orden dos veces a un monto que ya está en pesos
// finales. Sumado por orden esto da exactamente o.total - amount_refunded,
// el mismo neto que usa el dashboard (getKpis), así que ambos cuadran.
const NET_SALE_SQL = `
  (od.subtotal - od.discount) *
  CASE WHEN o.subtotal > 0 THEN o.total / o.subtotal ELSE 0 END
  - COALESCE(ret.ret_amount_actual, 0)
`;

module.exports = {
  SOLD_STATUSES_SQL,
  RETURN_ATTRIBUTION_SUBQUERY,
  RETURNS_JOIN_SQL,
  NET_QUANTITY_SQL,
  NET_SALE_SQL,
};
