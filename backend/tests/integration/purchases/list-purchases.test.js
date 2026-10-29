// tests/integration/purchases/list-purchases.test.js
// Lectura de compras (spec 14, T6): la lista con cada filtro, paginación y el
// total de las activas; el detalle con sus líneas; el comprobante; la
// búsqueda de productos y las opciones de los formularios; alcance por
// sucursal y permisos.
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }          = require('../../helpers/auth');
const { createTestUser }   = require('../../helpers/users');
const { openTestRegister, createTestProduct, paymentMethodId } = require('../../helpers/sales');
const { PNG_BYTES }        = require('../../helpers/expenses');
const { todayInMexico }    = require('../../../src/utils/timezone');

let tokens = {};
let ids = {};
let branch2;
let products = {};
let purchases = {};

const get = (token, url, query = {}) =>
  request(app).get(url).query(query).set('Authorization', `Bearer ${token}`);

const registerPurchase = async (fields, { token = tokens.admin, receipt = null } = {}) => {
  let req = request(app).post('/api/purchases').set('Authorization', `Bearer ${token}`);
  if (receipt) {
    for (const [key, value] of Object.entries(fields)) {
      req = req.field(key, key === 'items' ? JSON.stringify(value) : String(value));
    }
    req = req.attach('receipt', receipt, 'factura.png');
  } else {
    req = req.send(fields);
  }
  const res = await req;
  if (res.status !== 201) throw new Error(`registerPurchase: ${res.status} ${res.body.message}`);
  return res.body.data;
};

const listIds = (res) => res.body.data.map(p => p.purchase_id);

beforeAll(async () => {
  const [branch] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Norte', 1)");
  branch2 = branch.insertId;
  const [register] = await db.query(
    "INSERT INTO cash_registers (branch_id, name, is_active) VALUES (?, 'Caja Norte', 1)", [branch2]
  );
  ids.register2 = register.insertId;

  const supervisor  = await createTestUser({ role: 'supervisor' });
  const cajero      = await createTestUser({ role: 'cajero' });
  const almacenista = await createTestUser({ role: 'almacenista' });
  const admin       = await createTestUser({ role: 'admin', branchId: null });
  await openTestRegister({ userId: supervisor.userId });
  await openTestRegister({ userId: admin.userId, cashRegisterId: ids.register2 });
  [tokens.supervisor, tokens.cajero, tokens.almacenista, tokens.admin] = await Promise.all(
    [supervisor, cajero, almacenista, admin].map(loginAs)
  );

  ids.cash     = await paymentMethodId('cash');
  ids.card     = await paymentMethodId('card');
  ids.transfer = await paymentMethodId('transfer');
  const [pepsi] = await db.query("INSERT INTO providers (name, is_active) VALUES ('Pepsi', 1)");
  ids.pepsi = pepsi.insertId;
  const [bimbo] = await db.query("INSERT INTO providers (name, is_active) VALUES ('Bimbo', 1)");
  ids.bimbo = bimbo.insertId;
  const [old] = await db.query("INSERT INTO providers (name, is_active) VALUES ('Antiguo', 0)");
  ids.inactiveProvider = old.insertId;

  products.soda  = await createTestProduct({ purchasePrice: 8, stock: 10 });
  products.bread = await createTestProduct({ purchasePrice: 20, stock: 5 });
  products.shirt = await createTestProduct({ purchasePrice: 50, stock: 2, variants: ['CH', 'M'] });
  await db.query("UPDATE products SET name = 'Refresco de cola 600 ml', sku = 'COLA-600' WHERE product_id = ?", [products.soda.productId]);
  await db.query("UPDATE products SET name = 'Pan blanco grande', sku = 'PAN-G', uom = 'pza' WHERE product_id = ?", [products.bread.productId]);
  await db.query("UPDATE products SET name = 'Playera básica', sku = 'PLY' WHERE product_id = ?", [products.shirt.productId]);
  await db.query("UPDATE product_variants SET sku = 'PLY-CH' WHERE variant_id = ?", [products.shirt.variantIds[0]]);

  // Sucursal 1, octubre: una de Pepsi con comprobante, una de Bimbo pagada
  // desde caja (hoy) y una de Pepsi cancelada. Sucursal Norte: una de Bimbo.
  purchases.pepsiOct = await registerPurchase({
    branch_id: 1, provider_id: ids.pepsi, payment_method_id: ids.transfer, purchase_date: '2026-10-05',
    folio: 'FAC-100', notes: 'Pedido semanal',
    items: [{ product_id: products.soda.productId, quantity: 24, unit_cost: 9 }],
  }, { receipt: PNG_BYTES });
  purchases.bimboToday = await registerPurchase({
    provider_id: ids.bimbo, payment_method_id: ids.cash, paid_from_register: true, cash_register_id: 1,
    items: [
      { product_id: products.bread.productId, quantity: 10, unit_cost: 22 },
      { product_id: products.shirt.productId, variant_id: products.shirt.variantIds[0], quantity: 2, unit_cost: 55 },
    ],
  }, { token: tokens.supervisor });
  purchases.cancelled = await registerPurchase({
    branch_id: 1, provider_id: ids.pepsi, payment_method_id: ids.card, purchase_date: '2026-10-06',
    folio: 'FAC-101', items: [{ product_id: products.soda.productId, quantity: 1, unit_cost: 9 }],
  });
  await request(app).post(`/api/purchases/${purchases.cancelled.purchase_id}/cancel`)
    .set('Authorization', `Bearer ${tokens.admin}`).send({ reason: 'Duplicada' });
  purchases.north = await registerPurchase({
    branch_id: branch2, provider_id: ids.bimbo, payment_method_id: ids.transfer, purchase_date: '2026-10-07',
    items: [{ product_id: products.bread.productId, quantity: 5, unit_cost: 21 }],
  });
});

describe('GET /api/purchases', () => {
  it('lists the active purchases of the branch, the most recent first, with the total of the active ones', async () => {
    const res = await get(tokens.supervisor, '/api/purchases');

    expect(res.status).toBe(200);
    expect(listIds(res)).toEqual([purchases.bimboToday.purchase_id, purchases.pepsiOct.purchase_id]);
    expect(res.body.summary).toEqual({ count: 2, total_amount: 216 + 330 });
    expect(res.body.data[0]).toMatchObject({
      purchase_date: todayInMexico(), provider_name: 'Bimbo', payment_method_name: expect.any(String),
      item_count: 2, total: 330, paid_from_register: true, has_receipt: false, status: 'active', branch_id: 1,
    });
    expect(res.body.data[1]).toMatchObject({ folio: 'FAC-100', item_count: 1, total: 216, has_receipt: true });
  });

  it('filters by status, and keeps the summary on the active ones', async () => {
    const cancelled = await get(tokens.supervisor, '/api/purchases', { status: 'cancelled' });
    const all       = await get(tokens.supervisor, '/api/purchases', { status: 'all' });

    expect(listIds(cancelled)).toEqual([purchases.cancelled.purchase_id]);
    expect(cancelled.body.summary.count).toBe(2);
    expect(listIds(all)).toHaveLength(3);
  });

  it('filters by period, provider and payment method', async () => {
    const october  = await get(tokens.supervisor, '/api/purchases', { start_date: '2026-10-01', end_date: '2026-10-05' });
    const bimbo    = await get(tokens.supervisor, '/api/purchases', { provider_id: ids.bimbo });
    const transfer = await get(tokens.supervisor, '/api/purchases', { payment_method_id: ids.transfer });

    expect(listIds(october)).toEqual([purchases.pepsiOct.purchase_id]);
    expect(listIds(bimbo)).toEqual([purchases.bimboToday.purchase_id]);
    expect(listIds(transfer)).toEqual([purchases.pepsiOct.purchase_id]);
  });

  it.each([
    ['the folio',             'FAC-100',  'pepsiOct'],
    ['the notes',             'semanal',  'pepsiOct'],
    ['a product name',        'pan blanco', 'bimboToday'],
    ['a product SKU',         'COLA-600', 'pepsiOct'],
    ['a variant SKU',         'PLY-CH',   'bimboToday'],
  ])('searches by %s', async (_, search, key) => {
    const res = await get(tokens.supervisor, '/api/purchases', { search });

    expect(listIds(res)).toEqual([purchases[key].purchase_id]);
  });

  it('paginates', async () => {
    const page1 = await get(tokens.supervisor, '/api/purchases', { limit: 1, page: 1 });
    const page2 = await get(tokens.supervisor, '/api/purchases', { limit: 1, page: 2 });

    expect(listIds(page1)).toEqual([purchases.bimboToday.purchase_id]);
    expect(listIds(page2)).toEqual([purchases.pepsiOct.purchase_id]);
    expect(page1.body.pagination).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
  });

  it('keeps a branch user on their branch, and lets the central admin see all or filter', async () => {
    const supervisor = await get(tokens.supervisor, '/api/purchases', { branch_id: branch2 });
    const all        = await get(tokens.admin, '/api/purchases');
    const north      = await get(tokens.admin, '/api/purchases', { branch_id: branch2 });

    expect(listIds(supervisor)).not.toContain(purchases.north.purchase_id);
    expect(listIds(all)).toHaveLength(3);
    expect(listIds(north)).toEqual([purchases.north.purchase_id]);
    expect(north.body.data[0].branch_name).toBe('Sucursal Norte');
  });

  it('responds 400 to an invalid status or date', async () => {
    expect((await get(tokens.supervisor, '/api/purchases', { status: 'otro' })).status).toBe(400);
    expect((await get(tokens.supervisor, '/api/purchases', { start_date: '2026-13-01' })).status).toBe(400);
  });
});

describe('GET /api/purchases/:id', () => {
  it('returns the purchase with its lines and the cost before and after', async () => {
    const res = await get(tokens.supervisor, `/api/purchases/${purchases.bimboToday.purchase_id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      provider_name: 'Bimbo', total: 330, paid_from_register: true, created_by_name: 'Test supervisor',
      cash_movement: { register_name: 'Caja 1', session_open: true },
    });
    expect(res.body.data.items).toEqual([
      expect.objectContaining({
        product_name: 'Pan blanco grande', sku: 'PAN-G', uom: 'pza', variant_id: null, variant_label: null,
        quantity: 10, unit_cost: 22, subtotal: 220, cost_before: 20, cost_after: 21.33,
      }),
      expect.objectContaining({
        product_name: 'Playera básica', variant_label: 'CH', variant_sku: 'PLY-CH',
        quantity: 2, unit_cost: 55, subtotal: 110, cost_before: 50, cost_after: 51.67,
      }),
    ]);
  });

  it('shows who cancelled a purchase, when and why', async () => {
    const res = await get(tokens.supervisor, `/api/purchases/${purchases.cancelled.purchase_id}`);

    expect(res.body.data).toMatchObject({ status: 'cancelled', cancel_reason: 'Duplicada', cancelled_by_name: 'Test admin' });
  });

  it('responds 404 to a purchase of another branch', async () => {
    const res = await get(tokens.supervisor, `/api/purchases/${purchases.north.purchase_id}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/purchases/:id/receipt', () => {
  it('downloads the receipt', async () => {
    const res = await get(tokens.supervisor, `/api/purchases/${purchases.pepsiOct.purchase_id}/receipt`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.headers['content-disposition']).toMatch(/factura\.png/);
  });

  it('responds 404 to a purchase without receipt or of another branch', async () => {
    expect((await get(tokens.supervisor, `/api/purchases/${purchases.bimboToday.purchase_id}/receipt`)).status).toBe(404);
    expect((await get(tokens.supervisor, `/api/purchases/${purchases.north.purchase_id}/receipt`)).status).toBe(404);
  });
});

describe('GET /api/purchases/products', () => {
  it('finds active products by name, with their cost and their stock in the branch', async () => {
    const res = await get(tokens.supervisor, '/api/purchases/products', { search: 'pan blanco' });

    // Costo después de las compras de Bimbo: (5 × 20 + 220) / 15 = 21.33 y
    // (15 × 21.33 + 105) / 20 = 21.25. Stock de la sucursal 1: 5 + 10.
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{
      product_id: products.bread.productId, name: 'Pan blanco grande', sku: 'PAN-G', uom: 'pza',
      purchase_price: 21.25, is_variable: false, stock: 15, variants: [],
    }]);
  });

  it('finds a product by the SKU of a variant, with its active variants', async () => {
    const res = await get(tokens.supervisor, '/api/purchases/products', { search: 'PLY-CH' });

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ product_id: products.shirt.productId, is_variable: true, stock: null });
    expect(res.body.data[0].variants).toEqual([
      { variant_id: products.shirt.variantIds[0], label: 'CH', sku: 'PLY-CH', stock: 4 },
      { variant_id: products.shirt.variantIds[1], label: 'M',  sku: null,     stock: 2 },
    ]);
  });

  it('puts the exact SKU first and leaves out inactive products', async () => {
    const similar = await createTestProduct();
    await db.query("UPDATE products SET name = 'AAA cola light', sku = 'COLA-600-L' WHERE product_id = ?", [similar.productId]);
    const inactive = await createTestProduct();
    await db.query("UPDATE products SET name = 'Cola vieja', sku = 'COLA-600-X', is_active = 0 WHERE product_id = ?", [inactive.productId]);

    const res = await get(tokens.supervisor, '/api/purchases/products', { search: 'COLA-600' });

    expect(res.body.data.map(p => p.sku)).toEqual(['COLA-600', 'COLA-600-L']);
  });

  it('returns nothing without a search', async () => {
    const res = await get(tokens.supervisor, '/api/purchases/products', { search: ' ' });

    expect(res.body.data).toEqual([]);
  });

  it('is available to a cashier, who can register purchases', async () => {
    const res = await get(tokens.cajero, '/api/purchases/products', { search: 'pan' });

    expect(res.status).toBe(200);
  });
});

describe('GET /api/purchases/options', () => {
  it('gives a cashier the methods without Crédito, the active providers and the open registers of their branch', async () => {
    const res = await get(tokens.cajero, '/api/purchases/options');

    expect(res.status).toBe(200);
    const { payment_methods, providers, registers, branches } = res.body.data;
    expect(payment_methods.map(m => m.code).sort()).toEqual(['card', 'cash', 'transfer']);
    expect(providers.map(p => p.name)).toEqual(expect.arrayContaining(['Bimbo', 'Pepsi']));
    expect(providers.map(p => p.name)).not.toContain('Antiguo');
    expect(registers.map(r => r.cash_register_id)).toEqual([1]);
    expect(branches).toBeUndefined();
  });

  it('gives the central admin the active branches and the open registers of all of them', async () => {
    const res = await get(tokens.admin, '/api/purchases/options');

    expect(res.body.data.branches.map(b => b.branch_id)).toEqual(expect.arrayContaining([1, branch2]));
    expect(res.body.data.registers.map(r => r.cash_register_id).sort()).toEqual([1, ids.register2].sort());
  });
});

describe('permissions', () => {
  it('lets a warehouse keeper read purchases', async () => {
    expect((await get(tokens.almacenista, '/api/purchases')).status).toBe(200);
  });

  it('responds 403 to a cashier on the list, the detail and the receipt', async () => {
    const id = purchases.pepsiOct.purchase_id;

    expect((await get(tokens.cajero, '/api/purchases')).status).toBe(403);
    expect((await get(tokens.cajero, `/api/purchases/${id}`)).status).toBe(403);
    expect((await get(tokens.cajero, `/api/purchases/${id}/receipt`)).status).toBe(403);
  });
});
