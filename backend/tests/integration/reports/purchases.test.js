// tests/integration/reports/purchases.test.js
// Reporte de compras (spec 16, T2 y T7).
// - Resumen con la compra promedio y los proveedores; desglose por proveedor,
//   producto (variantes sumadas) y sucursal, con el % del total, el orden y
//   la paginación; canceladas y fecha de la compra; alcance por sucursal;
//   fecha de la primera compra.
// - Los gastos no cuentan, e include_expenses se ignora (requisito 24).
// - Respuestas 400 y 403.
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }         = require('../../helpers/auth');
const { createTestUser }  = require('../../helpers/users');
const { createTestProduct, paymentMethodId } = require('../../helpers/sales');
const { expenseCategoryId, insertExpense }   = require('../../helpers/expenses');

const OCTOBER = { start_date: '2026-10-01', end_date: '2026-10-31' };

let tokens = {};
let ids = {};
let products = {};
let branch2;

const report = (token, query) =>
  request(app).get('/api/reports/purchases').query(query).set('Authorization', `Bearer ${token}`);

const names = (res) => res.body.data.map(r => r.name);

// Guarda una compra directo en la BD, con sus líneas ({ productId,
// variantId, quantity, unitCost }); su total es la suma de las líneas
const insertPurchase = async ({ branchId = 1, purchaseDate, providerId, lines, status = 'active' }) => {
  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
  const [purchase] = await db.query(
    `INSERT INTO purchases (branch_id, purchase_date, provider_id, payment_method_id, total, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [branchId, purchaseDate, providerId, ids.transfer, total, status, ids.userId]
  );
  for (const l of lines) {
    await db.query(
      `INSERT INTO purchase_items
         (purchase_id, product_id, variant_id, quantity, unit_cost, subtotal, cost_before, cost_after)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [purchase.insertId, l.productId, l.variantId ?? null, l.quantity, l.unitCost, l.quantity * l.unitCost, l.unitCost, l.unitCost]
    );
  }
  return purchase.insertId;
};

beforeAll(async () => {
  const [branch] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Norte', 1)");
  branch2 = branch.insertId;

  // Rol con solo el reporte de compras
  await db.query("INSERT INTO roles (name, description) VALUES ('comprador', 'Solo compras')");
  await db.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT r.role_id, p.permission_id FROM roles r
       JOIN permissions p ON p.module = 'reports' AND p.action = 'purchases'
      WHERE r.name = 'comprador'`
  );

  const supervisor = await createTestUser({ role: 'supervisor' });
  const admin      = await createTestUser({ role: 'admin', branchId: null });
  const cajero     = await createTestUser({ role: 'cajero' });
  const buyer      = await createTestUser({ role: 'comprador' });
  [tokens.supervisor, tokens.admin, tokens.cajero, tokens.buyer] = await Promise.all(
    [supervisor, admin, cajero, buyer].map(loginAs)
  );
  ids.userId = supervisor.userId;

  ids.transfer  = await paymentMethodId('transfer');
  ids.servicios = await expenseCategoryId('Servicios');
  ids.renta     = await expenseCategoryId('Renta');
  ids.mercancia = await expenseCategoryId('Pago a proveedor (mercancía)');

  const provider = async (name, isActive = 1) =>
    (await db.query('INSERT INTO providers (name, is_active) VALUES (?, ?)', [name, isActive]))[0].insertId;
  ids.pepsi   = await provider('Pepsi');
  ids.bimbo   = await provider('Bimbo');
  ids.antiguo = await provider('Antiguo', 0);
  ids.cfe     = await provider('CFE');

  products.soda  = await createTestProduct();
  products.shirt = await createTestProduct({ variants: ['CH', 'M'] });
  products.old   = await createTestProduct();
  await db.query("UPDATE products SET name = 'Refresco 600 ml', sku = 'REF-600', uom = 'pza' WHERE product_id = ?", [products.soda.productId]);
  await db.query("UPDATE products SET name = 'Playera básica', sku = 'PLY', uom = 'pza' WHERE product_id = ?", [products.shirt.productId]);
  await db.query("UPDATE products SET name = 'Azúcar a granel', sku = 'AZU', uom = 'kg', is_active = 0 WHERE product_id = ?", [products.old.productId]);

  const soda = products.soda.productId;
  // Sucursal Central, octubre: 300 + 240 (Pepsi) + 200 (Bimbo) + 60 (Antiguo) = 800
  await insertPurchase({ purchaseDate: '2026-10-03', providerId: ids.pepsi, lines: [{ productId: soda, quantity: 30, unitCost: 10 }] });
  await insertPurchase({ purchaseDate: '2026-10-10', providerId: ids.pepsi, lines: [{ productId: soda, quantity: 20, unitCost: 12 }] });
  await insertPurchase({ purchaseDate: '2026-10-05', providerId: ids.bimbo, lines: [
    { productId: products.shirt.productId, variantId: products.shirt.variantIds[0], quantity: 3, unitCost: 40 },
    { productId: products.shirt.productId, variantId: products.shirt.variantIds[1], quantity: 1, unitCost: 80 },
  ] });
  await insertPurchase({ purchaseDate: '2026-10-08', providerId: ids.antiguo, lines: [{ productId: products.old.productId, quantity: 1.5, unitCost: 40 }] });
  // Cancelada: no cuenta
  await insertPurchase({ purchaseDate: '2026-10-12', providerId: ids.bimbo, status: 'cancelled', lines: [{ productId: soda, quantity: 1, unitCost: 999 }] });
  // Fuera del periodo
  await insertPurchase({ purchaseDate: '2026-09-30', providerId: ids.pepsi, lines: [{ productId: soda, quantity: 50, unitCost: 10 }] });
  await insertPurchase({ purchaseDate: '2026-11-01', providerId: ids.pepsi, lines: [{ productId: soda, quantity: 50, unitCost: 10 }] });
  // Cancelada y más antigua: no es la primera compra registrada
  await insertPurchase({ purchaseDate: '2026-08-01', providerId: ids.pepsi, status: 'cancelled', lines: [{ productId: soda, quantity: 1, unitCost: 10 }] });
  // Sucursal Norte, octubre
  await insertPurchase({ branchId: branch2, purchaseDate: '2026-10-15', providerId: ids.bimbo, lines: [{ productId: soda, quantity: 10, unitCost: 20 }] });

  // Gastos de octubre, con proveedor y sin él: ninguno cuenta en el reporte
  const base = { userId: supervisor.userId, paymentMethodId: ids.transfer };
  await insertExpense({ ...base, expenseDate: '2026-10-04', categoryId: ids.servicios, amount: 100, providerId: ids.cfe });
  await insertExpense({ ...base, expenseDate: '2026-10-06', categoryId: ids.servicios, amount: 60, providerId: ids.pepsi });
  await insertExpense({ ...base, expenseDate: '2026-10-07', categoryId: ids.renta, amount: 5000 });
  await insertExpense({ ...base, expenseDate: '2026-10-09', categoryId: ids.mercancia, amount: 1200, providerId: ids.bimbo });
  await insertExpense({ ...base, branchId: branch2, expenseDate: '2026-10-20', categoryId: ids.servicios, amount: 50, providerId: ids.cfe });
});

describe('GET /api/reports/purchases', () => {
  it('summarizes the active purchases of the period, with the average and the providers', async () => {
    const res = await report(tokens.supervisor, OCTOBER);

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ total: 800, count: 4, average: 200, providers: 3 });
  });

  it('groups by provider by default, with the share, the average, the last purchase and the inactive mark', async () => {
    const res = await report(tokens.supervisor, OCTOBER);

    expect(res.body.data).toEqual([
      { groupId: ids.pepsi,   name: 'Pepsi',   isActive: true,  count: 2, total: 540, share: 67.5, average: 270, lastPurchaseDate: '2026-10-10' },
      { groupId: ids.bimbo,   name: 'Bimbo',   isActive: true,  count: 1, total: 200, share: 25,   average: 200, lastPurchaseDate: '2026-10-05' },
      { groupId: ids.antiguo, name: 'Antiguo', isActive: false, count: 1, total: 60,  share: 7.5,  average: 60,  lastPurchaseDate: '2026-10-08' },
    ]);
  });

  it('groups by product, adding the variants to their product, with the quantity and the average cost', async () => {
    const res = await report(tokens.supervisor, { ...OCTOBER, group_by: 'product' });

    expect(res.body.data).toEqual([
      {
        groupId: products.soda.productId, name: 'Refresco 600 ml', sku: 'REF-600', uom: 'pza', isActive: true,
        quantity: 50, count: 2, total: 540, share: 67.5, averageCost: 10.8,
      },
      {
        groupId: products.shirt.productId, name: 'Playera básica', sku: 'PLY', uom: 'pza', isActive: true,
        quantity: 4, count: 1, total: 200, share: 25, averageCost: 50,
      },
      {
        groupId: products.old.productId, name: 'Azúcar a granel', sku: 'AZU', uom: 'kg', isActive: false,
        quantity: 1.5, count: 1, total: 60, share: 7.5, averageCost: 40,
      },
    ]);
    expect(res.body.pagination.total).toBe(3);
  });

  it('groups by branch for the central admin', async () => {
    const res = await report(tokens.admin, { ...OCTOBER, group_by: 'branch' });

    expect(res.body.data).toEqual([
      { groupId: 1,       name: 'Sucursal Central', count: 4, total: 800, share: 80, average: 200 },
      { groupId: branch2, name: 'Sucursal Norte',   count: 1, total: 200, share: 20, average: 200 },
    ]);
  });

  it('paginates the breakdown', async () => {
    const page1 = await report(tokens.supervisor, { ...OCTOBER, limit: 2, page: 1 });
    const page2 = await report(tokens.supervisor, { ...OCTOBER, limit: 2, page: 2 });

    expect(names(page1)).toEqual(['Pepsi', 'Bimbo']);
    expect(names(page2)).toEqual(['Antiguo']);
    expect(page2.body.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it('decides the period by the purchase date, and leaves the cancelled ones out', async () => {
    const res = await report(tokens.supervisor, { start_date: '2026-10-10', end_date: '2026-10-12' });

    // La del 10 de Pepsi; la cancelada del 12 no
    expect(res.body.summary).toEqual({ total: 240, count: 1, average: 240, providers: 1 });
    expect(names(res)).toEqual(['Pepsi']);
  });

  it('answers an empty period with zeros', async () => {
    const res = await report(tokens.supervisor, { start_date: '2025-01-01', end_date: '2025-01-31' });

    expect(res.body.data).toEqual([]);
    expect(res.body.summary).toEqual({ total: 0, count: 0, average: null, providers: 0 });
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
  });

  it('gives the date of the first active purchase of the branch scope', async () => {
    const own   = await report(tokens.supervisor, OCTOBER);
    const north = await report(tokens.admin, { ...OCTOBER, branch_id: branch2 });
    const all   = await report(tokens.admin, OCTOBER);

    expect(own.body.firstPurchaseDate).toBe('2026-09-30');
    expect(north.body.firstPurchaseDate).toBe('2026-10-15');
    expect(all.body.firstPurchaseDate).toBe('2026-09-30');
  });

  it('shows a branch user only their branch, even if another one is asked', async () => {
    const res = await report(tokens.supervisor, { ...OCTOBER, branch_id: branch2 });

    expect(res.body.summary.total).toBe(800);
  });

  it('shows the central admin the consolidated view and lets them filter by branch', async () => {
    const all   = await report(tokens.admin, OCTOBER);
    const north = await report(tokens.admin, { ...OCTOBER, branch_id: branch2 });

    expect(all.body.summary).toEqual({ total: 1000, count: 5, average: 200, providers: 3 });
    expect(names(all)).toEqual(['Pepsi', 'Bimbo', 'Antiguo']);
    expect(all.body.data[1]).toMatchObject({ total: 400, count: 2 });
    expect(north.body.summary).toEqual({ total: 200, count: 1, average: 200, providers: 1 });
  });
});

describe('purchases report without expenses (requisito 24)', () => {
  it('adds no expense, with or without provider', async () => {
    const own = await report(tokens.supervisor, OCTOBER);
    const all = await report(tokens.admin, OCTOBER);

    // CFE solo tiene gastos; Pepsi y Bimbo, compras y gastos
    expect(own.body.summary).toEqual({ total: 800, count: 4, average: 200, providers: 3 });
    expect(all.body.summary).toEqual({ total: 1000, count: 5, average: 200, providers: 3 });
    expect(names(all)).not.toContain('CFE');
    expect(own.body.data[0]).toMatchObject({ name: 'Pepsi', total: 540 });
  });

  it('ignores include_expenses, with any grouping and any role', async () => {
    const plain = await report(tokens.supervisor, OCTOBER);
    const asked = await report(tokens.supervisor, { ...OCTOBER, include_expenses: 'true' });
    const byProduct = await report(tokens.supervisor, { ...OCTOBER, group_by: 'product', include_expenses: 'true' });
    const buyer = await report(tokens.buyer, { ...OCTOBER, include_expenses: 'true' });

    expect(asked.status).toBe(200);
    expect(asked.body).toEqual(plain.body);
    expect(byProduct.status).toBe(200);
    expect(byProduct.body.data).toHaveLength(3);
    expect(buyer.status).toBe(200);
    expect(buyer.body.summary).toEqual(plain.body.summary);
  });
});

describe('purchases report validations and permissions', () => {
  it.each([
    ['without dates',                {}],
    ['with the start after the end', { start_date: '2026-10-31', end_date: '2026-10-01' }],
    ['with an unknown grouping',     { ...OCTOBER, group_by: 'category' }],
  ])('responds 400 %s', async (_, query) => {
    const res = await report(tokens.supervisor, query);

    expect(res.status).toBe(400);
  });

  it('responds 403 without reports.purchases, like a cashier', async () => {
    const res = await report(tokens.cajero, OCTOBER);

    expect(res.status).toBe(403);
  });

  it('responds 200 to a role with only reports.purchases', async () => {
    const res = await report(tokens.buyer, OCTOBER);

    expect(res.status).toBe(200);
    expect(res.body.summary.total).toBe(800);
  });
});
