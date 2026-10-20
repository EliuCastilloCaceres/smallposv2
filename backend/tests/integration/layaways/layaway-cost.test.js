// tests/integration/layaways/layaway-cost.test.js
// El apartado congela el costo al crearse y la venta que genera al liquidarse
// usa ese costo (spec 03, T4).
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }        = require('../../helpers/auth');
const { createTestUser } = require('../../helpers/users');
const { openTestRegister, createTestProduct, paymentMethodId } = require('../../helpers/sales');

let token;
let cashId;

// Apartado sin anticipo para el cliente "Público en general" de los seeds
const createLayaway = (items) =>
  request(app)
    .post('/api/layaways')
    .set('Authorization', `Bearer ${token}`)
    .send({ customerId: 1, items });

// Abono en efectivo en la Caja 1
const pay = (layawayId, amount) =>
  request(app)
    .post(`/api/layaways/${layawayId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      cashRegisterId: 1,
      payments: [{ payment_method_id: cashId, amount, cash_received: amount, cash_change: 0 }],
    });

const detailCosts = async (layawayId) => {
  const [rows] = await db.query(
    `SELECT product_id, variant_id, purchase_price FROM layaway_details
     WHERE layaway_id = ? ORDER BY layaway_detail_id`,
    [layawayId]
  );
  return rows;
};

beforeAll(async () => {
  const cashier = await createTestUser({ role: 'cajero', branchId: 1 });
  token  = await loginAs(cashier);
  cashId = await paymentMethodId('cash');
  await openTestRegister({ userId: cashier.userId });
});

describe('layaway line cost', () => {
  it('stores the catalog cost of each line when the layaway is created', async () => {
    const jacket = await createTestProduct({ purchasePrice: 40, salePrice: 100 });
    const boots  = await createTestProduct({ purchasePrice: 30, salePrice: 80, variants: ['26', '27'] });

    const res = await createLayaway([
      { product_id: jacket.productId, quantity: 1, unit_price: 100, purchase_price: 1 },
      { product_id: boots.productId, variant_id: boots.variantIds[0], quantity: 1, unit_price: 80 },
    ]);

    expect(res.status).toBe(201);
    expect(await detailCosts(res.body.data.layawayId)).toEqual([
      { product_id: jacket.productId, variant_id: null,               purchase_price: 40 },
      { product_id: boots.productId,  variant_id: boots.variantIds[0], purchase_price: 30 },
    ]);
  });

  it('uses the stored cost, not the current one, when the layaway is paid off', async () => {
    const jacket  = await createTestProduct({ purchasePrice: 40, salePrice: 100 });
    const created = await createLayaway([{ product_id: jacket.productId, quantity: 2, unit_price: 100 }]);
    const { layawayId } = created.body.data;

    // El costo del catálogo cambia antes de liquidar
    await db.query('UPDATE products SET purchase_price = 55 WHERE product_id = ?', [jacket.productId]);
    expect((await pay(layawayId, 50)).body.data.status).toBe('active');
    const res = await pay(layawayId, 150);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
    const [lines] = await db.query(
      'SELECT product_id, quantity, purchase_price FROM order_details WHERE order_id = ?',
      [res.body.data.orderId]
    );
    expect(lines).toEqual([{ product_id: jacket.productId, quantity: 2, purchase_price: 40 }]);
  });
});
