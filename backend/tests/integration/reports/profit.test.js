// tests/integration/reports/profit.test.js
// Reporte de Ventas y utilidad (spec 04, T2). Las ventas se guardan directo
// en la BD, con la forma que dejan orderService.createOrder y
// returnService.createReturn, para fijar su hora exacta.
//
// Ventas del 2026-03-10 (hora de México); costos A 40, B 20, C 0, V 10:
//   #1 suc. 1: A ×2 a $100 + B ×1 a $50, descuento de orden 10% (total 225).
//      Devolución de 1 A con reembolso de $80 (tarifa de restock de $20).
//        A: 200 × 0.9 − 80 = 100, 1 unidad, costo 40
//        B:  50 × 0.9      =  45, 1 unidad, costo 20
//   #2 suc. 1: C ×1.5 kg a $60 = 90, sin costo
//   #3 suc. 1: A ×5 a $100, cancelada (no cuenta)
//   #4 suc. 2: A ×1 a $100 = 100, costo 40
//   #5 suc. 1: V talla S ×1 + talla M ×2 a $30 = 90, costo 30
//   #6 suc. 1, 23:30: B ×2 a $50 = 100, costo 40
//
// Por producto: A 200/80/120 · B 145/60/85 · C 90/0/90 · V 90/30/60
// Consolidado: venta 525, costo 170, utilidad 355; sucursal 1: 425/130/295.
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }           = require('../../helpers/auth');
const { createTestUser }    = require('../../helpers/users');
const { createTestProduct, paymentMethodId } = require('../../helpers/sales');
const { toServerDayStart }  = require('../../../src/utils/timezone');

const DAY = '2026-03-10';

let seller;
let adminToken;
let supervisorToken;
let cashierToken;
let branch2;
let provider2;
const products = {};

const getProfit = (token, query = {}) =>
  request(app)
    .get('/api/reports/profit')
    .query({ start_date: DAY, end_date: DAY, ...query })
    .set('Authorization', `Bearer ${token}`);

// Venta guardada directo en la BD. at: hora de México 'HH:MM' del día DAY.
const insertSale = async ({ branchId = 1, registerId = 1, at = '12:00', discount = 0, status = 'completed', lines }) => {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const [h, m]   = at.split(':').map(Number);
  const [order]  = await db.query(
    `INSERT INTO orders (branch_id, cash_register_id, customer_id, user_id, subtotal, discount, total, status, created_at)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?, DATE_ADD(?, INTERVAL ? MINUTE))`,
    [branchId, registerId, seller.userId, subtotal, discount, subtotal - discount, status,
      await toServerDayStart(DAY), h * 60 + m]
  );
  for (const l of lines) {
    await db.query(
      `INSERT INTO order_details (order_id, product_id, variant_id, quantity, unit_price, purchase_price, discount, subtotal)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [order.insertId, l.product.productId, l.variantId ?? null, l.quantity, l.unitPrice,
        l.product.purchasePrice, l.quantity * l.unitPrice]
    );
  }
  return order.insertId;
};

// Devolución parcial: guarda el precio de lista de la línea y lo reembolsado
const insertReturn = async ({ orderId, product, quantity, unitPrice, amountRefunded }) => {
  const [ret] = await db.query(
    `INSERT INTO returns (order_id, branch_id, customer_id, user_id, amount_refunded, refund_method, payment_method_id, status)
     VALUES (?, 1, 1, ?, ?, 'cash', ?, 'completed')`,
    [orderId, seller.userId, amountRefunded, await paymentMethodId('cash')]
  );
  await db.query(
    'INSERT INTO return_details (return_id, product_id, variant_id, quantity, unit_price) VALUES (?, ?, NULL, ?, ?)',
    [ret.insertId, product.productId, quantity, unitPrice]
  );
  await db.query("UPDATE orders SET status = 'partial_refund' WHERE order_id = ?", [orderId]);
};

const createProduct = async ({ name, purchasePrice, categoryId, providerId, uom = 'pza', variants = [] }) => {
  const product = await createTestProduct({ purchasePrice, variants });
  await db.query(
    'UPDATE products SET name = ?, category_id = ?, provider_id = ?, uom = ? WHERE product_id = ?',
    [name, categoryId, providerId, uom, product.productId]
  );
  return product;
};

beforeAll(async () => {
  const [branch] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Norte', 1)");
  branch2 = branch.insertId;
  const [register] = await db.query(
    "INSERT INTO cash_registers (branch_id, name, is_active) VALUES (?, 'Caja Norte', 1)", [branch2]
  );
  const [provider] = await db.query("INSERT INTO providers (name, is_active) VALUES ('Distribuidora Sur', 1)");
  provider2 = provider.insertId;

  // Categorías de los seeds: 2 Abarrotes, 5 Bebidas
  products.A = await createProduct({ name: 'Playera',  purchasePrice: 40, categoryId: 2,    providerId: provider2 });
  products.B = await createProduct({ name: 'Refresco', purchasePrice: 20, categoryId: 5,    providerId: provider2 });
  products.C = await createProduct({ name: 'Queso',    purchasePrice: 0,  categoryId: null, providerId: 1, uom: 'kg' });
  products.V = await createProduct({ name: 'Calcetín', purchasePrice: 10, categoryId: 2,    providerId: 1, variants: ['S', 'M'] });

  const supervisor = await createTestUser({ role: 'supervisor', branchId: 1 });
  const admin      = await createTestUser({ role: 'admin', branchId: null });
  const cashier    = await createTestUser({ role: 'cajero', branchId: 1 });
  seller = supervisor;
  [supervisorToken, adminToken, cashierToken] = await Promise.all([
    loginAs(supervisor), loginAs(admin), loginAs(cashier),
  ]);

  const { A, B, C, V } = products;
  const order1 = await insertSale({
    discount: 25,
    lines: [
      { product: A, quantity: 2, unitPrice: 100 },
      { product: B, quantity: 1, unitPrice: 50 },
    ],
  });
  await insertReturn({ orderId: order1, product: A, quantity: 1, unitPrice: 100, amountRefunded: 80 });
  await insertSale({ lines: [{ product: C, quantity: 1.5, unitPrice: 60 }] });
  await insertSale({ status: 'cancelled', lines: [{ product: A, quantity: 5, unitPrice: 100 }] });
  await insertSale({ branchId: branch2, registerId: register.insertId, lines: [{ product: A, quantity: 1, unitPrice: 100 }] });
  await insertSale({
    lines: [
      { product: V, variantId: V.variantIds[0], quantity: 1, unitPrice: 30 },
      { product: V, variantId: V.variantIds[1], quantity: 2, unitPrice: 30 },
    ],
  });
  await insertSale({ at: '23:30', lines: [{ product: B, quantity: 2, unitPrice: 50 }] });
});

describe('GET /api/reports/profit', () => {
  describe('access', () => {
    it('responds 403 to a cashier', async () => {
      const res = await getProfit(cashierToken);

      expect(res.status).toBe(403);
    });

    it('responds 400 without dates', async () => {
      const res = await request(app).get('/api/reports/profit').set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('calculation', () => {
    it('computes the KPIs with order discount, partial return with restock fee and without the cancelled sale', async () => {
      const res = await getProfit(adminToken);

      expect(res.status).toBe(200);
      // Sin gastos registrados, la utilidad neta es la bruta (spec 13)
      expect(res.body.summary).toEqual({
        netSales: 525,
        cost:     170,
        profit:   355,
        margin:   67.62,
        noCost:   { lines: 1, netSales: 90 },
        net:      { expenses: 0, netProfit: 355, netMargin: 67.62, firstExpenseDate: null },
      });
    });

    it('matches the net sales of the Dashboard and of Sales → Sold products', async () => {
      const [profit, dashboard, sold] = await Promise.all([
        getProfit(adminToken),
        request(app).get('/api/dashboard')
          .query({ start_date: DAY, end_date: DAY, preset: 'custom' })
          .set('Authorization', `Bearer ${adminToken}`),
        request(app).get('/api/orders/sold-products')
          .query({ startDate: DAY, endDate: DAY })
          .set('Authorization', `Bearer ${adminToken}`),
      ]);

      expect(dashboard.body.data.kpis.income).toBe(profit.body.summary.netSales);
      expect(sold.body.totals.total_amount).toBeCloseTo(profit.body.summary.netSales, 2);
    });

    it('computes each product row by hand, summing variants into their product', async () => {
      const res = await getProfit(adminToken);
      const { A, B, C, V } = products;

      expect(res.body.data).toEqual([
        { groupId: A.productId, name: 'Playera',  sku: expect.any(String), units: 2,   uom: 'pza', netSales: 200, cost: 80, profit: 120, margin: 60,    noCost: { lines: 0, netSales: 0 } },
        { groupId: C.productId, name: 'Queso',    sku: expect.any(String), units: 1.5, uom: 'kg',  netSales: 90,  cost: 0,  profit: 90,  margin: 100,   noCost: { lines: 1, netSales: 90 } },
        { groupId: B.productId, name: 'Refresco', sku: expect.any(String), units: 3,   uom: 'pza', netSales: 145, cost: 60, profit: 85,  margin: 58.62, noCost: { lines: 0, netSales: 0 } },
        { groupId: V.productId, name: 'Calcetín', sku: expect.any(String), units: 3,   uom: 'pza', netSales: 90,  cost: 30, profit: 60,  margin: 66.67, noCost: { lines: 0, netSales: 0 } },
      ]);
    });

    it('counts a sale at 23:30 Mexico time on that day, not the next one', async () => {
      const sameDay = await getProfit(adminToken, { group_by: 'product' });
      const nextDay = await getProfit(adminToken, { start_date: '2026-03-11', end_date: '2026-03-11' });

      const refresco = sameDay.body.data.find(r => r.groupId === products.B.productId);
      expect(refresco.units).toBe(3);
      expect(nextDay.body.summary.netSales).toBe(0);
      expect(nextDay.body.data).toEqual([]);
    });
  });

  describe('sales without cost', () => {
    it('leaves them out of every figure when exclude_no_cost is on', async () => {
      const res = await getProfit(adminToken, { exclude_no_cost: 'true' });

      expect(res.body.summary).toEqual({
        netSales: 435,
        cost:     170,
        profit:   265,
        margin:   60.92,
        noCost:   { lines: 0, netSales: 0 },
        net:      { expenses: 0, netProfit: 265, netMargin: 60.92, firstExpenseDate: null },
      });
      expect(res.body.data.map(r => r.groupId)).not.toContain(products.C.productId);
    });
  });

  describe('grouping', () => {
    it('groups by category, with "Sin categoría" and the product count instead of units', async () => {
      const res = await getProfit(adminToken, { group_by: 'category' });

      expect(res.body.data).toEqual([
        { groupId: 2,    name: 'Abarrotes',     productCount: 2, netSales: 290, cost: 110, profit: 180, margin: 62.07,  noCost: { lines: 0, netSales: 0 } },
        { groupId: null, name: 'Sin categoría', productCount: 1, netSales: 90,  cost: 0,   profit: 90,  margin: 100,    noCost: { lines: 1, netSales: 90 } },
        { groupId: 5,    name: 'Bebidas',       productCount: 1, netSales: 145, cost: 60,  profit: 85,  margin: 58.62,  noCost: { lines: 0, netSales: 0 } },
      ]);
    });

    it('groups by branch of the sale', async () => {
      const res = await getProfit(adminToken, { group_by: 'branch' });

      expect(res.body.data).toEqual([
        { groupId: 1,       name: 'Sucursal Central', productCount: 4, netSales: 425, cost: 130, profit: 295, margin: 69.41, noCost: { lines: 1, netSales: 90 }, net: { expenses: 0, netProfit: 295 } },
        { groupId: branch2, name: 'Sucursal Norte',   productCount: 1, netSales: 100, cost: 40,  profit: 60,  margin: 60,    noCost: { lines: 0, netSales: 0 }, net: { expenses: 0, netProfit: 60 } },
      ]);
    });

    it('groups by the current provider of the product', async () => {
      const res = await getProfit(adminToken, { group_by: 'provider' });

      expect(res.body.data).toEqual([
        { groupId: provider2, name: 'Distribuidora Sur',  productCount: 2, netSales: 345, cost: 140, profit: 205, margin: 59.42, noCost: { lines: 0, netSales: 0 } },
        { groupId: 1,         name: 'Proveedor generico', productCount: 2, netSales: 180, cost: 30,  profit: 150, margin: 83.33, noCost: { lines: 1, netSales: 90 } },
      ]);
    });

    it('filters by category', async () => {
      const res = await getProfit(adminToken, { category_id: 2 });

      expect(res.body.summary).toMatchObject({ netSales: 290, cost: 110, profit: 180 });
      expect(res.body.data.map(r => r.name)).toEqual(['Playera', 'Calcetín']);
    });
  });

  describe('sorting and pagination', () => {
    it('sorts by margin ascending and by net sales descending', async () => {
      const byMargin = await getProfit(adminToken, { sort_by: 'margin', sort_dir: 'asc' });
      const bySales  = await getProfit(adminToken, { sort_by: 'net_sales', sort_dir: 'desc' });

      expect(byMargin.body.data.map(r => r.name)).toEqual(['Refresco', 'Playera', 'Calcetín', 'Queso']);
      // Queso y Calcetín empatan en $90: desempata el id del producto
      expect(bySales.body.data.map(r => r.name)).toEqual(['Playera', 'Refresco', 'Queso', 'Calcetín']);
    });

    it('paginates the rows without changing the KPIs', async () => {
      const page1 = await getProfit(adminToken, { limit: 2, page: 1 });
      const page2 = await getProfit(adminToken, { limit: 2, page: 2 });

      expect(page1.body.data.map(r => r.name)).toEqual(['Playera', 'Queso']);
      expect(page2.body.data.map(r => r.name)).toEqual(['Refresco', 'Calcetín']);
      expect(page1.body.pagination).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 });
      expect(page2.body.summary).toEqual(page1.body.summary);
    });

    it('rejects an unknown grouping or sort', async () => {
      const badGroup = await getProfit(adminToken, { group_by: 'cashier' });
      const badSort  = await getProfit(adminToken, { sort_by: 'units' });

      expect(badGroup.status).toBe(400);
      expect(badSort.status).toBe(400);
    });
  });

  describe('branch scope', () => {
    it('forces the branch of a user with an assigned branch, even if another branch_id is sent', async () => {
      const own   = await getProfit(supervisorToken);
      const other = await getProfit(supervisorToken, { branch_id: branch2, group_by: 'branch' });

      expect(own.body.summary).toMatchObject({ netSales: 425, cost: 130, profit: 295, margin: 69.41 });
      expect(other.body.data.map(r => r.groupId)).toEqual([1]);
    });

    it('shows the central admin the consolidated report and lets them filter by branch', async () => {
      const filtered = await getProfit(adminToken, { branch_id: branch2 });

      expect(filtered.body.summary).toMatchObject({ netSales: 100, cost: 40, profit: 60, margin: 60 });
    });
  });
});
