// tests/integration/reports/expenses.test.js
// Reporte de gastos (spec 13, T2): resumen con lo que cuenta en la utilidad
// neta, desglose por categoría, sucursal, proveedor y método de pago, % del
// total, orden, paginación, cancelados, alcance por sucursal, fecha del primer
// gasto y respuestas 400/403.
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }         = require('../../helpers/auth');
const { createTestUser }  = require('../../helpers/users');
const { paymentMethodId } = require('../../helpers/sales');
const { expenseCategoryId, insertExpense } = require('../../helpers/expenses');

const OCTOBER = { start_date: '2026-10-01', end_date: '2026-10-31' };

let tokens = {};
let ids = {};
let branch2;

const report = (token, query) =>
  request(app).get('/api/reports/expenses').query(query).set('Authorization', `Bearer ${token}`);

const names = (res) => res.body.data.map(r => r.name);

beforeAll(async () => {
  const [branch] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Norte', 1)");
  branch2 = branch.insertId;

  const supervisor = await createTestUser({ role: 'supervisor' });
  const admin      = await createTestUser({ role: 'admin', branchId: null });
  const cajero     = await createTestUser({ role: 'cajero' });
  [tokens.supervisor, tokens.admin, tokens.cajero] = await Promise.all([supervisor, admin, cajero].map(loginAs));

  ids.cash      = await paymentMethodId('cash');
  ids.transfer  = await paymentMethodId('transfer');
  ids.renta     = await expenseCategoryId('Renta');
  ids.servicios = await expenseCategoryId('Servicios');
  ids.mercancia = await expenseCategoryId('Pago a proveedor (mercancía)');
  const [pepsi] = await db.query("INSERT INTO providers (name, is_active) VALUES ('Pepsi', 1)");
  const [cfe]   = await db.query("INSERT INTO providers (name, is_active) VALUES ('CFE', 1)");

  const base = { userId: supervisor.userId, paymentMethodId: ids.transfer };
  // Sucursal Central, octubre: 5,000 + 800 + 1,200 (mercancía) = 7,000
  await insertExpense({ ...base, expenseDate: '2026-10-01', categoryId: ids.renta, amount: 5000 });
  await insertExpense({ ...base, expenseDate: '2026-10-05', categoryId: ids.servicios, amount: 800, paymentMethodId: ids.cash, providerId: cfe.insertId });
  await insertExpense({ ...base, expenseDate: '2026-10-10', categoryId: ids.mercancia, amount: 1200, paymentMethodId: ids.cash, providerId: pepsi.insertId });
  // Cancelado: no cuenta
  await insertExpense({ ...base, expenseDate: '2026-10-12', categoryId: ids.servicios, amount: 300, status: 'cancelled' });
  // Sucursal Norte, octubre
  await insertExpense({ ...base, expenseDate: '2026-10-15', categoryId: ids.renta, amount: 2000, branchId: branch2 });
  // Fuera del periodo
  await insertExpense({ ...base, expenseDate: '2026-09-30', categoryId: ids.renta, amount: 999 });
  await insertExpense({ ...base, expenseDate: '2026-11-01', categoryId: ids.renta, amount: 999 });
  // Cancelado y más antiguo: no es el primer gasto registrado
  await insertExpense({ ...base, expenseDate: '2026-08-01', categoryId: ids.renta, amount: 50, status: 'cancelled' });
});

describe('GET /api/reports/expenses', () => {
  it('summarizes the active expenses of the period, split by the net profit mark', async () => {
    const res = await report(tokens.supervisor, OCTOBER);

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      total: 7000, count: 3, average: 2333.33, inNetProfit: 5800, outOfNetProfit: 1200,
    });
  });

  it('groups by category by default, with the share and the net profit mark', async () => {
    const res = await report(tokens.admin, OCTOBER);

    expect(res.body.data).toEqual([
      { groupId: ids.renta,     name: 'Renta', count: 2, total: 7000, share: 77.78, countsInNetProfit: true },
      { groupId: ids.mercancia, name: 'Pago a proveedor (mercancía)', count: 1, total: 1200, share: 13.33, countsInNetProfit: false },
      { groupId: ids.servicios, name: 'Servicios', count: 1, total: 800, share: 8.89, countsInNetProfit: true },
    ]);
  });

  it('groups by provider, with the expenses without provider as "Sin proveedor"', async () => {
    const res = await report(tokens.supervisor, { ...OCTOBER, group_by: 'provider' });

    expect(names(res)).toEqual(['Sin proveedor', 'Pepsi', 'CFE']);
    expect(res.body.data[0]).toMatchObject({ groupId: null, total: 5000, share: 71.43 });
    expect(res.body.pagination.total).toBe(3);
  });

  it('groups by payment method and by branch', async () => {
    const byMethod = await report(tokens.supervisor, { ...OCTOBER, group_by: 'payment_method' });
    const byBranch = await report(tokens.admin, { ...OCTOBER, group_by: 'branch' });

    expect(byMethod.body.data.map(r => [r.name, r.total])).toEqual([['Transferencia Bancaria', 5000], ['Efectivo', 2000]]);
    expect(byBranch.body.data.map(r => [r.name, r.total])).toEqual([['Sucursal Central', 7000], ['Sucursal Norte', 2000]]);
  });

  it('paginates the breakdown', async () => {
    const page1 = await report(tokens.admin, { ...OCTOBER, limit: 2, page: 1 });
    const page2 = await report(tokens.admin, { ...OCTOBER, limit: 2, page: 2 });

    expect(names(page1)).toEqual(['Renta', 'Pago a proveedor (mercancía)']);
    expect(names(page2)).toEqual(['Servicios']);
    expect(page2.body.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it('answers an empty period with zeros', async () => {
    const res = await report(tokens.supervisor, { start_date: '2025-01-01', end_date: '2025-01-31' });

    expect(res.body.data).toEqual([]);
    expect(res.body.summary).toEqual({ total: 0, count: 0, average: null, inNetProfit: 0, outOfNetProfit: 0 });
    expect(res.body.pagination.total).toBe(0);
  });

  it('gives the date of the first active expense of the branch scope', async () => {
    const own      = await report(tokens.supervisor, OCTOBER);
    const north    = await report(tokens.admin, { ...OCTOBER, branch_id: branch2 });
    const allOfThem = await report(tokens.admin, OCTOBER);

    expect(own.body.firstExpenseDate).toBe('2026-09-30');
    expect(north.body.firstExpenseDate).toBe('2026-10-15');
    expect(allOfThem.body.firstExpenseDate).toBe('2026-09-30');
  });
});

describe('expenses report branch scope', () => {
  it('shows a branch user only their branch, even if another one is asked', async () => {
    const res = await report(tokens.supervisor, { ...OCTOBER, branch_id: branch2 });

    expect(res.body.summary.total).toBe(7000);
  });

  it('shows the central admin the consolidated view and lets them filter by branch', async () => {
    const all   = await report(tokens.admin, OCTOBER);
    const north = await report(tokens.admin, { ...OCTOBER, branch_id: branch2 });

    expect(all.body.summary).toMatchObject({ total: 9000, count: 4, average: 2250, inNetProfit: 7800, outOfNetProfit: 1200 });
    expect(north.body.summary).toMatchObject({ total: 2000, count: 1 });
  });
});

describe('expenses report validations and permission', () => {
  it.each([
    ['without dates',               {}],
    ['with the start after the end', { start_date: '2026-10-31', end_date: '2026-10-01' }],
    ['with an unknown grouping',     { ...OCTOBER, group_by: 'user' }],
  ])('responds 400 %s', async (_, query) => {
    const res = await report(tokens.supervisor, query);

    expect(res.status).toBe(400);
  });

  it('responds 403 without reports.expenses, like a cashier', async () => {
    const res = await report(tokens.cajero, OCTOBER);

    expect(res.status).toBe(403);
  });
});
