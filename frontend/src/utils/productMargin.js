// src/utils/productMargin.js
// Margen de un producto: (precio de venta − costo) ÷ precio de venta × 100,
// con un decimal. Lo usan la tabla y las tarjetas de Productos y el detalle
// del producto, para que nunca muestren márgenes distintos
// (specs/06-costo-en-tabla-productos.md, requisitos 4 y 7).
//
// Sin costo (purchase_price en 0, la regla de la spec 03) o con precio de
// venta 0 no hay margen: devuelve null y la pantalla muestra "—".
export const productMargin = ({ purchase_price, sale_price }) => {
  // En centavos, para que el redondeo no dependa del error de punto flotante
  const cost  = Math.round(Number(purchase_price) * 100)
  const price = Math.round(Number(sale_price) * 100)
  if (!(cost > 0) || !(price > 0)) return null

  // Décimas de punto porcentual, redondeadas a la mitad lejos del cero
  const tenths = ((price - cost) * 1000) / price
  return (Math.sign(tenths) * Math.round(Math.abs(tenths))) / 10
}

export const fmtMargin = (margin) => (margin === null ? '—' : `${margin.toFixed(1)}%`)
