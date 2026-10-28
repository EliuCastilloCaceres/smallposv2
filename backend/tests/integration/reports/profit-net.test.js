// tests/integration/reports/profit-net.test.js
// Utilidad neta en Ventas y utilidad (spec 13, T4).
//
// Ventas del 2026-03-10:
//   Sucursal Central: A a $100 (costo 40) + C a $50 sin costo → venta 150, utilidad 110
//   Sucursal Norte:   A a $100 (costo 40)                     → venta 100, utilidad 60
//   Sucursal Sur:     sin ventas
// Gastos de marzo:
//   Central: Renta 30 (cuenta), mercancía 500 (no cuenta), Servicios 10 cancelado
//   Norte:   Servicios 20 (cuenta)
//   Sur:     Renta 50 (cuenta)
//   Central, 2026-02-28: Renta 999, fuera del periodo (es el primer gasto)
// Consolidado: venta 250, utilidad 170, gastos 100, utilidad neta 70 (28%).
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }          = require('../../helpers/auth');
const { createTestUser }   = require('../../helpers/users');
const { createTestProduct, paymentMethodId } = require('../../helpers/sales');
const { expenseCategoryId, insertExpense } = require('../../helpers/expenses');
const { toServerDayStart } = require('../../../src/utils/timezone');

const MARCH = { start_date: '2026-03-01', end_date: '2026-03-31' };

let seller;
let tokens = {};
let north;
let south;

const getProfit = (token, query = {}) =>
  request(app).get('/api/reports/profit').query({ ...MARCH, ...query }).set('Authorization', `Bearer ${token}`);

// Venta de una línea el 2026-03-10 a mediodía (hora de México)
const insertSale = async ({ branchId, product, unitPrice }) => {
  const [order] = await db.query(
    `INSERT INTO orders (branch_id, cash_register_id, customer_id, user_id, subtotal, discount, total, status, created_at)
     VALUES (?, 1, 1, ?, ?, 0, ?, 'completed', DATE_ADD(?, INTERVAL 12 HOUR))`,
    [branchId, seller.userId, unitPrice, unitPrice, await toServerDayStart('2026-03-10')]
  );
  await db.query(
    `INSERT INTO order_details (order_id, product_id, variant_id, quantity, unit_price, purchase_price, discount, subtotal)
     VALUES (?, ?, NULL, 1, ?, ?, 0, ?)`,
    [order.insertId, product.productId, unitPrice, product.purchasePrice, unitPrice]
  );
};

beforeAll(async () => {
  const [n] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Norte', 1)");
  const [s] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Sur', 1)");
  north = n.insertId;
  south = s.insertId;

  seller = await createTestUser({ role: 'supervisor' });
  const admin = await createTestUser({ role: 'admin', branchId: null });

  // Rol con Ventas y utilidad, pero sin el reporte de gastos
  await db.query("INSERT INTO roles (name, description) VALUES ('analista', 'Solo utilidad')");
  await db.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT r.role_id, p.permission_id FROM roles r
       JOIN permissions p ON p.module = 'reports' AND p.action = 'profit'
      WHERE r.name = 'analista'`
  );
  const analyst = await createTestUser({ role: 'analista', branchId: null });
  [tokens.supervisor, tokens.admin, tokens.analyst] = await Promise.all([seller, admin, analyst].map(loginAs));

  const productA = await createTestProduct({ purchasePrice: 40, salePrice: 100 });
  const productC = await createTestProduct({ purchasePrice: 0, salePrice: 50 });
  await insertSale({ branchId: 1, product: productA, unitPrice: 100 });
  await insertSale({ branchId: 1, product: productC, unitPrice: 50 });
  await insertSale({ branchId: north, product: productA, unitPrice: 100 });

  const base = { userId: seller.userId, paymentMethodId: await paymentMethodId('transfer') };
  const renta     = await expenseCategoryId('Renta');
  const servicios = await expenseCategoryId('Servicios');
  const mercancia = await expenseCategoryId('Pago a proveedor (mercancía)');
  await insertExpense({ ...base, expenseDate: '2026-03-05', categoryId: renta, amount: 30 });
  await insertExpense({ ...base, expenseDate: '2026-03-06', categoryId: mercancia, amount: 500 });
  await insertExpense({ ...base, expenseDate: '2026-03-07', categoryId: servicios, amount: 10, status: 'cancelled' });
  await insertExpense({ ...base, expenseDate: '2026-03-08', categoryId: servicios, amount: 20, branchId: north });
  await insertExpense({ ...base, expenseDate: '2026-03-09', categoryId: renta, amount: 50, branchId: south });
  await insertExpense({ ...base, expenseDate: '2026-02-28', categoryId: renta, amount: 999 });
});

describe('net profit in GET /api/reports/profit', () => {
  it('subtracts the active expenses of the categories that count in the net profit', async () => {
    const res = await getProfit(tokens.admin);

    expect(res.body.summary).toMatchObject({ netSales: 250, cost: 80, profit: 170 });
    expect(res.body.summary.net).toEqual({
      expenses: 100, netProfit: 70, netMargin: 28, firstExpenseDate: '2026-02-28',
    });
  });

  it('keeps subtracting the same expenses when the sales without cost are excluded', async () => {
    const res = await getProfit(tokens.admin, { exclude_no_cost: 'true' });

    expect(res.body.summary).toMatchObject({ netSales: 200, profit: 120 });
    expect(res.body.summary.net).toMatchObject({ expenses: 100, netProfit: 20, netMargin: 10 });
  });

  it('adds the expenses and the net profit of each branch, including a branch with expenses and no sales', async () => {
    const res = await getProfit(tokens.admin, { group_by: 'branch' });

    expect(res.body.data.map(r => [r.name, r.netSales, r.profit, r.net])).toEqual([
      ['Sucursal Central', 150, 110, { expenses: 30, netProfit: 80 }],
      ['Sucursal Norte',   100, 60,  { expenses: 20, netProfit: 40 }],
      ['Sucursal Sur',     0,   0,   { expenses: 50, netProfit: -50 }],
    ]);
    expect(res.body.data[2]).toMatchObject({ groupId: south, margin: null, productCount: 0 });
    expect(res.body.pagination.total).toBe(3);
  });

  it('sorts and paginates the branches with their net profit', async () => {
    const page2 = await getProfit(tokens.admin, { group_by: 'branch', limit: 2, page: 2 });
    const byMarginAsc = await getProfit(tokens.admin, { group_by: 'branch', sort_by: 'margin', sort_dir: 'asc' });

    expect(page2.body.data.map(r => r.name)).toEqual(['Sucursal Sur']);
    expect(page2.body.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
    // Sin margen al final, en cualquier dirección
    expect(byMarginAsc.body.data.map(r => r.name)).toEqual(['Sucursal Norte', 'Sucursal Central', 'Sucursal Sur']);
  });

  it('does not add expenses to the rows grouped by product', async () => {
    const res = await getProfit(tokens.admin);

    expect(res.body.data.every(r => r.net === undefined)).toBe(true);
  });

  it('uses only the branch of a branch user, with the first expense of that branch', async () => {
    const res = await getProfit(tokens.supervisor, { branch_id: north });

    expect(res.body.summary).toMatchObject({ netSales: 150, profit: 110 });
    expect(res.body.summary.net).toEqual({
      expenses: 30, netProfit: 80, netMargin: 53.33, firstExpenseDate: '2026-02-28',
    });
  });

  it('lets the central admin see the net profit of one branch', async () => {
    const res = await getProfit(tokens.admin, { branch_id: north });

    expect(res.body.summary.net).toEqual({
      expenses: 20, netProfit: 40, netMargin: 40, firstExpenseDate: '2026-03-08',
    });
  });

  it('leaves the net profit out with a product category filter', async () => {
    const res = await getProfit(tokens.admin, { category_id: 1, group_by: 'branch' });

    expect(res.status).toBe(200);
    expect(res.body.summary.net).toBeUndefined();
    expect(res.body.data.every(r => r.net === undefined)).toBe(true);
  });

  it('leaves the net profit out for a user without reports.expenses', async () => {
    const summary = await getProfit(tokens.analyst);
    const byBranch = await getProfit(tokens.analyst, { group_by: 'branch' });

    expect(summary.status).toBe(200);
    expect(summary.body.summary.net).toBeUndefined();
    expect(byBranch.body.data.map(r => r.name)).toEqual(['Sucursal Central', 'Sucursal Norte']);
    expect(byBranch.body.data.every(r => r.net === undefined)).toBe(true);
  });
});
