// tests/integration/expenses/expense-categories.test.js
// API de categorías de gasto (spec 12, T4): crear, editar, activar y
// desactivar, con nombre único y 403 sin expenses.categories.
const request = require('supertest');
const app     = require('../../../app');
const { loginAs }        = require('../../helpers/auth');
const { createTestUser } = require('../../helpers/users');

let adminToken;
let supervisorToken;

const as = (token) => ({
  get:   (url)       => request(app).get(url).set('Authorization', `Bearer ${token}`),
  post:  (url, body) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
  put:   (url, body) => request(app).put(url).set('Authorization', `Bearer ${token}`).send(body),
  patch: (url, body) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body),
});

beforeAll(async () => {
  const admin      = await createTestUser({ role: 'admin', branchId: null });
  const supervisor = await createTestUser({ role: 'supervisor' });
  [adminToken, supervisorToken] = await Promise.all([loginAs(admin), loginAs(supervisor)]);
});

describe('expense categories API', () => {
  let publicidad;

  it('lists the initial categories with their net profit mark', async () => {
    const res = await as(adminToken).get('/api/expense-categories');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(7);
    const supplier = res.body.data.find(c => c.name === 'Pago a proveedor (mercancía)');
    expect(supplier).toMatchObject({ counts_in_net_profit: 0, is_active: 1, expense_count: 0 });
  });

  it('creates a category, counting in the net profit unless told otherwise', async () => {
    const counted = await as(adminToken).post('/api/expense-categories', { name: '  Publicidad ' });
    const notCounted = await as(adminToken).post('/api/expense-categories', {
      name: 'Compra de activo', counts_in_net_profit: false,
    });

    expect(counted.status).toBe(201);
    expect(counted.body.data).toMatchObject({ name: 'Publicidad', counts_in_net_profit: 1, is_active: 1 });
    expect(notCounted.body.data).toMatchObject({ name: 'Compra de activo', counts_in_net_profit: 0 });
    publicidad = counted.body.data.expense_category_id;
  });

  it('rejects a repeated name, regardless of case and accents, and an empty name', async () => {
    const repeated = await as(adminToken).post('/api/expense-categories', { name: 'nomina' });
    const empty    = await as(adminToken).post('/api/expense-categories', { name: '   ' });

    expect(repeated.status).toBe(409);
    expect(repeated.body.message).toBe('Ya existe una categoría de gasto con ese nombre');
    expect(empty.status).toBe(400);
  });

  it('edits the name and the net profit mark', async () => {
    const res = await as(adminToken).put(`/api/expense-categories/${publicidad}`, {
      name: 'Publicidad y redes', counts_in_net_profit: false,
    });
    const sameName = await as(adminToken).put(`/api/expense-categories/${publicidad}`, {
      name: 'Publicidad y redes',
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'Publicidad y redes', counts_in_net_profit: 0 });
    // Sin la marca, la conserva; su propio nombre no cuenta como repetido
    expect(sameName.body.data).toMatchObject({ name: 'Publicidad y redes', counts_in_net_profit: 0 });
  });

  it('rejects renaming a category to the name of another one', async () => {
    const res = await as(adminToken).put(`/api/expense-categories/${publicidad}`, { name: 'Renta' });

    expect(res.status).toBe(409);
  });

  it('deactivates and activates a category', async () => {
    const off = await as(adminToken).patch(`/api/expense-categories/${publicidad}/status`, { is_active: false });
    const on  = await as(adminToken).patch(`/api/expense-categories/${publicidad}/status`, { is_active: true });

    expect(off.body.data.is_active).toBe(0);
    expect(on.body.data.is_active).toBe(1);
  });

  it('responds 404 to a category that does not exist', async () => {
    const res = await as(adminToken).put('/api/expense-categories/999999', { name: 'Nueva' });

    expect(res.status).toBe(404);
  });

  it('responds 403 to a user without expenses.categories, like a supervisor', async () => {
    const list   = await as(supervisorToken).get('/api/expense-categories');
    const create = await as(supervisorToken).post('/api/expense-categories', { name: 'Fletes' });
    const status = await as(supervisorToken).patch(`/api/expense-categories/${publicidad}/status`, { is_active: false });

    expect([list.status, create.status, status.status]).toEqual([403, 403, 403]);
  });
});
