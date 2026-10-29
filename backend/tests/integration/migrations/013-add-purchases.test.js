// tests/integration/migrations/013-add-purchases.test.js
// Tablas de compras y de sus líneas (spec 14, T1). La base de cada archivo de
// integración ya viene migrada.
const db = require('../../../src/config/db');
const { createTestUser } = require('../../helpers/users');
const { createTestProduct, paymentMethodId } = require('../../helpers/sales');

let user;
let cash;
let simple;
let variable;

const insertPurchase = (overrides = {}) => {
  const row = {
    branch_id: 1, purchase_date: '2026-10-01', provider_id: 1, payment_method_id: cash,
    total: 190, created_by: user.userId, ...overrides,
  };
  return db.query('INSERT INTO purchases SET ?', [row]);
};

const insertItem = (purchaseId, overrides = {}) => {
  const row = {
    purchase_id: purchaseId, product_id: simple.productId, variant_id: null,
    quantity: 20, unit_cost: 9.5, subtotal: 190, cost_before: 8, cost_after: 9, ...overrides,
  };
  return db.query('INSERT INTO purchase_items SET ?', [row]);
};

beforeAll(async () => {
  user     = await createTestUser({ role: 'almacenista' });
  cash     = await paymentMethodId('cash');
  simple   = await createTestProduct({ purchasePrice: 8 });
  variable = await createTestProduct({ purchasePrice: 50, variants: ['CH', 'M'] });
});

describe('migration 013-add-purchases', () => {
  it('creates the purchases table, with new purchases active and without cash movement or receipt', async () => {
    const [result] = await insertPurchase();
    const [[purchase]] = await db.query(
      `SELECT DATE_FORMAT(purchase_date, '%Y-%m-%d') AS purchase_date, total, status, folio, notes,
              receipt_file, cash_movement_id, refund_cash_movement_id, cancelled_at
         FROM purchases WHERE purchase_id = ?`,
      [result.insertId]
    );

    expect(purchase).toEqual({
      purchase_date: '2026-10-01', total: 190, status: 'active', folio: null, notes: null,
      receipt_file: null, cash_movement_id: null, refund_cash_movement_id: null, cancelled_at: null,
    });
  });

  it('rejects a purchase with a provider that does not exist', async () => {
    await expect(insertPurchase({ provider_id: 999999 }))
      .rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  });

  it('creates the purchase_items table with the cost before and after', async () => {
    const [purchase] = await insertPurchase();
    const [result] = await insertItem(purchase.insertId);
    const [[item]] = await db.query(
      'SELECT quantity, unit_cost, subtotal, cost_before, cost_after, variant_key FROM purchase_items WHERE purchase_item_id = ?',
      [result.insertId]
    );

    expect(item).toEqual({ quantity: 20, unit_cost: 9.5, subtotal: 190, cost_before: 8, cost_after: 9, variant_key: 0 });
  });

  it('rejects the same product twice in a purchase, but allows two variants of the same product', async () => {
    const [purchase] = await insertPurchase();
    await insertItem(purchase.insertId);
    await expect(insertItem(purchase.insertId)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });

    const [ch, m] = variable.variantIds;
    await insertItem(purchase.insertId, { product_id: variable.productId, variant_id: ch });
    await insertItem(purchase.insertId, { product_id: variable.productId, variant_id: m });
    await expect(insertItem(purchase.insertId, { product_id: variable.productId, variant_id: ch }))
      .rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });

  it('rejects a line of a purchase that does not exist', async () => {
    await expect(insertItem(999999)).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  });
});
