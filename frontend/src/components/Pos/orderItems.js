// src/components/Pos/orderItems.js
// Líneas de la venta para POST /orders a partir del carrito. Lo usan
// PaymentModal (contado y mixto) y CreditModal (crédito).
//
// [FIX] Ya no se manda purchase_price: el servidor toma el costo del
// catálogo y lo que mande el POS no se usa (specs/03-fix-costos-e-indices.md).
// Un carrito guardado antes de este cambio (pos_cart_session) todavía puede
// traerlo; aquí se descarta igual.

export const toOrderItems = (cartItems) => cartItems.map(i => ({
  product_id: i.product_id,
  variant_id: i.variant_id ?? null,
  quantity:   i.quantity,
  unit_price: i.unit_price,
  discount:   0,
}))
