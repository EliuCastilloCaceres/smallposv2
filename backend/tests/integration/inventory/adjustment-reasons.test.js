// tests/integration/inventory/adjustment-reasons.test.js
// Los ajustes de inventario ya no aceptan el motivo "Compra a proveedor": las
// compras se registran en el módulo Compras (spec 14, T4).
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }           = require('../../helpers/auth');
const { createTestUser }    = require('../../helpers/users');
const { createTestProduct } = require('../../helpers/sales');

let token;
let product;

const adjust = (body) =>
  request(app).post('/api/inventory/adjustments?branch_id=1')
    .set('Authorization', `Bearer ${token}`)
    .send({ branch_id: 1, product_id: product.productId, quantity: 5, ...body });

const lastMovement = async () => {
  const [[row]] = await db.query(
    'SELECT operation_type, quantity, reason FROM inventory_movements WHERE product_id = ? ORDER BY movement_id DESC LIMIT 1',
    [product.productId]
  );
  return row;
};

beforeAll(async () => {
  const user = await createTestUser({ role: 'supervisor' });
  token   = await loginAs(user);
  product = await createTestProduct({ stock: 10 });
});

describe('POST /api/inventory/adjustments', () => {
  it('responds 400 to "Compra a proveedor", with any capitalization, and does not move the stock', async () => {
    for (const reason of ['Compra a proveedor', '  compra a PROVEEDOR ']) {
      const res = await adjust({ operation_type: 'entry', reason });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Las compras se registran en el módulo Compras.');
    }
    expect(await lastMovement()).toBeUndefined();
  });

  it('saves any other entry as an entry', async () => {
    const res = await adjust({ operation_type: 'entry', reason: 'Conteo físico' });

    expect(res.status).toBe(201);
    expect(await lastMovement()).toEqual({ operation_type: 'entry', quantity: 5, reason: 'Conteo físico' });
  });

  it('still saves "Devolución de cliente" as a return', async () => {
    const res = await adjust({ operation_type: 'exit', reason: 'Devolución de cliente' });

    expect(res.status).toBe(201);
    expect(await lastMovement()).toMatchObject({ operation_type: 'return', quantity: -5 });
  });
});

describe('POST /api/inventory/adjustments/bulk', () => {
  it('responds 400 to "Compra a proveedor" and adjusts nothing', async () => {
    const [[before]] = await db.query('SELECT quantity FROM inventory_stock WHERE product_id = ?', [product.productId]);

    const res = await request(app).post('/api/inventory/adjustments/bulk?branch_id=1')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Compra a proveedor', items: [{ product_id: product.productId, quantity_new: 50 }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Las compras se registran en el módulo Compras.');
    const [[after]] = await db.query('SELECT quantity FROM inventory_stock WHERE product_id = ?', [product.productId]);
    expect(after.quantity).toBe(before.quantity);
  });
});
