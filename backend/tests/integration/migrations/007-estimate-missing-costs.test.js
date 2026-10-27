// tests/integration/migrations/007-estimate-missing-costs.test.js
// Costo estimado para los productos y las ventas sin costo (spec 11, T1).
// Sobre una base ya migrada se cargan datos con costo 0, como los de antes de
// la migración, y se vuelve a aplicar la 007 (solo cambia datos).
//
// Productos (costo / precio):
//   Pila      0 / 12.35, activo     → 10.50
//   Lámpara   0 / 100, inactivo     → 85
//   Muestra   0 / 0                 → sigue en 0
//   Foco     40 / 100               → no cambia
//   Tenis     0 / 200 (se vendió a 100 y se apartó a 150)
//                                   → 170; su venta → 85 y su apartado → 127.50
const mysql = require('mysql2/promise');
const db    = require('../../../src/config/db');
const { TEST_DB } = require('../../helpers/database');
const { runMigrations }  = require('../../../src/utils/migrations');
const { createTestUser } = require('../../helpers/users');

const MIGRATION = '007-estimate-missing-costs.sql';

const migrate = async () => {
  const conn = await mysql.createConnection({ ...TEST_DB, multipleStatements: true });
  try {
    await runMigrations(conn);
  } finally {
    await conn.end();
  }
};

const createProduct = async ({ name, cost, price, isActive = 1 }) => {
  const [result] = await db.query(
    `INSERT INTO products (provider_id, is_variable, sku, name, purchase_price, sale_price, is_active)
     VALUES (1, 0, ?, ?, ?, ?, ?)`,
    [name.toUpperCase(), name, cost, price, isActive]
  );
  return result.insertId;
};

// Línea de venta en una orden propia; devuelve el id de la línea
const insertSaleLine = async ({ productId, unitPrice, cost, status = 'completed' }) => {
  const [order] = await db.query(
    `INSERT INTO orders (branch_id, cash_register_id, customer_id, user_id, subtotal, discount, total, status)
     VALUES (1, 1, 1, ?, ?, 0, ?, ?)`,
    [user.userId, unitPrice, unitPrice, status]
  );
  const [line] = await db.query(
    `INSERT INTO order_details (order_id, product_id, variant_id, quantity, unit_price, purchase_price, discount, subtotal)
     VALUES (?, ?, NULL, 1, ?, ?, 0, ?)`,
    [order.insertId, productId, unitPrice, cost, unitPrice]
  );
  return line.insertId;
};

const insertLayawayLine = async ({ productId, unitPrice, cost }) => {
  const [layaway] = await db.query(
    `INSERT INTO layaways (customer_id, branch_id, user_id, total_amount, amount_paid, balance)
     VALUES (1, 1, ?, ?, 0, ?)`,
    [user.userId, unitPrice, unitPrice]
  );
  const [line] = await db.query(
    `INSERT INTO layaway_details (layaway_id, product_id, variant_id, quantity, unit_price, purchase_price)
     VALUES (?, ?, NULL, 1, ?, ?)`,
    [layaway.insertId, productId, unitPrice, cost]
  );
  return line.insertId;
};

const productCost = async (productId) => {
  const [[row]] = await db.query('SELECT purchase_price FROM products WHERE product_id = ?', [productId]);
  return row.purchase_price;
};
const saleLineCost = async (lineId) => {
  const [[row]] = await db.query('SELECT purchase_price FROM order_details WHERE order_detail_id = ?', [lineId]);
  return row.purchase_price;
};
const layawayLineCost = async (lineId) => {
  const [[row]] = await db.query('SELECT purchase_price FROM layaway_details WHERE layaway_detail_id = ?', [lineId]);
  return row.purchase_price;
};

let user;
const products = {};
const lines = {};

beforeAll(async () => {
  user = await createTestUser();

  products.pila    = await createProduct({ name: 'Pila',    cost: 0,  price: 12.35 });
  products.lampara = await createProduct({ name: 'Lámpara', cost: 0,  price: 100, isActive: 0 });
  products.muestra = await createProduct({ name: 'Muestra', cost: 0,  price: 0 });
  products.foco    = await createProduct({ name: 'Foco',    cost: 40, price: 100 });
  products.tenis   = await createProduct({ name: 'Tenis',   cost: 0,  price: 200 });

  lines.tenisSale     = await insertSaleLine({ productId: products.tenis, unitPrice: 100, cost: 0 });
  lines.focoSale      = await insertSaleLine({ productId: products.foco, unitPrice: 90, cost: 0 });
  lines.focoWithCost  = await insertSaleLine({ productId: products.foco, unitPrice: 100, cost: 35 });
  lines.pilaFree      = await insertSaleLine({ productId: products.pila, unitPrice: 0, cost: 0 });
  lines.pilaCancelled = await insertSaleLine({ productId: products.pila, unitPrice: 12.35, cost: 0, status: 'cancelled' });
  lines.tenisLayaway  = await insertLayawayLine({ productId: products.tenis, unitPrice: 150, cost: 0 });
  lines.focoLayaway   = await insertLayawayLine({ productId: products.foco, unitPrice: 100, cost: 0 });

  await db.query('DELETE FROM schema_migrations WHERE name = ?', [MIGRATION]);
  await migrate();
});

describe(`migration ${MIGRATION}`, () => {
  describe('products', () => {
    it('gives an active and an inactive product without cost 85% of their price, rounded to the cent', async () => {
      expect(await productCost(products.pila)).toBe(10.5);
      expect(await productCost(products.lampara)).toBe(85);
      expect(await productCost(products.tenis)).toBe(170);
    });

    it('leaves a product without price at 0 and a product with cost unchanged', async () => {
      expect(await productCost(products.muestra)).toBe(0);
      expect(await productCost(products.foco)).toBe(40);
    });
  });

  describe('sale lines', () => {
    it('gives a line of a product without cost 85% of the line price, not of the current price', async () => {
      expect(await saleLineCost(lines.tenisSale)).toBe(85);
    });

    it('gives a line of a product that already had a cost that cost', async () => {
      expect(await saleLineCost(lines.focoSale)).toBe(40);
    });

    it('leaves a line sold at price 0 at 0, and fixes a line of a cancelled order', async () => {
      expect(await saleLineCost(lines.pilaFree)).toBe(0);
      expect(await saleLineCost(lines.pilaCancelled)).toBe(10.5);
    });

    it('leaves a line with cost unchanged', async () => {
      expect(await saleLineCost(lines.focoWithCost)).toBe(35);
    });
  });

  describe('layaway lines', () => {
    it('follows the same rule as the sale lines', async () => {
      expect(await layawayLineCost(lines.tenisLayaway)).toBe(127.5);
      expect(await layawayLineCost(lines.focoLayaway)).toBe(40);
    });
  });
});
