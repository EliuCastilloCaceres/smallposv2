// tests/integration/migrations/002-add-layaway-details-purchase-price.test.js
// Costo en layaway_details (spec 03, T4). Parte de una base sin migrar, con
// un apartado guardado con la forma vieja (sin costo), y la migra.
const mysql = require('mysql2/promise');
const db    = require('../../../src/config/db');
const { TEST_DB, resetDatabase } = require('../../helpers/database');
const { runMigrations }          = require('../../../src/utils/migrations');
const { createTestUser }         = require('../../helpers/users');
const { createTestProduct }      = require('../../helpers/sales');

const migrate = async () => {
  const conn = await mysql.createConnection({ ...TEST_DB, multipleStatements: true });
  try {
    await runMigrations(conn);
  } finally {
    await conn.end();
  }
};

const insertLayaway = async (userId) => {
  const [result] = await db.query(
    `INSERT INTO layaways (customer_id, branch_id, user_id, total_amount, amount_paid, balance)
     VALUES (1, 1, ?, 50, 0, 50)`,
    [userId]
  );
  return result.insertId;
};

let user;
let product;

beforeAll(async () => {
  await resetDatabase({ migrate: false });
  user    = await createTestUser();
  product = await createTestProduct({ purchasePrice: 18.75, salePrice: 50 });
});

describe('migration 002-add-layaway-details-purchase-price', () => {
  it('fills the cost of existing layaway lines with the current product cost', async () => {
    const layawayId = await insertLayaway(user.userId);
    await db.query(
      `INSERT INTO layaway_details (layaway_id, product_id, variant_id, quantity, unit_price)
       VALUES (?, ?, NULL, 1, 50)`,
      [layawayId, product.productId]
    );

    await migrate();

    const [[detail]] = await db.query('SELECT purchase_price FROM layaway_details WHERE layaway_id = ?', [layawayId]);
    expect(detail.purchase_price).toBe(18.75);
  });

  it('rejects a new layaway line saved without a cost', async () => {
    const layawayId = await insertLayaway(user.userId);

    await expect(db.query(
      `INSERT INTO layaway_details (layaway_id, product_id, variant_id, quantity, unit_price)
       VALUES (?, ?, NULL, 1, 50)`,
      [layawayId, product.productId]
    )).rejects.toMatchObject({ code: 'ER_NO_DEFAULT_FOR_FIELD' });
  });
});
