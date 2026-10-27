// tests/integration/reports/rotation.test.js
// Reporte de Rotación de inventario (spec 10, T2). Las ventas, los apartados,
// el stock y los movimientos se guardan directo en la BD para fijar sus
// fechas. "Hoy" queda congelado en el martes 30 de junio de 2026 (solo se
// simula Date); el periodo de 30 días va del 1 al 30 de junio.
//
// Sucursales: 1 Central, Norte (activa) y Sur (inactiva). Categorías de los
// seeds: 2 Abarrotes, 5 Bebidas, 6 Papelería.
//
// Productos sin movimiento con 30 días (costo / precio, stock, última venta):
//   A Arroz    20 / 30, Abarrotes, prov. 2: Central 10, venta 31 may 23:30 → 30 días
//              (una cancelada el 20 jun no cuenta). En Norte (5) se vendió el
//              15 y el 20 jun → traspaso a Norte, 2 ventas.
//   C Lenteja  25 / 30, Abarrotes, prov. 2: 2, venta 1 abr → 90 días, rebaja
//              30% topada en el costo. Se vendió en Norte 1 vez y en Sur
//              (inactiva) 3 → traspaso a Norte.
//   D Tenis   300 / 500, Papelería: tallas 26 (1) y 27 (2); la 28, inactiva,
//              no cuenta. Venta de la 27 el 1 abr y sin variante el 1 may → 60 días.
//   E Queso     0 / 100 kg, sin categoría: 2.5, nunca vendido, primer
//              movimiento el 15 may → 46 días, sin costo.
//   F Jabón    12 / 10, Bebidas: 5, venta devuelta (refunded) el 1 mar → 121
//              días. Un apartado cancelado el 28 jun no cuenta.
//   G Vela      8 / 20, Bebidas: Central 3 y Norte 4, nunca vendido, sin
//              movimientos, alta el 31 dic 2025 → 181 días (dos filas).
//   H Cera      5 / 9, Bebidas: 6, nunca vendido, su primer movimiento ya
//              tenía existencias → alta el 1 ene 2026, 180 días.
//   J Pila      1 / 12.35, Papelería: 10, venta 2 may → 59 días, rebaja 11.12.
//   K Foco     10 / 100, Papelería: 1, venta 2 abr → 89 días.
// No entran: B Frijol (venta 1 jun 00:30 → 29 días), L Leche (apartado activo
// el 25 jun), I Inactivo, Arroz en Norte y los productos de la promoción.
//
// Promoción de Abarrotes en Central (ventas del periodo, con stock): Azúcar
// 3, Harina 2, Sal 2, Frijol 1. Avena (5) no tiene stock, Pasta (9) está
// inactiva y Maíz solo se vendió en Norte.
//
// Con 30 días, consolidado: 10 filas, 4 nunca vendidas, 44 pza + 2.5 kg,
// costo 1,316, venta 2,577.50. Todo el disponible vale 1,721 al costo
// (+ Arroz Norte 100, Frijol 40, Leche 15, Azúcar 100, Sal, Harina y Maíz 50).
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }        = require('../../helpers/auth');
const { createTestUser } = require('../../helpers/users');
const { toServerDayStart } = require('../../../src/utils/timezone');

// Solo Date: los timers reales siguen funcionando para mysql2 y supertest
const REAL_TIMERS = [
  'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate',
  'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
];
// 12:00 de México del martes 30 de junio de 2026
const TODAY = new Date('2026-06-30T18:00:00Z');

let admin;
let adminToken;
let supervisorToken;
let cashierToken;
let storekeeperToken;
let norte;
let sur;
let provider2;
const products = {};

const getRotation = (token, query = {}) =>
  request(app)
    .get('/api/reports/rotation')
    .query(query)
    .set('Authorization', `Bearer ${token}`);

// Fecha y hora de México → hora del servidor
const serverTime = async (day, at = '12:00') => {
  const [h, m] = at.split(':').map(Number);
  const [[{ value }]] = await db.query(
    "SELECT DATE_FORMAT(DATE_ADD(?, INTERVAL ? MINUTE), '%Y-%m-%d %H:%i:%s') AS value",
    [await toServerDayStart(day), h * 60 + m]
  );
  return value;
};

// createdAt: día de alta en México. Por defecto el 1 de junio, así que un
// producto sin ventas ni movimientos tiene 29 días y no entra con 30.
const createProduct = async ({
  name, cost, price, categoryId = null, providerId = 1, uom = 'pza', isActive = 1, variants = [],
  createdAt = '2026-06-01',
}) => {
  const [result] = await db.query(
    `INSERT INTO products (provider_id, category_id, is_variable, sku, name, purchase_price, sale_price, uom, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [providerId, categoryId, variants.length > 0 ? 1 : 0, name.toUpperCase(), name, cost, price, uom, isActive,
      await serverTime(createdAt)]
  );
  const variantIds = {};
  for (const { label, sku = null, isActive: variantActive = 1 } of variants) {
    const [variant] = await db.query(
      'INSERT INTO product_variants (product_id, sku, label, is_active) VALUES (?, ?, ?, ?)',
      [result.insertId, sku, label, variantActive]
    );
    variantIds[label] = variant.insertId;
  }
  return { productId: result.insertId, variantIds, name };
};

const setStock = (branchId, product, quantity, variantId = null) =>
  db.query(
    'INSERT INTO inventory_stock (branch_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)',
    [branchId, product.productId, variantId, quantity]
  );

// Venta de una línea guardada directo en la BD. day/at: fecha y hora de México.
const insertSale = async ({ product, day, at = '12:00', branchId = 1, status = 'completed', variantId = null }) => {
  const [order] = await db.query(
    `INSERT INTO orders (branch_id, cash_register_id, customer_id, user_id, subtotal, discount, total, status, created_at)
     VALUES (?, 1, 1, ?, 10, 0, 10, ?, ?)`,
    [branchId, admin.userId, status, await serverTime(day, at)]
  );
  await db.query(
    `INSERT INTO order_details (order_id, product_id, variant_id, quantity, unit_price, purchase_price, discount, subtotal)
     VALUES (?, ?, ?, 1, 10, 0, 0, 10)`,
    [order.insertId, product.productId, variantId]
  );
};

const insertSales = async (count, sale) => {
  for (let i = 0; i < count; i++) await insertSale(sale);
};

const insertLayaway = async ({ product, day, branchId = 1, status = 'active' }) => {
  const [layaway] = await db.query(
    `INSERT INTO layaways (customer_id, branch_id, user_id, total_amount, amount_paid, balance, status, created_at)
     VALUES (1, ?, ?, 10, 0, 10, ?, ?)`,
    [branchId, admin.userId, status, await serverTime(day)]
  );
  await db.query(
    `INSERT INTO layaway_details (layaway_id, product_id, variant_id, quantity, unit_price, purchase_price)
     VALUES (?, ?, NULL, 1, 10, 0)`,
    [layaway.insertId, product.productId]
  );
};

const insertMovement = async ({ product, day, before, after, branchId = 1 }) =>
  db.query(
    `INSERT INTO inventory_movements
       (branch_id, product_id, variant_id, operation_type, quantity, quantity_before, quantity_after, user_id, created_at)
     VALUES (?, ?, NULL, 'entry', ?, ?, ?, ?, ?)`,
    [branchId, product.productId, after - before, before, after, admin.userId, await serverTime(day)]
  );

beforeAll(async () => {
  jest.useFakeTimers({ now: TODAY, doNotFake: REAL_TIMERS });

  const [n] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Norte', 1)");
  norte = n.insertId;
  const [s] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Sur', 0)");
  sur = s.insertId;
  const [provider] = await db.query("INSERT INTO providers (name, is_active) VALUES ('Distribuidora Sur', 1)");
  provider2 = provider.insertId;

  admin = await createTestUser({ role: 'admin', branchId: null });
  const supervisor  = await createTestUser({ role: 'supervisor', branchId: 1 });
  const cashier     = await createTestUser({ role: 'cajero', branchId: 1 });
  const storekeeper = await createTestUser({ role: 'almacenista', branchId: 1 });
  [adminToken, supervisorToken, cashierToken, storekeeperToken] = await Promise.all([
    loginAs(admin), loginAs(supervisor), loginAs(cashier), loginAs(storekeeper),
  ]);

  const p = products;
  p.A = await createProduct({ name: 'Arroz',   cost: 20, price: 30, categoryId: 2, providerId: provider2 });
  p.B = await createProduct({ name: 'Frijol',  cost: 10, price: 30, categoryId: 2 });
  p.C = await createProduct({ name: 'Lenteja', cost: 25, price: 30, categoryId: 2, providerId: provider2 });
  p.D = await createProduct({
    name: 'Tenis', cost: 300, price: 500, categoryId: 6,
    variants: [{ label: '26', sku: 'TEN-26' }, { label: '27', sku: 'TEN-27' }, { label: '28', sku: 'TEN-28', isActive: 0 }],
  });
  p.E = await createProduct({ name: 'Queso',   cost: 0,  price: 100, uom: 'kg', createdAt: '2025-01-01' });
  p.F = await createProduct({ name: 'Jabón',   cost: 12, price: 10, categoryId: 5 });
  p.G = await createProduct({ name: 'Vela',    cost: 8,  price: 20, categoryId: 5, createdAt: '2025-12-31' });
  p.H = await createProduct({ name: 'Cera',    cost: 5,  price: 9,  categoryId: 5, createdAt: '2026-01-01' });
  p.J = await createProduct({ name: 'Pila',    cost: 1,  price: 12.35, categoryId: 6 });
  p.K = await createProduct({ name: 'Foco',    cost: 10, price: 100, categoryId: 6 });
  p.L = await createProduct({ name: 'Leche',   cost: 15, price: 20, categoryId: 5 });
  p.I = await createProduct({ name: 'Inactivo', cost: 50, price: 80, categoryId: 2, isActive: 0, createdAt: '2025-01-01' });
  // Productos de la promoción (Abarrotes)
  p.azucar = await createProduct({ name: 'Azúcar', cost: 10, price: 15, categoryId: 2 });
  p.sal    = await createProduct({ name: 'Sal',    cost: 5,  price: 8,  categoryId: 2 });
  p.harina = await createProduct({ name: 'Harina', cost: 5,  price: 8,  categoryId: 2 });
  p.avena  = await createProduct({ name: 'Avena',  cost: 5,  price: 8,  categoryId: 2 });
  p.pasta  = await createProduct({ name: 'Pasta',  cost: 5,  price: 8,  categoryId: 2, isActive: 0 });
  p.maiz   = await createProduct({ name: 'Maíz',   cost: 5,  price: 8,  categoryId: 2 });

  await setStock(1, p.A, 10);
  await setStock(norte, p.A, 5);
  await setStock(1, p.B, 4);
  await setStock(1, p.C, 2);
  await setStock(1, p.D, 1, p.D.variantIds['26']);
  await setStock(1, p.D, 2, p.D.variantIds['27']);
  await setStock(1, p.D, 3, p.D.variantIds['28']);
  await setStock(1, p.E, 2.5);
  await setStock(1, p.F, 5);
  await setStock(1, p.G, 3);
  await setStock(norte, p.G, 4);
  await setStock(1, p.H, 6);
  await setStock(1, p.J, 10);
  await setStock(1, p.K, 1);
  await setStock(1, p.L, 1);
  await setStock(1, p.I, 4);
  for (const key of ['azucar', 'sal', 'harina', 'pasta', 'maiz']) await setStock(1, p[key], 10);
  await setStock(1, p.avena, 0);

  await insertSale({ product: p.A, day: '2026-05-31', at: '23:30' });
  await insertSale({ product: p.A, day: '2026-06-20', status: 'cancelled' });
  await insertSale({ product: p.A, day: '2026-06-15', branchId: norte });
  await insertSale({ product: p.A, day: '2026-06-20', branchId: norte });
  await insertSale({ product: p.B, day: '2026-06-01', at: '00:30' });
  await insertSale({ product: p.C, day: '2026-04-01' });
  await insertSale({ product: p.C, day: '2026-06-18', branchId: norte });
  await insertSales(3, { product: p.C, day: '2026-06-10', branchId: sur });
  await insertSale({ product: p.D, day: '2026-04-01', variantId: p.D.variantIds['27'] });
  await insertSale({ product: p.D, day: '2026-05-01' });
  await insertSale({ product: p.F, day: '2026-03-01', status: 'refunded' });
  await insertSale({ product: p.J, day: '2026-05-02' });
  await insertSale({ product: p.K, day: '2026-04-02' });
  await insertSale({ product: p.L, day: '2026-02-01' });
  await insertSales(3,  { product: p.azucar, day: '2026-06-10' });
  await insertSales(2,  { product: p.sal,    day: '2026-06-13' });
  await insertSales(2,  { product: p.harina, day: '2026-06-15' });
  await insertSales(5,  { product: p.avena,  day: '2026-06-16' });
  await insertSales(9,  { product: p.pasta,  day: '2026-06-17' });
  await insertSales(10, { product: p.maiz,   day: '2026-06-18', branchId: norte });

  await insertLayaway({ product: p.L, day: '2026-06-25' });
  await insertLayaway({ product: p.F, day: '2026-06-28', status: 'cancelled' });

  await insertMovement({ product: p.E, day: '2026-05-15', before: 0, after: 2.5 });
  await insertMovement({ product: p.E, day: '2026-06-10', before: 2.5, after: 2.5 });
  await insertMovement({ product: p.H, day: '2026-06-10', before: 4, after: 6 });
});

afterAll(() => {
  jest.useRealTimers();
});

const rowNames = (res) => res.body.data.map(r => r.name);
const rowOf = (res, name, branchId = 1) => res.body.data.find(r => r.name === name && r.branchId === branchId);

describe('GET /api/reports/rotation', () => {
  describe('access', () => {
    it('responds 403 to a cashier', async () => {
      const res = await getRotation(cashierToken);

      expect(res.status).toBe(403);
    });

    it('responds 200 to a storekeeper', async () => {
      const res = await getRotation(storekeeperToken);

      expect(res.status).toBe(200);
    });

    it.each([
      ['an unknown period', { days: 45 }],
      ['a period that is not a number', { days: '30x' }],
      ['an unknown sort_by', { sort_by: 'units' }],
      ['an unknown sort_dir', { sort_dir: 'up' }],
      ['an invalid category_id', { category_id: 'abc' }],
      ['an invalid provider_id', { provider_id: '0' }],
      ['an invalid excluded category', { exclude_category_ids: '6,x' }],
      ['category_id together with excluded categories', { category_id: 2, exclude_category_ids: '6' }],
    ])('responds 400 to %s', async (_, query) => {
      const res = await getRotation(adminToken, query);

      expect(res.status).toBe(400);
    });
  });

  describe('summary', () => {
    it('counts the products without sales in 30 days, with units, values and share of the inventory', async () => {
      const res = await getRotation(adminToken);

      expect(res.status).toBe(200);
      expect(res.body.summary).toEqual({
        days:      30,
        today:     '2026-06-30',
        products:  10,
        neverSold: 4,
        units:     [{ uom: 'pza', quantity: 44 }, { uom: 'kg', quantity: 2.5 }],
        costValue: 1316,
        saleValue: 2577.5,
        availableCostValue: 1721,
        share:     76.47,
        noCost:    { products: 1, saleValue: 250 },
      });
    });

    it.each([
      [60,  7, ['Tenis', 'Jabón', 'Lenteja', 'Vela', 'Cera', 'Vela', 'Foco']],
      [90,  5, ['Jabón', 'Lenteja', 'Vela', 'Cera', 'Vela']],
      [180, 3, ['Vela', 'Cera', 'Vela']],
    ])('with %i days lists only the products with that many days or more', async (days, products, names) => {
      const res = await getRotation(adminToken, { days });

      expect(res.body.summary.products).toBe(products);
      expect(rowNames(res)).toEqual(names);
    });

    it('lists a product in two branches in two rows', async () => {
      const res = await getRotation(adminToken, { search: 'vela' });

      expect(res.body.data.map(r => [r.branchName, r.units])).toEqual([['Sucursal Norte', 4], ['Sucursal Central', 3]]);
      expect(res.body.summary.products).toBe(2);
    });
  });

  describe('days without sales', () => {
    it('counts a sale at 23:30 in Mexico on its own day, and a cancelled order does not count', async () => {
      const res = await getRotation(adminToken, { search: 'arroz' });

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ branchId: 1, lastSale: '2026-05-31', days: 30, neverSold: false });
    });

    it('leaves out a product sold 29 days ago and one with an active layaway', async () => {
      const res = await getRotation(adminToken);

      expect(rowNames(res)).not.toContain('Frijol');
      expect(rowNames(res)).not.toContain('Leche');
      expect(rowNames(res)).not.toContain('Inactivo');
    });

    it('adds a sale of a variant and a sale without variant to the same product', async () => {
      const res = await getRotation(adminToken);

      expect(rowOf(res, 'Tenis')).toMatchObject({ lastSale: '2026-05-01', days: 60, units: 3, costValue: 900 });
    });

    it('counts a refunded order, but not a cancelled layaway', async () => {
      const res = await getRotation(adminToken);

      expect(rowOf(res, 'Jabón')).toMatchObject({ lastSale: '2026-03-01', days: 121 });
    });

    it('counts a product never sold from its first movement', async () => {
      const res = await getRotation(adminToken);

      expect(rowOf(res, 'Queso')).toMatchObject({ lastSale: null, neverSold: true, days: 46 });
    });

    it('counts from the product creation when there are no movements or the first one already had stock', async () => {
      const res = await getRotation(adminToken);

      expect(rowOf(res, 'Vela')).toMatchObject({ lastSale: null, neverSold: true, days: 181 });
      expect(rowOf(res, 'Cera')).toMatchObject({ lastSale: null, neverSold: true, days: 180 });
    });
  });

  describe('discount', () => {
    it.each([
      ['Arroz',   { reason: null, percent: 10, price: 30,    suggestedPrice: 27,    cappedByCost: false }],
      ['Pila',    { reason: null, percent: 10, price: 12.35, suggestedPrice: 11.12, cappedByCost: false }],
      ['Tenis',   { reason: null, percent: 20, price: 500,   suggestedPrice: 400,   cappedByCost: false }],
      ['Foco',    { reason: null, percent: 20, price: 100,   suggestedPrice: 80,    cappedByCost: false }],
      ['Lenteja', { reason: null, percent: 16.67, price: 30, suggestedPrice: 25,    cappedByCost: true }],
      ['Cera',    { reason: null, percent: 30, price: 9,     suggestedPrice: 6.3,   cappedByCost: false }],
      ['Queso',   { reason: 'no_cost' }],
      ['Jabón',   { reason: 'price_not_above_cost' }],
    ])('suggests the discount of %s', async (name, discount) => {
      const res = await getRotation(adminToken);

      expect(rowOf(res, name).suggestions.discount).toEqual(discount);
    });
  });

  describe('promotion', () => {
    it('suggests the 3 products of the category with most orders in the branch and the period, with stock', async () => {
      // Frijol (1 venta) queda cuarto; Avena no tiene stock, Pasta está
      // inactiva y Maíz solo se vendió en Norte
      const res = await getRotation(adminToken);

      expect(rowOf(res, 'Arroz').suggestions.promotion.map(p => p.name)).toEqual(['Azúcar', 'Harina', 'Sal']);
      expect(rowOf(res, 'Lenteja').suggestions.promotion.map(p => p.name)).toEqual(['Azúcar', 'Harina', 'Sal']);
    });

    it('suggests nothing for a product without category or a category without sales', async () => {
      const res = await getRotation(adminToken);

      expect(rowOf(res, 'Queso').suggestions.promotion).toEqual([]);
      expect(rowOf(res, 'Tenis').suggestions.promotion).toEqual([]);
    });
  });

  describe('transfer', () => {
    it('suggests the active branch with most sales in the period', async () => {
      // Lenteja se vendió más en Sur, pero está inactiva
      const res = await getRotation(adminToken);

      expect(rowOf(res, 'Arroz').suggestions.transfer).toEqual({ branchId: norte, name: 'Sucursal Norte', sales: 2 });
      expect(rowOf(res, 'Lenteja').suggestions.transfer).toEqual({ branchId: norte, name: 'Sucursal Norte', sales: 1 });
      expect(rowOf(res, 'Tenis').suggestions.transfer).toBeNull();
    });

    it('is also suggested to a branch user', async () => {
      const res = await getRotation(supervisorToken, { search: 'arroz' });

      expect(res.body.data[0].suggestions.transfer).toMatchObject({ name: 'Sucursal Norte', sales: 2 });
    });
  });

  describe('filters', () => {
    it('filters by category', async () => {
      const res = await getRotation(adminToken, { category_id: 5 });

      expect(rowNames(res)).toEqual(['Jabón', 'Vela', 'Cera', 'Vela']);
    });

    it('filters by provider', async () => {
      const res = await getRotation(adminToken, { provider_id: provider2 });

      expect(rowNames(res)).toEqual(['Arroz', 'Lenteja']);
      expect(res.body.summary.costValue).toBe(250);
    });

    it('finds a product by the SKU of a variant', async () => {
      const res = await getRotation(adminToken, { search: 'TEN-27' });

      expect(rowNames(res)).toEqual(['Tenis']);
    });

    it('leaves the excluded categories out of the summary and the list', async () => {
      const res = await getRotation(adminToken, { exclude_category_ids: '2' });

      expect(res.body.summary).toMatchObject({ products: 8, costValue: 1066 });
      expect(rowNames(res)).not.toContain('Arroz');
      expect(rowNames(res)).not.toContain('Lenteja');
    });

    it('leaves the products without cost out with exclude_no_cost, and still counts them for the notice', async () => {
      const res = await getRotation(adminToken, { exclude_no_cost: 'true' });

      expect(res.body.summary).toMatchObject({
        products: 9, neverSold: 3, units: [{ uom: 'pza', quantity: 44 }], saleValue: 2327.5,
        noCost: { products: 1, saleValue: 250 },
      });
      expect(rowNames(res)).not.toContain('Queso');
    });
  });

  describe('order and pages', () => {
    it('sorts by cost value, then by days and name', async () => {
      // Foco y Pila valen 10: Foco tiene más días
      const res = await getRotation(adminToken);

      expect(rowNames(res)).toEqual(['Tenis', 'Arroz', 'Jabón', 'Lenteja', 'Vela', 'Cera', 'Vela', 'Foco', 'Pila', 'Queso']);
    });

    it('sorts by days in both directions, breaking ties by name and branch', async () => {
      const desc = await getRotation(adminToken, { sort_by: 'days' });
      const asc  = await getRotation(adminToken, { sort_by: 'days', sort_dir: 'asc' });

      expect(desc.body.data.map(r => `${r.name} ${r.branchId === 1 ? 'C' : 'N'}`).slice(0, 3))
        .toEqual(['Vela C', 'Vela N', 'Cera C']);
      expect(rowNames(asc)).toEqual(['Arroz', 'Queso', 'Pila', 'Tenis', 'Foco', 'Lenteja', 'Jabón', 'Cera', 'Vela', 'Vela']);
    });

    it('pages the list without changing the summary', async () => {
      const res = await getRotation(adminToken, { sort_by: 'days', limit: 3, page: 2 });

      expect(rowNames(res)).toEqual(['Jabón', 'Lenteja', 'Foco']);
      expect(res.body.pagination).toEqual({ page: 2, limit: 3, total: 10, totalPages: 4 });
      expect(res.body.summary.products).toBe(10);
    });
  });

  describe('branch scope', () => {
    it('shows a branch user only their branch, even sending another branch_id', async () => {
      const res = await getRotation(supervisorToken, { branch_id: norte });

      expect(res.body.data.every(r => r.branchId === 1)).toBe(true);
      expect(res.body.summary).toMatchObject({ products: 9, costValue: 1284, availableCostValue: 1589 });
    });

    it('lets the central admin filter by a branch', async () => {
      const res = await getRotation(adminToken, { branch_id: norte });

      expect(res.body.data.map(r => [r.name, r.branchId])).toEqual([['Vela', norte]]);
      expect(res.body.summary).toMatchObject({ products: 1, costValue: 32, availableCostValue: 132 });
    });
  });
});
