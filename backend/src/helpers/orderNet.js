// src/helpers/orderNet.js
// Ingreso neto por orden: lo cobrado (o.total) menos lo reembolsado en
// devoluciones completadas. Es el ingreso de los KPIs del Dashboard
// (dashboardService.getKpis), compartido con el reporte de Tendencia de
// ventas para que los dos cuadren (specs/05-tendencia-de-ventas.md,
// requisito 12).
//
// Los fragmentos esperan el alias `o` (orders); ORDER_NET_SALE_SQL además el
// alias `rf` que agrega ORDER_REFUNDS_JOIN_SQL. Los estados que cuentan son
// SOLD_STATUSES_SQL de helpers/soldLines.js.
//
// No se excluye 'refunded': devolver todas las unidades no implica
// reembolsar el 100% del dinero (tarifa de restock), y este neteo ya da $0
// cuando el reembolso sí fue total.

const ORDER_REFUNDS_JOIN_SQL = `
  LEFT JOIN (
    SELECT order_id, SUM(amount_refunded) AS refunded
    FROM returns WHERE status = 'completed'
    GROUP BY order_id
  ) rf ON rf.order_id = o.order_id
`;

const ORDER_NET_SALE_SQL = 'o.total - COALESCE(rf.refunded, 0)';

module.exports = { ORDER_REFUNDS_JOIN_SQL, ORDER_NET_SALE_SQL };
