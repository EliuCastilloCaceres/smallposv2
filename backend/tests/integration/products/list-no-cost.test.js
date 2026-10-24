// tests/integration/products/list-no-cost.test.js
// Filtro "Sin costo" de GET /api/products (spec 06, T1).
//
// Productos (los seeds no traen ninguno):
//   Agua natural     costo 0     activo    Bebidas (5)
//   Agua mineral     costo 0     activo    Abarrotes (2)
//   Galletas         costo 12.5  activo    Abarrotes (2)
//   Jugo             costo 0     inactivo  Bebidas (5)
//   Cereal           costo 7     inactivo  Abarrotes (2)
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }           = require('../../helpers/auth');
const { createTestUser }    = require('../../helpers/users');
const { createTestProduct } = require('../../helpers/sales');

let adminToken;
let cashierToken;

const listProducts = (query = {}, token = adminToken) =>
  request(app)
    .get('/api/products')
    .query(query)
    .set('Authorization', `Bearer ${token}`);

const namesOf = (res) => res.body.data.map(p => p.name).sort();

const createProduct = async ({ name, purchasePrice, categoryId, isActive = 1 }) => {
  const product = await createTestProduct({ purchasePrice });
  await db.query(
    'UPDATE products SET name = ?, category_id = ?, is_active = ? WHERE product_id = ?',
    [name, categoryId, isActive, product.productId]
  );
  return product;
};

beforeAll(async () => {
  await createProduct({ name: 'Agua natural', purchasePrice: 0,    categoryId: 5 });
  await createProduct({ name: 'Agua mineral', purchasePrice: 0,    categoryId: 2 });
  await createProduct({ name: 'Galletas',     purchasePrice: 12.5, categoryId: 2 });
  await createProduct({ name: 'Jugo',         purchasePrice: 0,    categoryId: 5, isActive: 0 });
  await createProduct({ name: 'Cereal',       purchasePrice: 7,    categoryId: 2, isActive: 0 });

  const admin   = await createTestUser({ role: 'admin', branchId: null });
  const cashier = await createTestUser({ role: 'cajero', branchId: 1 });
  [adminToken, cashierToken] = await Promise.all([loginAs(admin), loginAs(cashier)]);
});

describe('GET /api/products with no_cost', () => {
  it('returns only the products without cost and counts only those', async () => {
    const res = await listProducts({ no_cost: 'true' });

    expect(res.status).toBe(200);
    expect(namesOf(res)).toEqual(['Agua mineral', 'Agua natural']);
    expect(res.body.data.every(p => Number(p.purchase_price) === 0)).toBe(true);
    expect(res.body.pagination.total).toBe(2);
  });

  it('combines with the status, category and search filters', async () => {
    const inactive = await listProducts({ no_cost: 'true', is_active: 'false' });
    const drinks   = await listProducts({ no_cost: 'true', category_id: 5 });
    const search   = await listProducts({ no_cost: 'true', search: 'mineral' });

    expect(namesOf(inactive)).toEqual(['Jugo']);
    expect(namesOf(drinks)).toEqual(['Agua natural']);
    expect(namesOf(search)).toEqual(['Agua mineral']);
    expect(search.body.pagination.total).toBe(1);
  });

  it('returns every product, as before, without the parameter or with no_cost=false', async () => {
    const without = await listProducts();
    const off     = await listProducts({ no_cost: 'false' });

    expect(namesOf(without)).toEqual(['Agua mineral', 'Agua natural', 'Galletas']);
    expect(without.body.pagination.total).toBe(3);
    expect(namesOf(off)).toEqual(namesOf(without));
  });

  it('lets a cashier with products.read use it', async () => {
    const res = await listProducts({ no_cost: 'true' }, cashierToken);

    expect(res.status).toBe(200);
    expect(namesOf(res)).toEqual(['Agua mineral', 'Agua natural']);
  });
});
