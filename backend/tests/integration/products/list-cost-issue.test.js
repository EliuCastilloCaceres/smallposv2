// tests/integration/products/list-cost-issue.test.js
// Filtro de costo de GET /api/products: cost_issue (spec 09, T1).
//
// Productos (los seeds no traen ninguno), costo / precio:
//   Agua natural   0 / 10     activo    Bebidas (5)     sin costo
//   Galletas      12 / 20     activo    Abarrotes (2)   bien
//   Bolsa         76 / 2      activo    Abarrotes (2)   costo mayor al precio
//   Muestra        5 / 0      activo    Bebidas (5)     costo mayor al precio (precio 0)
//   Refresco      15 / 15     activo    Bebidas (5)     costo igual al precio: no cuenta
//   Gratis         0 / 0      activo    Bebidas (5)     sin costo
//   Cuchara       50 / 2      inactivo  Abarrotes (2)   costo mayor al precio
//   Jugo           0 / 12     inactivo  Bebidas (5)     sin costo
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

const createProduct = async ({ name, cost, price, categoryId, isActive = 1 }) => {
  const product = await createTestProduct({ purchasePrice: cost, salePrice: price });
  await db.query(
    'UPDATE products SET name = ?, category_id = ?, is_active = ? WHERE product_id = ?',
    [name, categoryId, isActive, product.productId]
  );
  return product;
};

beforeAll(async () => {
  await createProduct({ name: 'Agua natural', cost: 0,  price: 10, categoryId: 5 });
  await createProduct({ name: 'Galletas',     cost: 12, price: 20, categoryId: 2 });
  await createProduct({ name: 'Bolsa',        cost: 76, price: 2,  categoryId: 2 });
  await createProduct({ name: 'Muestra',      cost: 5,  price: 0,  categoryId: 5 });
  await createProduct({ name: 'Refresco',     cost: 15, price: 15, categoryId: 5 });
  await createProduct({ name: 'Gratis',       cost: 0,  price: 0,  categoryId: 5 });
  await createProduct({ name: 'Cuchara',      cost: 50, price: 2,  categoryId: 2, isActive: 0 });
  await createProduct({ name: 'Jugo',         cost: 0,  price: 12, categoryId: 5, isActive: 0 });

  const admin   = await createTestUser({ role: 'admin', branchId: null });
  const cashier = await createTestUser({ role: 'cajero', branchId: 1 });
  [adminToken, cashierToken] = await Promise.all([loginAs(admin), loginAs(cashier)]);
});

describe('GET /api/products with cost_issue', () => {
  it('returns only the products without cost with no_cost', async () => {
    const res = await listProducts({ cost_issue: 'no_cost' });

    expect(res.status).toBe(200);
    expect(namesOf(res)).toEqual(['Agua natural', 'Gratis']);
    expect(res.body.pagination.total).toBe(2);
  });

  it('returns only the products with the cost above the price with above_price, including a price of 0', async () => {
    const res = await listProducts({ cost_issue: 'above_price' });

    // Refresco tiene el costo igual al precio y Gratis no tiene costo: no cuentan
    expect(namesOf(res)).toEqual(['Bolsa', 'Muestra']);
    expect(res.body.pagination.total).toBe(2);
  });

  it('returns both kinds with any', async () => {
    const res = await listProducts({ cost_issue: 'any' });

    expect(namesOf(res)).toEqual(['Agua natural', 'Bolsa', 'Gratis', 'Muestra']);
    expect(res.body.pagination.total).toBe(4);
  });

  it('combines with the status, category and search filters', async () => {
    const inactive = await listProducts({ cost_issue: 'any', is_active: 'false' });
    const category = await listProducts({ cost_issue: 'above_price', category_id: 2 });
    const search   = await listProducts({ cost_issue: 'any', search: 'agua' });

    expect(namesOf(inactive)).toEqual(['Cuchara', 'Jugo']);
    expect(namesOf(category)).toEqual(['Bolsa']);
    expect(namesOf(search)).toEqual(['Agua natural']);
  });

  it('returns every active product without the parameter, and no_cost=true still works', async () => {
    const all    = await listProducts();
    const noCost = await listProducts({ no_cost: 'true' });

    expect(all.body.pagination.total).toBe(6);
    expect(namesOf(noCost)).toEqual(['Agua natural', 'Gratis']);
  });

  it.each(['old', 'true', ''])('responds 400 to cost_issue=%j', async (value) => {
    const res = await listProducts({ cost_issue: value });

    expect(res.status).toBe(400);
  });

  it('can be used by a cashier, who has products.read', async () => {
    const res = await listProducts({ cost_issue: 'above_price' }, cashierToken);

    expect(res.status).toBe(200);
    expect(namesOf(res)).toEqual(['Bolsa', 'Muestra']);
  });
});
