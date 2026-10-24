// tests/integration/reports/inventory.test.js
// Reporte de Valuación de inventario (spec 07, T2). El stock y los apartados
// se guardan directo en la BD.
//
// Productos (costo / precio), stock en la sucursal 1 y en la 2 (Norte):
//   A Arroz      20 / 30, Abarrotes, Distribuidora Sur: suc. 1 10, suc. 2 5
//   B Refresco   12 / 10, Bebidas, genérico: 4 (precio menor al costo)
//   C Queso       0 / 100, sin categoría, genérico: 2.5 kg (sin costo)
//   D Muestra     0 / 0, Bebidas, genérico: 3 (sin costo y sin precio)
//   V Tenis     300 / 500, Papelería (oculta en la suc. 1), Distribuidora Sur:
//     talla 26: 1, talla 27: 2, talla 28 (inactiva): 3, fila sin variante: 7
//   I Inactivo   50 / 80, Abarrotes, genérico, producto inactivo: 4
//   Z Agotado     5 / 9, Abarrotes, genérico: 0
//
// Disponible (consolidado): A 15, B 4, C 2.5 kg, D 3, V26 1, V27 2
//   6 artículos, 25 pza + 2.5 kg, costo 1,248, venta 2,240
// Apartados activos: suc. 1 A ×2 y V26 ×1; suc. 2 C ×1. Uno liquidado (B ×3)
// y uno cancelado (A ×1) no cuentan.
//   3 artículos, 3 pza + 1 kg, costo 340, venta 660
// Alertas: sin costo C y D (venta 250); precio menor al costo B (costo 48);
// inactivos V28 e I (7 pza, costo 1,100).
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }        = require('../../helpers/auth');
const { createTestUser } = require('../../helpers/users');

let adminToken;
let supervisorToken;
let cashierToken;
let storekeeperToken;
let branch2;
let provider2;
const products = {};

const getInventory = (token, query = {}) =>
  request(app)
    .get('/api/reports/inventory')
    .query(query)
    .set('Authorization', `Bearer ${token}`);

const createProduct = async ({
  name, sku, cost, price, categoryId = null, providerId = 1, uom = 'pza', isActive = 1, variants = [],
}) => {
  const [result] = await db.query(
    `INSERT INTO products (provider_id, category_id, is_variable, sku, name, purchase_price, sale_price, uom, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [providerId, categoryId, variants.length > 0 ? 1 : 0, sku, name, cost, price, uom, isActive]
  );
  const variantIds = {};
  for (const { label, sku: variantSku = null, isActive: variantActive = 1 } of variants) {
    const [variant] = await db.query(
      'INSERT INTO product_variants (product_id, sku, label, is_active) VALUES (?, ?, ?, ?)',
      [result.insertId, variantSku, label, variantActive]
    );
    variantIds[label] = variant.insertId;
  }
  return { productId: result.insertId, variantIds };
};

const setStock = (branchId, product, quantity, variantId = null) =>
  db.query(
    'INSERT INTO inventory_stock (branch_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)',
    [branchId, product.productId, variantId, quantity]
  );

// Apartado guardado directo en la BD. lines: { product, variantId, quantity, unitPrice, cost }
const insertLayaway = async ({ branchId = 1, status = 'active', lines }) => {
  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const [layaway] = await db.query(
    `INSERT INTO layaways (customer_id, branch_id, user_id, total_amount, amount_paid, balance, status)
     VALUES (1, ?, 1, ?, 0, ?, ?)`,
    [branchId, total, total, status]
  );
  for (const l of lines) {
    await db.query(
      `INSERT INTO layaway_details (layaway_id, product_id, variant_id, quantity, unit_price, purchase_price)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [layaway.insertId, l.product.productId, l.variantId ?? null, l.quantity, l.unitPrice, l.cost]
    );
  }
};

beforeAll(async () => {
  const [branch] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Norte', 1)");
  branch2 = branch.insertId;
  const [provider] = await db.query("INSERT INTO providers (name, is_active) VALUES ('Distribuidora Sur', 1)");
  provider2 = provider.insertId;
  // Papelería oculta en la sucursal 1: en Inventario no se ve, aquí sí cuenta
  await db.query('INSERT INTO branch_hidden_categories (branch_id, category_id) VALUES (1, 6)');

  // Categorías de los seeds: 2 Abarrotes, 5 Bebidas, 6 Papelería
  products.A = await createProduct({ name: 'Arroz',    sku: 'ARR-1', cost: 20, price: 30,  categoryId: 2, providerId: provider2 });
  products.B = await createProduct({ name: 'Refresco', sku: 'REF-1', cost: 12, price: 10,  categoryId: 5 });
  products.C = await createProduct({ name: 'Queso',    sku: 'QUE-1', cost: 0,  price: 100, uom: 'kg' });
  products.D = await createProduct({ name: 'Muestra',  sku: 'MUE-1', cost: 0,  price: 0,   categoryId: 5 });
  products.V = await createProduct({
    name: 'Tenis', sku: 'TEN', cost: 300, price: 500, categoryId: 6, providerId: provider2,
    variants: [{ label: '26', sku: 'TEN-26' }, { label: '27', sku: 'TEN-27' }, { label: '28', sku: 'TEN-28', isActive: 0 }],
  });
  products.I = await createProduct({ name: 'Inactivo', sku: 'INA-1', cost: 50, price: 80, categoryId: 2, isActive: 0 });
  products.Z = await createProduct({ name: 'Agotado',  sku: 'AGO-1', cost: 5,  price: 9,  categoryId: 2 });

  const { A, B, C, D, V, I, Z } = products;
  await setStock(1, A, 10);
  await setStock(branch2, A, 5);
  await setStock(1, B, 4);
  await setStock(1, C, 2.5);
  await setStock(1, D, 3);
  await setStock(1, V, 1, V.variantIds['26']);
  await setStock(1, V, 2, V.variantIds['27']);
  await setStock(1, V, 3, V.variantIds['28']);
  await setStock(1, V, 7); // fila sin variante de un producto variable: no cuenta
  await setStock(1, I, 4);
  await setStock(1, Z, 0);

  // Costo y precio del apartado distintos a los de hoy: se valora con los de hoy
  await insertLayaway({ lines: [
    { product: A, quantity: 2, unitPrice: 28, cost: 15 },
    { product: V, variantId: V.variantIds['26'], quantity: 1, unitPrice: 450, cost: 280 },
  ] });
  await insertLayaway({ branchId: branch2, lines: [{ product: C, quantity: 1, unitPrice: 90, cost: 0 }] });
  await insertLayaway({ status: 'completed', lines: [{ product: B, quantity: 3, unitPrice: 10, cost: 12 }] });
  await insertLayaway({ branchId: branch2, status: 'cancelled', lines: [{ product: A, quantity: 1, unitPrice: 30, cost: 20 }] });

  const admin       = await createTestUser({ role: 'admin', branchId: null });
  const supervisor  = await createTestUser({ role: 'supervisor', branchId: 1 });
  const cashier     = await createTestUser({ role: 'cajero', branchId: 1 });
  const storekeeper = await createTestUser({ role: 'almacenista', branchId: 1 });
  [adminToken, supervisorToken, cashierToken, storekeeperToken] = await Promise.all([
    loginAs(admin), loginAs(supervisor), loginAs(cashier), loginAs(storekeeper),
  ]);
});

const AVAILABLE = {
  items:     6,
  units:     [{ uom: 'pza', quantity: 25 }, { uom: 'kg', quantity: 2.5 }],
  costValue: 1248,
  saleValue: 2240,
  profit:    992,
  margin:    44.29,
};

const rowNames = (res) => res.body.data.map(r => r.name);

describe('GET /api/reports/inventory', () => {
  describe('access', () => {
    it('responds 403 to a cashier', async () => {
      const res = await getInventory(cashierToken);

      expect(res.status).toBe(403);
    });

    it('responds 200 to a storekeeper', async () => {
      const res = await getInventory(storekeeperToken);

      expect(res.status).toBe(200);
    });

    it.each([
      ['an unknown group_by', { group_by: 'color' }],
      ['an unknown alert', { alert: 'old' }],
      ['an alert with another grouping', { alert: 'inactive', group_by: 'category' }],
      ['an unknown sort_by', { sort_by: 'units' }],
      ['an unknown sort_dir', { sort_dir: 'up' }],
      ['an invalid category_id', { category_id: 'abc' }],
      ['an invalid provider_id', { provider_id: '0' }],
      ['an invalid excluded category', { exclude_category_ids: '6,x' }],
      ['category_id together with excluded categories', { category_id: 2, exclude_category_ids: '6' }],
    ])('responds 400 to %s', async (_, query) => {
      const res = await getInventory(adminToken, query);

      expect(res.status).toBe(400);
    });
  });

  describe('available stock', () => {
    it('counts active items with stock, with units per unit of measure, values and margin', async () => {
      // No cuentan: Z (stock 0), I (inactivo), V28 (variante inactiva) ni la
      // fila sin variante de V
      const res = await getInventory(adminToken);

      expect(res.status).toBe(200);
      expect(res.body.summary.available).toEqual(AVAILABLE);
    });

    it('counts an item with stock in two branches once and adds up its units', async () => {
      const res = await getInventory(adminToken, { search: 'arroz' });

      expect(res.body.summary.available).toMatchObject({
        items: 1, units: [{ uom: 'pza', quantity: 15 }], costValue: 300, saleValue: 450,
      });
    });

    it('counts a category hidden for the branch', async () => {
      const res = await getInventory(supervisorToken, { category_id: 6 });

      expect(res.body.summary.available).toMatchObject({ items: 2, costValue: 900, saleValue: 1500 });
    });
  });

  describe('reserved and total in store', () => {
    it('counts the lines of active layaways at the current cost and price', async () => {
      const res = await getInventory(adminToken);

      expect(res.body.summary.reserved).toEqual({
        items:     3,
        units:     [{ uom: 'pza', quantity: 3 }, { uom: 'kg', quantity: 1 }],
        costValue: 340,
        saleValue: 660,
        profit:    320,
        margin:    48.48,
      });
    });

    it('adds available and reserved, counting each item once', async () => {
      const res = await getInventory(adminToken);

      expect(res.body.summary.total).toEqual({
        items:     6,
        units:     [{ uom: 'pza', quantity: 28 }, { uom: 'kg', quantity: 3.5 }],
        costValue: 1588,
        saleValue: 2900,
        profit:    1312,
        margin:    45.24,
      });
    });
  });

  describe('items without cost', () => {
    it('counts them and reports them for the notice', async () => {
      const res = await getInventory(adminToken);

      expect(res.body.summary.noCost).toEqual({ items: 2, saleValue: 250 });
    });

    it('leaves them out of the KPIs, the summary and the table with exclude_no_cost, but not out of the alert', async () => {
      const res = await getInventory(adminToken, { exclude_no_cost: 'true' });
      const { summary } = res.body;

      expect(summary.available).toMatchObject({ items: 4, units: [{ uom: 'pza', quantity: 22 }], costValue: 1248, saleValue: 1990 });
      expect(summary.reserved).toMatchObject({ items: 2, costValue: 340, saleValue: 560 });
      expect(summary.total).toMatchObject({ items: 4, costValue: 1588, saleValue: 2550 });
      expect(summary.noCost).toEqual({ items: 0, saleValue: 0 });
      expect(summary.alerts.noCost).toMatchObject({ items: 2, saleValue: 250 });
      expect(rowNames(res)).toEqual(['Tenis', 'Arroz', 'Refresco']);
    });
  });

  describe('filters', () => {
    it('filters by category, including reserved and alerts', async () => {
      const res = await getInventory(adminToken, { category_id: 2 });
      const { summary } = res.body;

      expect(summary.available).toMatchObject({ items: 1, costValue: 300 });
      expect(summary.reserved).toMatchObject({ items: 1, costValue: 40 });
      expect(summary.alerts.inactive).toMatchObject({ items: 1, costValue: 200 });
      expect(summary.alerts.noCost.items).toBe(0);
    });

    it('filters by provider', async () => {
      const res = await getInventory(adminToken, { provider_id: provider2 });

      expect(res.body.summary.available).toMatchObject({ items: 3, costValue: 1200, saleValue: 1950 });
      expect(res.body.summary.alerts.inactive).toMatchObject({ items: 1, costValue: 900 });
    });

    it('finds a product by the SKU of a variant and counts all its variants', async () => {
      const res = await getInventory(adminToken, { search: 'TEN-27' });

      expect(res.body.summary.available).toMatchObject({ items: 2, costValue: 900 });
      expect(rowNames(res)).toEqual(['Tenis']);
    });

    it('leaves the excluded categories out of everything', async () => {
      const one = await getInventory(adminToken, { exclude_category_ids: '6' });
      const two = await getInventory(adminToken, { exclude_category_ids: '5,6' });

      expect(one.body.summary.available).toMatchObject({ items: 4, costValue: 348, saleValue: 740 });
      expect(one.body.summary.reserved).toMatchObject({ items: 2, costValue: 40 });
      expect(one.body.summary.alerts.inactive).toMatchObject({ items: 1, costValue: 200 });
      // Un producto sin categoría no se puede excluir
      expect(two.body.summary.available).toMatchObject({ items: 2, costValue: 300, saleValue: 700 });
    });
  });

  describe('table', () => {
    it('groups by product summing variants, sorted by cost value with ties by name', async () => {
      const res = await getInventory(adminToken);
      const { A, B, C, D, V } = products;

      expect(res.body.data).toEqual([
        { groupId: V.productId, name: 'Tenis',    sku: 'TEN',   units: 3,   uom: 'pza', costValue: 900, saleValue: 1500, profit: 600, margin: 40,    noCostItems: 0 },
        { groupId: A.productId, name: 'Arroz',    sku: 'ARR-1', units: 15,  uom: 'pza', costValue: 300, saleValue: 450,  profit: 150, margin: 33.33, noCostItems: 0 },
        { groupId: B.productId, name: 'Refresco', sku: 'REF-1', units: 4,   uom: 'pza', costValue: 48,  saleValue: 40,   profit: -8,  margin: -20,   noCostItems: 0 },
        { groupId: D.productId, name: 'Muestra',  sku: 'MUE-1', units: 3,   uom: 'pza', costValue: 0,   saleValue: 0,    profit: 0,   margin: null,  noCostItems: 1 },
        { groupId: C.productId, name: 'Queso',    sku: 'QUE-1', units: 2.5, uom: 'kg',  costValue: 0,   saleValue: 250,  profit: 250, margin: 100,   noCostItems: 1 },
      ]);
    });

    it('puts a margin without value last in both directions', async () => {
      const desc = await getInventory(adminToken, { sort_by: 'margin' });
      const asc  = await getInventory(adminToken, { sort_by: 'margin', sort_dir: 'asc' });

      expect(rowNames(desc)).toEqual(['Queso', 'Tenis', 'Arroz', 'Refresco', 'Muestra']);
      expect(rowNames(asc)).toEqual(['Refresco', 'Arroz', 'Tenis', 'Queso', 'Muestra']);
    });

    it('groups by category, with "Sin categoría" and items instead of units', async () => {
      const res = await getInventory(adminToken, { group_by: 'category' });

      expect(res.body.data).toEqual([
        { groupId: 6,    name: 'Papelería',     items: 2, costValue: 900, saleValue: 1500, profit: 600, margin: 40,  noCostItems: 0 },
        { groupId: 2,    name: 'Abarrotes',     items: 1, costValue: 300, saleValue: 450,  profit: 150, margin: 33.33, noCostItems: 0 },
        { groupId: 5,    name: 'Bebidas',       items: 2, costValue: 48,  saleValue: 40,   profit: -8,  margin: -20, noCostItems: 1 },
        { groupId: null, name: 'Sin categoría', items: 1, costValue: 0,   saleValue: 250,  profit: 250, margin: 100, noCostItems: 1 },
      ]);
    });

    it('groups by provider', async () => {
      const res = await getInventory(adminToken, { group_by: 'provider' });

      expect(res.body.data.map(r => [r.name, r.items, r.costValue, r.saleValue])).toEqual([
        ['Distribuidora Sur',  3, 1200, 1950],
        ['Proveedor generico', 3, 48,   290],
      ]);
    });

    it('groups by branch for the central admin', async () => {
      const res = await getInventory(adminToken, { group_by: 'branch' });

      expect(res.body.data.map(r => [r.groupId, r.items, r.costValue, r.saleValue])).toEqual([
        [1,       6, 1148, 2090],
        [branch2, 1, 100,  150],
      ]);
    });

    it('paginates without changing the KPIs', async () => {
      const res = await getInventory(adminToken, { limit: 2, page: 2 });

      expect(rowNames(res)).toEqual(['Refresco', 'Muestra']);
      expect(res.body.pagination).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
      expect(res.body.summary.available).toEqual(AVAILABLE);
    });
  });

  describe('alerts', () => {
    it('counts items without cost, priced below cost and inactive with stock', async () => {
      const res = await getInventory(adminToken);
      const { alerts } = res.body.summary;

      expect(alerts.noCost).toMatchObject({ items: 2, saleValue: 250 });
      expect(alerts.belowCost).toMatchObject({ items: 1, costValue: 48 });
      expect(alerts.inactive).toMatchObject({ items: 2, units: [{ uom: 'pza', quantity: 7 }], costValue: 1100 });
    });

    it('shows only the items of each alert in the table, without changing the KPIs', async () => {
      const [noCost, belowCost, inactive] = await Promise.all([
        getInventory(adminToken, { alert: 'no_cost' }),
        getInventory(adminToken, { alert: 'below_cost' }),
        getInventory(adminToken, { alert: 'inactive' }),
      ]);

      expect(rowNames(noCost)).toEqual(['Muestra', 'Queso']);
      expect(rowNames(belowCost)).toEqual(['Refresco']);
      // En la vista de inactivos, Tenis suma solo la talla 28
      expect(inactive.body.data.map(r => [r.name, r.units, r.costValue])).toEqual([
        ['Tenis', 3, 900],
        ['Inactivo', 4, 200],
      ]);
      expect(inactive.body.summary.available).toEqual(AVAILABLE);
    });

    it('shows the items without cost in their view even with exclude_no_cost', async () => {
      const res = await getInventory(adminToken, { alert: 'no_cost', exclude_no_cost: 'true' });

      expect(rowNames(res)).toEqual(['Muestra', 'Queso']);
    });
  });

  describe('branch scope', () => {
    it('shows a branch user only their branch, even if they send another branch_id', async () => {
      const res = await getInventory(supervisorToken, { branch_id: branch2 });

      expect(res.body.summary.available).toMatchObject({ items: 6, costValue: 1148, saleValue: 2090 });
      expect(res.body.summary.reserved).toMatchObject({ items: 2, costValue: 340, saleValue: 560 });
    });

    it('lets the central admin filter by a branch', async () => {
      const res = await getInventory(adminToken, { branch_id: branch2 });

      expect(res.body.summary.available).toMatchObject({ items: 1, costValue: 100, saleValue: 150 });
      expect(res.body.summary.reserved).toMatchObject({ items: 1, costValue: 0, saleValue: 100 });
    });

    it('responds 400 to a branch user who groups by branch', async () => {
      const res = await getInventory(supervisorToken, { group_by: 'branch' });

      expect(res.status).toBe(400);
    });
  });
});
