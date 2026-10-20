// tests/helpers/sales.js
// Prepara lo necesario para registrar una venta por la API, directo en la
// BD (igual que helpers/users.js): caja abierta, productos con stock y los
// métodos de pago de los seeds.
const db = require('../../src/config/db');

let sequence = 0;

// Abre la caja con una sesión a nombre de userId, como el POS al abrir caja.
// Por defecto, la "Caja 1" de los seeds (sucursal 1).
const openTestRegister = async ({ userId, cashRegisterId = 1, openAmount = 0 }) => {
  await db.query('UPDATE cash_registers SET is_open = 1 WHERE cash_register_id = ?', [cashRegisterId]);
  const [result] = await db.query(
    'INSERT INTO cash_register_sessions (cash_register_id, user_id, open_amount) VALUES (?, ?, ?)',
    [cashRegisterId, userId, openAmount]
  );
  return { cashRegisterId, sessionId: result.insertId };
};

// Crea un producto activo con stock en la sucursal. Con variants (etiquetas,
// p. ej. ['S', 'M']) crea un producto variable con ese stock en cada variante.
const createTestProduct = async ({
  purchasePrice = 10,
  salePrice     = 25,
  stock         = 10,
  branchId      = 1,
  variants      = [],
} = {}) => {
  const n = ++sequence;
  const [result] = await db.query(
    `INSERT INTO products (provider_id, is_variable, sku, name, purchase_price, sale_price, is_active)
     VALUES (1, ?, ?, ?, ?, ?, 1)`,
    [variants.length > 0 ? 1 : 0, `TEST-${n}`, `Producto de prueba ${n}`, purchasePrice, salePrice]
  );
  const productId = result.insertId;

  const variantIds = [];
  for (const label of variants) {
    const [variant] = await db.query(
      'INSERT INTO product_variants (product_id, label) VALUES (?, ?)', [productId, label]
    );
    variantIds.push(variant.insertId);
  }

  for (const variantId of variantIds.length > 0 ? variantIds : [null]) {
    await db.query(
      'INSERT INTO inventory_stock (branch_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)',
      [branchId, productId, variantId, stock]
    );
  }

  return { productId, variantIds, purchasePrice, salePrice };
};

// payment_method_id de un método de los seeds por su código: cash, card,
// transfer o credit.
const paymentMethodId = async (code) => {
  const [[row]] = await db.query('SELECT payment_method_id FROM payment_methods WHERE code = ?', [code]);
  if (!row) throw new Error(`paymentMethodId: no existe el método de pago "${code}"`);
  return row.payment_method_id;
};

module.exports = {
  openTestRegister,
  createTestProduct,
  paymentMethodId,
};
