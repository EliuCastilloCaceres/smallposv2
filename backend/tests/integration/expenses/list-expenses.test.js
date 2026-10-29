// tests/integration/expenses/list-expenses.test.js
// Lista, detalle, comprobante y opciones de gastos (spec 12, T5): cada
// filtro, paginación, total de los activos, alcance por sucursal y 403 por
// permiso.
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }          = require('../../helpers/auth');
const { createTestUser }   = require('../../helpers/users');
const { openTestRegister, paymentMethodId } = require('../../helpers/sales');
const { PNG_BYTES, expenseCategoryId, insertExpense } = require('../../helpers/expenses');

let tokens = {};
let ids = {};
let branch2;
const expenses = {};

const get = (token, url, query = {}) =>
  request(app).get(url).query(query).set('Authorization', `Bearer ${token}`);

const listIds = (res) => res.body.data.map(e => e.expense_id);

beforeAll(async () => {
  const [branch] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Norte', 1)");
  branch2 = branch.insertId;
  await db.query("INSERT INTO cash_registers (branch_id, name, is_active) VALUES (?, 'Caja Norte', 1)", [branch2]);

  const supervisor  = await createTestUser({ role: 'supervisor' });
  const cajero      = await createTestUser({ role: 'cajero' });
  const almacenista = await createTestUser({ role: 'almacenista' });
  const admin       = await createTestUser({ role: 'admin', branchId: null });
  [tokens.supervisor, tokens.cajero, tokens.almacenista, tokens.admin] = await Promise.all(
    [supervisor, cajero, almacenista, admin].map(loginAs)
  );
  await openTestRegister({ userId: cajero.userId });

  ids.cash     = await paymentMethodId('cash');
  ids.transfer = await paymentMethodId('transfer');
  ids.renta    = await expenseCategoryId('Renta');
  ids.luz      = await expenseCategoryId('Servicios');
  const [pepsi] = await db.query("INSERT INTO providers (name, is_active) VALUES ('Pepsi', 1)");
  ids.pepsi = pepsi.insertId;

  const base = { userId: supervisor.userId, paymentMethodId: ids.transfer, categoryId: ids.luz };
  expenses.rent      = await insertExpense({ ...base, expenseDate: '2026-09-01', categoryId: ids.renta, amount: 8000, description: 'Renta de septiembre' });
  expenses.power     = await insertExpense({ ...base, expenseDate: '2026-09-10', amount: 950.5, description: 'Luz de agosto', folio: 'CFE-778' });
  expenses.pepsi     = await insertExpense({ ...base, expenseDate: '2026-09-10', amount: 1200, description: 'Pago de refrescos', paymentMethodId: ids.cash, providerId: ids.pepsi });
  expenses.cancelled = await insertExpense({ ...base, expenseDate: '2026-09-15', amount: 300, description: 'Luz duplicada', status: 'cancelled' });
  expenses.north     = await insertExpense({ ...base, expenseDate: '2026-09-12', amount: 500, description: 'Luz Norte', branchId: branch2 });

  // Con comprobante, registrado por la API
  const res = await request(app).post('/api/expenses').set('Authorization', `Bearer ${tokens.admin}`)
    .field('expense_category_id', String(ids.luz)).field('amount', '75').field('description', 'Agua Norte')
    .field('payment_method_id', String(ids.transfer)).field('expense_date', '2026-09-20')
    .field('branch_id', String(branch2))
    .attach('receipt', PNG_BYTES, 'agua.png');
  expenses.northReceipt = res.body.data.expense_id;
});

describe('expenses list', () => {
  const SEPTEMBER = { start_date: '2026-09-01', end_date: '2026-09-30' };

  it('lists the active expenses of the range, newest first, with the total of the active ones', async () => {
    const res = await get(tokens.supervisor, '/api/expenses', SEPTEMBER);

    expect(res.status).toBe(200);
    // Mismo día: el registrado después va primero
    expect(listIds(res)).toEqual([expenses.pepsi, expenses.power, expenses.rent]);
    expect(res.body.summary).toEqual({ count: 3, total_amount: 10150.5 });
    expect(res.body.data[0]).toMatchObject({
      expense_date: '2026-09-10', category_name: 'Servicios', provider_name: 'Pepsi',
      payment_method_name: 'Efectivo', paid_from_register: false, has_receipt: false, status: 'active',
    });
  });

  it('filters by dates', async () => {
    const res = await get(tokens.supervisor, '/api/expenses', { start_date: '2026-09-05', end_date: '2026-09-10' });

    expect(listIds(res)).toEqual([expenses.pepsi, expenses.power]);
  });

  it('filters by category, payment method and provider', async () => {
    const byCategory = await get(tokens.supervisor, '/api/expenses', { ...SEPTEMBER, category_id: ids.renta });
    const byMethod   = await get(tokens.supervisor, '/api/expenses', { ...SEPTEMBER, payment_method_id: ids.cash });
    const byProvider = await get(tokens.supervisor, '/api/expenses', { ...SEPTEMBER, provider_id: ids.pepsi });

    expect(listIds(byCategory)).toEqual([expenses.rent]);
    expect(listIds(byMethod)).toEqual([expenses.pepsi]);
    expect(listIds(byProvider)).toEqual([expenses.pepsi]);
    expect(byCategory.body.summary).toEqual({ count: 1, total_amount: 8000 });
  });

  it('searches by description or folio', async () => {
    const byDescription = await get(tokens.supervisor, '/api/expenses', { ...SEPTEMBER, search: 'refresco' });
    const byFolio       = await get(tokens.supervisor, '/api/expenses', { ...SEPTEMBER, search: 'CFE' });

    expect(listIds(byDescription)).toEqual([expenses.pepsi]);
    expect(listIds(byFolio)).toEqual([expenses.power]);
  });

  it('filters by status, keeping the total of the active ones', async () => {
    const cancelled = await get(tokens.supervisor, '/api/expenses', { ...SEPTEMBER, status: 'cancelled' });
    const all       = await get(tokens.supervisor, '/api/expenses', { ...SEPTEMBER, status: 'all' });
    const invalid   = await get(tokens.supervisor, '/api/expenses', { ...SEPTEMBER, status: 'deleted' });

    expect(listIds(cancelled)).toEqual([expenses.cancelled]);
    expect(cancelled.body.summary).toEqual({ count: 3, total_amount: 10150.5 });
    expect(listIds(all)).toEqual([expenses.cancelled, expenses.pepsi, expenses.power, expenses.rent]);
    expect(invalid.status).toBe(400);
  });

  it('paginates', async () => {
    const page1 = await get(tokens.supervisor, '/api/expenses', { ...SEPTEMBER, limit: 2, page: 1 });
    const page2 = await get(tokens.supervisor, '/api/expenses', { ...SEPTEMBER, limit: 2, page: 2 });

    expect(listIds(page1)).toEqual([expenses.pepsi, expenses.power]);
    expect(listIds(page2)).toEqual([expenses.rent]);
    expect(page2.body.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it('rejects an invalid date range', async () => {
    const res = await get(tokens.supervisor, '/api/expenses', { start_date: '2026-09-30', end_date: '2026-09-01' });

    expect(res.status).toBe(400);
  });
});

describe('expenses branch scope', () => {
  it('shows a branch user only the expenses of their branch, even if another one is asked', async () => {
    const res = await get(tokens.supervisor, '/api/expenses', { status: 'all', branch_id: branch2 });

    expect(listIds(res)).not.toContain(expenses.north);
    expect(res.body.data.every(e => e.branch_id === 1)).toBe(true);
  });

  it('shows the central admin every branch and lets them filter by one', async () => {
    const all      = await get(tokens.admin, '/api/expenses', { status: 'all' });
    const filtered = await get(tokens.admin, '/api/expenses', { status: 'all', branch_id: branch2 });

    expect(listIds(all)).toEqual(expect.arrayContaining([expenses.north, expenses.rent]));
    expect(listIds(filtered)).toEqual([expenses.northReceipt, expenses.north]);
    expect(filtered.body.data[0]).toMatchObject({ branch_name: 'Sucursal Norte', has_receipt: true });
  });

  it('answers the detail and the receipt of another branch like ones that do not exist', async () => {
    const detail  = await get(tokens.supervisor, `/api/expenses/${expenses.north}`);
    const missing = await get(tokens.supervisor, '/api/expenses/999999');
    const receipt = await get(tokens.supervisor, `/api/expenses/${expenses.northReceipt}/receipt`);
    const own     = await get(tokens.supervisor, `/api/expenses/${expenses.rent}`);

    expect(detail.status).toBe(404);
    expect(detail.body).toEqual(missing.body);
    expect(receipt.status).toBe(404);
    expect(own.status).toBe(200);
  });

  it('lets the central admin see the detail and the receipt of any branch', async () => {
    const detail  = await get(tokens.admin, `/api/expenses/${expenses.northReceipt}`);
    const receipt = await get(tokens.admin, `/api/expenses/${expenses.northReceipt}/receipt`);

    expect(detail.body.data).toMatchObject({ branch_name: 'Sucursal Norte', has_receipt: true, receipt_name: 'agua.png' });
    expect(receipt.status).toBe(200);
  });

  it('responds 404 to the receipt of an expense without one', async () => {
    const res = await get(tokens.supervisor, `/api/expenses/${expenses.rent}/receipt`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('El gasto no tiene comprobante');
  });
});

describe('expenses permissions and options', () => {
  it('responds 403 to the list, the detail and the receipt without expenses.read, like a cashier', async () => {
    const list    = await get(tokens.cajero, '/api/expenses');
    const detail  = await get(tokens.cajero, `/api/expenses/${expenses.rent}`);
    const receipt = await get(tokens.cajero, `/api/expenses/${expenses.rent}/receipt`);

    expect([list.status, detail.status, receipt.status]).toEqual([403, 403, 403]);
  });

  it('gives a cashier the form options: active categories, methods without Crédito, providers and open registers of their branch', async () => {
    await db.query("INSERT INTO expense_categories (name, is_active) VALUES ('Vieja', 0)");
    const res = await get(tokens.cajero, '/api/expenses/options');

    expect(res.status).toBe(200);
    const { categories, payment_methods, providers, registers, branches } = res.body.data;
    expect(categories.map(c => c.name)).toContain('Renta');
    expect(categories.map(c => c.name)).not.toContain('Vieja');
    // Inactiva desde la spec 14 (migración 015): los pagos de mercancía son compras
    expect(categories.map(c => c.name)).not.toContain('Pago a proveedor (mercancía)');
    expect(payment_methods.map(m => m.code).sort()).toEqual(['card', 'cash', 'transfer']);
    expect(providers.map(p => p.name)).toContain('Pepsi');
    expect(registers).toEqual([expect.objectContaining({ cash_register_id: 1, name: 'Caja 1', branch_id: 1 })]);
    expect(branches).toBeUndefined();
  });

  it('gives the central admin the active branches to choose from', async () => {
    const res = await get(tokens.admin, '/api/expenses/options');

    expect(res.body.data.branches.map(b => b.name)).toEqual(['Sucursal Central', 'Sucursal Norte']);
  });

  it('responds 403 to the options without expenses.create or expenses.read', async () => {
    const res = await get(tokens.almacenista, '/api/expenses/options');

    expect(res.status).toBe(403);
  });
});
