// tests/integration/purchases/cancel-purchase.test.js
// Cancelación de compras (spec 14, T6): motivo, reversión del inventario todo
// o nada, el costo no cambia, reingreso con la sesión abierta y sin
// reingreso con la sesión cerrada, alcance por sucursal y permisos.
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }          = require('../../helpers/auth');
const { createTestUser }   = require('../../helpers/users');
const { openTestRegister, createTestProduct, paymentMethodId } = require('../../helpers/sales');

let tokens = {};
let ids = {};
let branch2;

const as = (token) => ({
  post: (url, body) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
  get:  (url)       => request(app).get(url).set('Authorization', `Bearer ${token}`),
});

const registerPurchase = async (items, overrides = {}, token = tokens.supervisor) => {
  const res = await as(token).post('/api/purchases', {
    provider_id: ids.pepsi, payment_method_id: ids.transfer, items, ...overrides,
  });
  if (res.status !== 201) throw new Error(`registerPurchase: ${res.status} ${res.body.message}`);
  return res.body.data;
};

const cancel = (purchaseId, reason = 'Se capturó mal', token = tokens.supervisor) =>
  as(token).post(`/api/purchases/${purchaseId}/cancel`, { reason });

const stockOf = async (productId, variantId = null, branchId = 1) => {
  const [[row]] = await db.query(
    'SELECT quantity FROM inventory_stock WHERE branch_id = ? AND product_id = ? AND variant_id <=> ?',
    [branchId, productId, variantId]
  );
  return row ? row.quantity : 0;
};

const productCost = async (productId) => {
  const [[row]] = await db.query('SELECT purchase_price FROM products WHERE product_id = ?', [productId]);
  return row.purchase_price;
};

const expectedCash = async (sessionId) => {
  const res = await as(tokens.supervisor).get(`/api/reports/cash-sessions/${sessionId}`);
  return res.body.data.expected;
};

beforeAll(async () => {
  const [branch] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Norte', 1)");
  branch2 = branch.insertId;

  const supervisor  = await createTestUser({ role: 'supervisor' });
  const almacenista = await createTestUser({ role: 'almacenista' });
  const admin       = await createTestUser({ role: 'admin', branchId: null });
  [tokens.supervisor, tokens.almacenista, tokens.admin] = await Promise.all(
    [supervisor, almacenista, admin].map(loginAs)
  );
  ids.supervisor = supervisor.userId;

  ids.cash     = await paymentMethodId('cash');
  ids.transfer = await paymentMethodId('transfer');
  const [pepsi] = await db.query("INSERT INTO providers (name, is_active) VALUES ('Pepsi', 1)");
  ids.pepsi = pepsi.insertId;
});

describe('cancel a purchase', () => {
  it('requires a reason of up to 255 characters', async () => {
    const product  = await createTestProduct();
    const purchase = await registerPurchase([{ product_id: product.productId, quantity: 1, unit_cost: 10 }]);

    const empty = await cancel(purchase.purchase_id, '  ');
    const long  = await cancel(purchase.purchase_id, 'x'.repeat(256));

    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe('El motivo de la cancelación es requerido');
    expect(long.status).toBe(400);
  });

  it('reverts the stock of every line, keeps the product cost and saves who, when and why', async () => {
    const soda  = await createTestProduct({ purchasePrice: 8, stock: 10 });
    const shirt = await createTestProduct({ purchasePrice: 50, stock: 0, variants: ['CH'] });
    const [ch]  = shirt.variantIds;
    const purchase = await registerPurchase([
      { product_id: soda.productId,  quantity: 20, unit_cost: 9.5 },
      { product_id: shirt.productId, variant_id: ch, quantity: 4, unit_cost: 60 },
    ]);
    expect(await productCost(soda.productId)).toBe(9);

    const res = await cancel(purchase.purchase_id, ' Factura duplicada ');

    expect(res.status).toBe(200);
    expect(res.body.data.refund).toBeNull();
    expect(res.body.data.purchase).toMatchObject({
      status: 'cancelled', cancel_reason: 'Factura duplicada', cancelled_by_name: 'Test supervisor',
      refund_registered: false,
    });
    expect(res.body.data.purchase.cancelled_at).not.toBeNull();
    expect(await stockOf(soda.productId)).toBe(10);
    expect(await stockOf(shirt.productId, ch)).toBe(0);
    // El costo promedio no se recalcula al cancelar
    expect(await productCost(soda.productId)).toBe(9);
    expect(await productCost(shirt.productId)).toBe(60);

    const [movements] = await db.query(
      `SELECT product_id, operation_type, quantity, reason FROM inventory_movements
        WHERE reference_type = 'purchase' AND reference_id = ? AND operation_type = 'purchase_cancelled'
        ORDER BY movement_id`,
      [purchase.purchase_id]
    );
    expect(movements).toEqual([
      { product_id: soda.productId,  operation_type: 'purchase_cancelled', quantity: -20, reason: `Cancelación de la compra #${purchase.purchase_id}` },
      { product_id: shirt.productId, operation_type: 'purchase_cancelled', quantity: -4,  reason: `Cancelación de la compra #${purchase.purchase_id}` },
    ]);
  });

  it('cancels nothing with 409 when a line no longer has enough stock', async () => {
    const soda  = await createTestProduct({ stock: 0 });
    const chips = await createTestProduct({ stock: 0, variants: ['Chica'] });
    const purchase = await registerPurchase([
      { product_id: soda.productId,  quantity: 10, unit_cost: 9 },
      { product_id: chips.productId, variant_id: chips.variantIds[0], quantity: 5, unit_cost: 4 },
    ]);
    // Se vendieron 2 bolsas de la compra
    await db.query('UPDATE inventory_stock SET quantity = 3 WHERE product_id = ?', [chips.productId]);

    const res = await cancel(purchase.purchase_id);

    expect(res.status).toBe(409);
    const [[chipsProduct]] = await db.query('SELECT name FROM products WHERE product_id = ?', [chips.productId]);
    expect(res.body.message).toBe(`No hay stock suficiente de «${chipsProduct.name} (Chica)» para revertir la compra.`);
    expect(await stockOf(soda.productId)).toBe(10);
    const [[row]] = await db.query('SELECT status FROM purchases WHERE purchase_id = ?', [purchase.purchase_id]);
    expect(row.status).toBe('active');
  });

  it('responds 400 when the purchase is already cancelled', async () => {
    const product  = await createTestProduct();
    const purchase = await registerPurchase([{ product_id: product.productId, quantity: 1, unit_cost: 10 }]);
    await cancel(purchase.purchase_id);

    const res = await cancel(purchase.purchase_id);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('La compra ya está cancelada');
  });
});

describe('cancel a purchase paid from the register', () => {
  let sessionId;

  beforeAll(async () => {
    ({ sessionId } = await openTestRegister({ userId: ids.supervisor, openAmount: 500 }));
  });

  const fromRegister = (items) =>
    registerPurchase(items, { payment_method_id: ids.cash, paid_from_register: true, cash_register_id: 1 });

  it('registers the refund in the session while it is open', async () => {
    const product  = await createTestProduct();
    const purchase = await fromRegister([{ product_id: product.productId, quantity: 4, unit_cost: 30 }]);
    expect(await expectedCash(sessionId)).toBe(380);

    const res = await cancel(purchase.purchase_id);

    expect(res.body.data.refund).toBe('registered');
    expect(res.body.data.purchase.refund_registered).toBe(true);
    const [[refund]] = await db.query(
      `SELECT p.refund_cash_movement_id, cm.movement_type, cm.amount, cm.description, cm.session_id
         FROM purchases p JOIN cash_movements cm ON cm.cash_movement_id = p.refund_cash_movement_id
        WHERE p.purchase_id = ?`,
      [purchase.purchase_id]
    );
    expect(refund).toMatchObject({
      movement_type: 'purchase_refund', amount: 120, session_id: sessionId,
      description: `Reingreso de la compra #${purchase.purchase_id}`,
    });
    expect(await expectedCash(sessionId)).toBe(500);
  });

  it('cancels without refund once the session is closed', async () => {
    const product  = await createTestProduct();
    const purchase = await fromRegister([{ product_id: product.productId, quantity: 1, unit_cost: 50 }]);
    await db.query('UPDATE cash_register_sessions SET closed_at = NOW() WHERE session_id = ?', [sessionId]);

    const res = await cancel(purchase.purchase_id);

    expect(res.status).toBe(200);
    expect(res.body.data.refund).toBe('session_closed');
    expect(res.body.data.purchase).toMatchObject({ status: 'cancelled', refund_registered: false });
    const [[{ n }]] = await db.query(
      "SELECT COUNT(*) AS n FROM cash_movements WHERE movement_type = 'purchase_refund' AND description = ?",
      [`Reingreso de la compra #${purchase.purchase_id}`]
    );
    expect(n).toBe(0);
  });
});

describe('cancel scope and permissions', () => {
  it('responds 404 to a purchase of another branch, and lets the central admin cancel it', async () => {
    const product = await createTestProduct({ stock: 0 });
    const purchase = await registerPurchase(
      [{ product_id: product.productId, quantity: 2, unit_cost: 10 }], { branch_id: branch2 }, tokens.admin
    );

    const other = await cancel(purchase.purchase_id);
    const admin = await cancel(purchase.purchase_id, 'Error', tokens.admin);

    expect(other.status).toBe(404);
    expect(admin.status).toBe(200);
    expect(await stockOf(product.productId, null, branch2)).toBe(0);
  });

  it('responds 403 to a user without purchases.cancel, like the warehouse keeper', async () => {
    const product  = await createTestProduct();
    const purchase = await registerPurchase(
      [{ product_id: product.productId, quantity: 1, unit_cost: 10 }], {}, tokens.almacenista
    );

    const res = await cancel(purchase.purchase_id, 'Error', tokens.almacenista);

    expect(res.status).toBe(403);
  });
});
