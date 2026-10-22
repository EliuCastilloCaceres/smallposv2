// tests/integration/reports/trend.test.js
// Reporte de Tendencia de ventas (spec 05, T2). Las ventas se guardan
// directo en la BD, como en profit.test.js, para fijar su hora exacta. "Hoy"
// queda congelado en el jueves 12 de marzo de 2026 (solo se simula Date).
//
// Ventas de marzo 2026 (A cuesta 40, Z no tiene costo):
//   S1 lun 02, suc. 1: A ×2 a $100 con 10% de descuento (total 180) y
//      devolución de 1 A por $80 → monto 100, utilidad 200×0.9 − 80 − 40 = 60
//   S2 jue 05 23:30, suc. 1: A ×1 → 100, utilidad 60
//   S3 jue 05, suc. 1: A ×3, cancelada (no cuenta)
//   S4 lun 09, suc. 2: A ×1 → 100, utilidad 60
//   S5 mar 10, suc. 1: Z ×1 a $50 → 50, utilidad 50, sin costo
//   S6 jue 12 (hoy), suc. 1: A ×1 → 100, utilidad 60
// Consolidado a la fecha: monto 450, 5 ventas, utilidad 290, ticket 90.
//
// Año anterior (por día, 364 días antes): jue 6 mar 2025 A ×1 → 100;
// jue 13 mar 2025 (= hoy − 364) A ×1 → 100; jue 20 mar 2025 A ×2 → 200.
// Otras: mar 30 dic 2025 y vie 2 ene 2026 A ×1, para las semanas parciales.
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }        = require('../../helpers/auth');
const { createTestUser } = require('../../helpers/users');
const { createTestProduct, paymentMethodId } = require('../../helpers/sales');
const { toServerDayStart } = require('../../../src/utils/timezone');

// Solo Date: los timers reales siguen funcionando para mysql2 y supertest
const REAL_TIMERS = [
  'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate',
  'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
];
// 12:00 de México del jueves 12 de marzo de 2026
const TODAY = new Date('2026-03-12T18:00:00Z');

let seller;
let admin;
let adminToken;
let supervisorToken;
let cashierToken;
let branch2;
let productA;
let productZ;

const getTrend = (token, query) =>
  request(app)
    .get('/api/reports/trend')
    .query(query)
    .set('Authorization', `Bearer ${token}`);

const MARCH = { start_date: '2026-03-01', end_date: '2026-03-31' };

// Venta guardada directo en la BD. day/at: fecha y hora de México.
const insertSale = async ({ day, at = '12:00', branchId = 1, registerId = 1, discount = 0, status = 'completed', product = productA, quantity = 1, unitPrice = 100 }) => {
  const [h, m]   = at.split(':').map(Number);
  const subtotal = quantity * unitPrice;
  const [order]  = await db.query(
    `INSERT INTO orders (branch_id, cash_register_id, customer_id, user_id, subtotal, discount, total, status, created_at)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?, DATE_ADD(?, INTERVAL ? MINUTE))`,
    [branchId, registerId, seller.userId, subtotal, discount, subtotal - discount, status,
      await toServerDayStart(day), h * 60 + m]
  );
  await db.query(
    `INSERT INTO order_details (order_id, product_id, variant_id, quantity, unit_price, purchase_price, discount, subtotal)
     VALUES (?, ?, NULL, ?, ?, ?, 0, ?)`,
    [order.insertId, product.productId, quantity, unitPrice, product.purchasePrice, subtotal]
  );
  return order.insertId;
};

const values = (periods, metric) => periods.map(p => p[metric]);

beforeAll(async () => {
  jest.useFakeTimers({ now: TODAY, doNotFake: REAL_TIMERS });

  const [branch] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Norte', 1)");
  branch2 = branch.insertId;
  const [register] = await db.query(
    "INSERT INTO cash_registers (branch_id, name, is_active) VALUES (?, 'Caja Norte', 1)", [branch2]
  );

  productA = await createTestProduct({ purchasePrice: 40, salePrice: 100 });
  productZ = await createTestProduct({ purchasePrice: 0, salePrice: 50 });

  const supervisor = await createTestUser({ role: 'supervisor', branchId: 1 });
  admin            = await createTestUser({ role: 'admin', branchId: null });
  const cashier    = await createTestUser({ role: 'cajero', branchId: 1 });
  seller = supervisor;
  [supervisorToken, adminToken, cashierToken] = await Promise.all([
    loginAs(supervisor), loginAs(admin), loginAs(cashier),
  ]);

  const s1 = await insertSale({ day: '2026-03-02', quantity: 2, discount: 20 });
  const [ret] = await db.query(
    `INSERT INTO returns (order_id, branch_id, customer_id, user_id, amount_refunded, refund_method, payment_method_id, status)
     VALUES (?, 1, 1, ?, 80, 'cash', ?, 'completed')`,
    [s1, seller.userId, await paymentMethodId('cash')]
  );
  await db.query(
    'INSERT INTO return_details (return_id, product_id, variant_id, quantity, unit_price) VALUES (?, ?, NULL, 1, 100)',
    [ret.insertId, productA.productId]
  );
  await db.query("UPDATE orders SET status = 'partial_refund' WHERE order_id = ?", [s1]);

  await insertSale({ day: '2026-03-05', at: '23:30' });
  await insertSale({ day: '2026-03-05', status: 'cancelled', quantity: 3 });
  await insertSale({ day: '2026-03-09', branchId: branch2, registerId: register.insertId });
  await insertSale({ day: '2026-03-10', product: productZ, unitPrice: 50 });
  await insertSale({ day: '2026-03-12', at: '09:00' });

  await insertSale({ day: '2025-03-06' });
  await insertSale({ day: '2025-03-13', at: '10:00' });
  await insertSale({ day: '2025-03-20', quantity: 2 });
  await insertSale({ day: '2025-12-30' });
  await insertSale({ day: '2026-01-02' });
});

afterAll(() => {
  jest.useRealTimers();
});

describe('GET /api/reports/trend', () => {
  describe('access and validation', () => {
    it('responds 403 to a cashier', async () => {
      const res = await getTrend(cashierToken, MARCH);

      expect(res.status).toBe(403);
    });

    it('rejects a granularity beyond its limit and a range over 5 years', async () => {
      const day93   = await getTrend(adminToken, { start_date: '2026-01-01', end_date: '2026-04-03', granularity: 'day' });
      const day92   = await getTrend(adminToken, { start_date: '2026-01-01', end_date: '2026-04-02', granularity: 'day' });
      const week732 = await getTrend(adminToken, { start_date: '2024-01-01', end_date: '2026-01-01', granularity: 'week' });
      const tooLong = await getTrend(adminToken, { start_date: '2021-03-01', end_date: '2026-03-02' });

      expect(day93.status).toBe(400);
      expect(day92.status).toBe(200);
      expect(week732.status).toBe(400);
      expect(tooLong.status).toBe(400);
    });

    it('picks the granularity from the range when none is sent', async () => {
      const [days31, days32, days184] = await Promise.all([
        getTrend(adminToken, { start_date: '2026-01-01', end_date: '2026-01-31' }),
        getTrend(adminToken, { start_date: '2026-01-01', end_date: '2026-02-01' }),
        getTrend(adminToken, { start_date: '2025-09-29', end_date: '2026-03-31' }),
      ]);

      expect([days31.body.data.granularity, days32.body.data.granularity, days184.body.data.granularity])
        .toEqual(['day', 'week', 'month']);
    });
  });

  describe('periods and metrics', () => {
    let march;

    beforeAll(async () => {
      march = (await getTrend(adminToken, MARCH)).body.data;
    });

    it('computes each day by hand, with discount, partial return with restock fee and no cancelled sale', () => {
      const days = march.periods.slice(0, 12);

      expect(values(days, 'netSales')).toEqual([0, 100, 0, 0, 100, 0, 0, 0, 100, 50, 0, 100]);
      expect(values(days, 'orders')).toEqual([0, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1]);
      expect(values(days, 'profit')).toEqual([0, 60, 0, 0, 60, 0, 0, 0, 60, 50, 0, 60]);
    });

    it('counts a sale at 23:30 Mexico time on that day', () => {
      expect(march.periods[4]).toMatchObject({ start: '2026-03-05', netSales: 100, orders: 1 });
      expect(march.periods[5]).toMatchObject({ start: '2026-03-06', netSales: 0, orders: 0 });
    });

    it('leaves the ticket of a day without sales empty, and future days without any value', () => {
      expect(march.periods[2]).toMatchObject({ start: '2026-03-03', netSales: 0, avgTicket: null, future: false });
      expect(march.periods[12]).toMatchObject({
        start: '2026-03-13', future: true, netSales: null, orders: null, profit: null, avgTicket: null,
      });
      expect(march.periods).toHaveLength(31);
    });

    it('marks the current day', () => {
      expect(march.periods.filter(p => p.current).map(p => p.start)).toEqual(['2026-03-12']);
    });

    it('computes the KPIs to date, the average per period and the best period with ties going to the oldest', () => {
      expect(march.summary).toEqual({
        elapsedPeriods: 12,
        totals:   { netSales: 450, orders: 5, profit: 290, avgTicket: 90 },
        averages: { netSales: 37.5, orders: 0.42, profit: 24.17 },
        best: {
          netSales:  { index: 1, start: '2026-03-02', value: 100 },
          orders:    { index: 1, start: '2026-03-02', value: 1 },
          profit:    { index: 1, start: '2026-03-02', value: 60 },
          avgTicket: { index: 1, start: '2026-03-02', value: 100 },
        },
      });
    });

    it('reports the lines without cost to date', () => {
      expect(march.noCost).toEqual({ lines: 1, netSales: 50 });
    });

    it('matches the Dashboard KPIs and the profit of Sales and profit', async () => {
      const [dashboard, profit] = await Promise.all([
        request(app).get('/api/dashboard')
          .query({ start_date: '2026-03-01', end_date: '2026-03-31', preset: 'custom' })
          .set('Authorization', `Bearer ${adminToken}`),
        request(app).get('/api/reports/profit')
          .query({ start_date: '2026-03-01', end_date: '2026-03-31' })
          .set('Authorization', `Bearer ${adminToken}`),
      ]);
      const kpis = dashboard.body.data.kpis;

      expect(march.summary.totals.netSales).toBe(kpis.income);
      expect(march.summary.totals.orders).toBe(kpis.orders_total);
      expect(march.summary.totals.avgTicket).toBe(kpis.avg_ticket);
      expect(march.summary.totals.profit).toBe(profit.body.summary.profit);
    });
  });

  describe('weeks', () => {
    it('groups Monday to Sunday and only adds the days inside the range of a partial week', async () => {
      // Ene–mar 2026: el 1 de enero es jueves, así que la primera semana
      // (29 dic – 4 ene) es parcial y no suma la venta del 30 de diciembre
      const { body } = await getTrend(adminToken, { start_date: '2026-01-01', end_date: '2026-03-31' });
      const { periods } = body.data;

      expect(body.data.granularity).toBe('week');
      expect(periods.every(p => new Date(`${p.start}T12:00:00Z`).getUTCDay() === 1)).toBe(true);
      expect(periods[0]).toMatchObject({
        start: '2025-12-29', end: '2026-01-04', from: '2026-01-01', to: '2026-01-04', partial: true, netSales: 100,
      });
      expect(periods.find(p => p.start === '2026-03-02')).toMatchObject({ netSales: 200, orders: 2, partial: false });
      expect(periods.find(p => p.start === '2026-03-09')).toMatchObject({ netSales: 250, orders: 3, current: true });
      expect(periods.at(-1)).toMatchObject({ start: '2026-03-30', to: '2026-03-31', partial: true, future: true });
    });
  });

  describe('previous year', () => {
    it('aligns days 364 days back, Thursday against Thursday, with its KPIs to date', async () => {
      const { body } = await getTrend(adminToken, { ...MARCH, compare: 'previous_year' });
      const { previousYear, previousSummary, summary } = body.data;

      expect(previousYear.startDate).toBe('2025-03-02');
      expect(previousYear.periods[4]).toMatchObject({ start: '2025-03-06', netSales: 100 });
      expect(previousYear.periods[11]).toMatchObject({ start: '2025-03-13', netSales: 100 });
      // Los periodos futuros del año actual sí tienen valor en el anterior
      expect(previousYear.periods[17]).toMatchObject({ start: '2025-03-19', netSales: 0 });
      expect(previousYear.periods[18]).toMatchObject({ start: '2025-03-20', netSales: 200 });
      expect(body.data.periods[18]).toMatchObject({ start: '2026-03-19', future: true, netSales: null });

      // A la fecha: hasta hoy − 364 días (13 mar 2025), sin la venta del 20
      expect(previousSummary).toEqual({
        from: '2025-03-02',
        to:   '2025-03-13',
        totals:   { netSales: 200, orders: 2, profit: 120, avgTicket: 100 },
        averages: { netSales: 16.67, orders: 0.17, profit: 10 },
      });
      // El mejor día (2 mar) trae el valor del mismo periodo un año antes
      expect(summary.best.netSales).toEqual({ index: 1, start: '2026-03-02', value: 100, previousValue: 0 });
    });

    it('aligns months with the same month and counts the previous year to the same day', async () => {
      const { body } = await getTrend(adminToken, {
        start_date: '2025-04-01', end_date: '2026-03-31', compare: 'previous_year',
      });
      const { periods, previousYear, previousSummary } = body.data;

      expect(body.data.granularity).toBe('month');
      expect(periods.at(-1)).toMatchObject({ start: '2026-03-01', netSales: 450, current: true });
      expect(previousYear.periods.at(-1)).toMatchObject({ start: '2025-03-01', netSales: 400 });
      // A la fecha: hasta el 12 mar 2025, solo la venta del 6
      expect(previousSummary).toMatchObject({ to: '2025-03-12', totals: { netSales: 100, orders: 1 } });
    });

    it('takes February 29 as 28 when counting the previous year to date', async () => {
      jest.setSystemTime(new Date('2028-02-29T18:00:00Z'));
      try {
        await insertSale({ day: '2027-02-28' });
        // El token de 2026 ya expiró en 2028
        const token = await loginAs(admin);
        const { body } = await getTrend(token, {
          start_date: '2028-02-01', end_date: '2028-02-29', granularity: 'month', compare: 'previous_year',
        });

        expect(body.data.previousYear).toMatchObject({ startDate: '2027-02-01', endDate: '2027-02-28' });
        expect(body.data.previousSummary).toMatchObject({ to: '2027-02-28', totals: { netSales: 100, orders: 1 } });
      } finally {
        jest.setSystemTime(TODAY);
      }
    });
  });

  describe('per branch', () => {
    it('draws one series per branch with sales', async () => {
      const { body } = await getTrend(adminToken, { ...MARCH, compare: 'branch' });
      const [central, norte] = body.data.branches;

      expect(body.data.branches.map(b => b.name)).toEqual(['Sucursal Central', 'Sucursal Norte']);
      expect(central.periods[8]).toMatchObject({ start: '2026-03-09', netSales: 0 });
      expect(norte).toMatchObject({ branchId: branch2 });
      expect(norte.periods[8]).toMatchObject({ start: '2026-03-09', netSales: 100 });
      expect(body.data.summary.totals.netSales).toBe(450);
    });

    it('rejects the branch comparison for a branch user and with a branch filter', async () => {
      const branchUser = await getTrend(supervisorToken, { ...MARCH, compare: 'branch' });
      const filtered   = await getTrend(adminToken, { ...MARCH, compare: 'branch', branch_id: 1 });

      expect(branchUser.status).toBe(400);
      expect(filtered.status).toBe(400);
    });
  });

  describe('branch scope', () => {
    it('forces the branch of a user with an assigned branch, even if another branch_id is sent', async () => {
      const { body } = await getTrend(supervisorToken, { ...MARCH, branch_id: branch2 });

      expect(body.data.summary.totals).toEqual({ netSales: 350, orders: 4, profit: 230, avgTicket: 87.5 });
      expect(body.data.periods[8]).toMatchObject({ start: '2026-03-09', netSales: 0 });
    });

    it('lets the central admin filter by one branch', async () => {
      const { body } = await getTrend(adminToken, { ...MARCH, branch_id: branch2 });

      expect(body.data.summary.totals).toEqual({ netSales: 100, orders: 1, profit: 60, avgTicket: 100 });
    });
  });
});
