// tests/integration/orders/create-order-cost.test.js
// El costo de cada línea de venta sale del catálogo, no del cliente
// (spec 03, T3).
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }        = require('../../helpers/auth');
const { createTestUser } = require('../../helpers/users');
const { openTestRegister, createTestProduct, paymentMethodId } = require('../../helpers/sales');

let token;
let cashId;

// Venta de contado en la Caja 1 al cliente "Público en general" de los seeds
const sell = (items) => {
  const total = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  return request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      cashRegisterId: 1, customerId: 1,
      subtotal: total, discount: 0, total,
      payments: [{ payment_method_id: cashId, amount: total, cash_received: total, cash_change: 0 }],
      items,
    });
};

const linesOf = async (orderId) => {
  const [rows] = await db.query(
    `SELECT product_id, variant_id, purchase_price FROM order_details
     WHERE order_id = ? ORDER BY order_detail_id`,
    [orderId]
  );
  return rows;
};

const countOrders = async () => (await db.query('SELECT COUNT(*) AS n FROM orders'))[0][0].n;

beforeAll(async () => {
  const cashier = await createTestUser({ role: 'cajero', branchId: 1 });
  token  = await loginAs(cashier);
  cashId = await paymentMethodId('cash');
  await openTestRegister({ userId: cashier.userId });
});

describe('POST /api/orders line cost', () => {
  it('stores the catalog cost and ignores the cost sent by the client', async () => {
    const shirt = await createTestProduct({ purchasePrice: 12.5, salePrice: 30 });
    const cap   = await createTestProduct({ purchasePrice: 8, salePrice: 20 });

    const res = await sell([
      { product_id: shirt.productId, quantity: 2, unit_price: 30, purchase_price: 999 },
      { product_id: cap.productId,   quantity: 1, unit_price: 20, purchase_price: 0 },
    ]);

    expect(res.status).toBe(201);
    expect(await linesOf(res.body.data.orderId)).toEqual([
      { product_id: shirt.productId, variant_id: null, purchase_price: 12.5 },
      { product_id: cap.productId,   variant_id: null, purchase_price: 8 },
    ]);
  });

  it('stores the cost of the base product for a variant', async () => {
    const shoe = await createTestProduct({ purchasePrice: 30, salePrice: 70, variants: ['25', '26'] });

    const res = await sell([
      { product_id: shoe.productId, variant_id: shoe.variantIds[1], quantity: 1, unit_price: 70, purchase_price: 1 },
    ]);

    expect(res.status).toBe(201);
    expect(await linesOf(res.body.data.orderId)).toEqual([
      { product_id: shoe.productId, variant_id: shoe.variantIds[1], purchase_price: 30 },
    ]);
  });

  it('works when the client does not send a cost, as the POS does now', async () => {
    const mug = await createTestProduct({ purchasePrice: 15, salePrice: 40 });

    const res = await sell([{ product_id: mug.productId, quantity: 1, unit_price: 40 }]);

    expect(res.status).toBe(201);
    expect(await linesOf(res.body.data.orderId)).toEqual([
      { product_id: mug.productId, variant_id: null, purchase_price: 15 },
    ]);
  });

  it('responds 400 and creates nothing when a product does not exist', async () => {
    const pen    = await createTestProduct({ purchasePrice: 2, salePrice: 5, stock: 10 });
    const before = await countOrders();

    const res = await sell([
      { product_id: pen.productId, quantity: 1, unit_price: 5 },
      { product_id: 999999,        quantity: 1, unit_price: 5 },
    ]);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Producto no encontrado (ID 999999)');
    expect(await countOrders()).toBe(before);
    const [[stock]] = await db.query('SELECT quantity FROM inventory_stock WHERE product_id = ?', [pen.productId]);
    expect(stock.quantity).toBe(10);
  });

  it('sells a product whose catalog cost is 0 and stores the line with cost 0', async () => {
    const gift = await createTestProduct({ purchasePrice: 0, salePrice: 10 });

    const res = await sell([{ product_id: gift.productId, quantity: 1, unit_price: 10, purchase_price: 5 }]);

    expect(res.status).toBe(201);
    expect(await linesOf(res.body.data.orderId)).toEqual([
      { product_id: gift.productId, variant_id: null, purchase_price: 0 },
    ]);
  });
});
