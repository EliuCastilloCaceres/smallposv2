// src/helpers/catalogCosts.js
// Costo de los productos de una venta o apartado, tomado del catálogo.
// [FIX] El costo se toma SIEMPRE de products.purchase_price, nunca del que
// mande el cliente: antes la venta guardaba item.purchase_price tal cual, y
// el POS lo mandaba con un respaldo `?? 0`, así que una venta podía quedar
// con costo 0 e inflar la utilidad. Las variantes no tienen costo propio:
// usan el del producto base. Ver specs/03-fix-costos-e-indices.md.

const { ValidationError } = require('../errors/AppError');

// conn: conexión de la transacción en curso. items: [{ product_id, ... }].
// Devuelve Map(product_id → costo). Si un producto no existe, lanza
// ValidationError (400) con su id.
const getCatalogCosts = async (conn, items) => {
  const ids = [...new Set(items.map(i => Number(i.product_id)))];
  if (ids.length === 0) return new Map();

  const [rows] = await conn.query(
    'SELECT product_id, purchase_price FROM products WHERE product_id IN (?)',
    [ids]
  );
  const costs   = new Map(rows.map(r => [r.product_id, r.purchase_price]));
  const missing = ids.filter(id => !costs.has(id));
  if (missing.length > 0)
    throw new ValidationError(`Producto no encontrado (ID ${missing.join(', ')})`);

  return costs;
};

module.exports = { getCatalogCosts };
