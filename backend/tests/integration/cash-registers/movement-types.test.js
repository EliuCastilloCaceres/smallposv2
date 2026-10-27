// tests/integration/cash-registers/movement-types.test.js
// Retiros y tipos de movimiento de caja (spec 12, T2): el POS registra los
// retiros como 'withdrawal', ya no acepta 'expense', y el efectivo esperado
// resta withdrawal, expense y legacy_expense y suma expense_refund en los
// cinco cálculos: cierre, estado de la sesión, Sesiones de caja (lista y
// detalle) y Dashboard.
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }          = require('../../helpers/auth');
const { createTestUser }   = require('../../helpers/users');
const { openTestRegister } = require('../../helpers/sales');
const { todayInMexico }    = require('../../../src/utils/timezone');

const auth = (req) => req.set('Authorization', `Bearer ${token}`);

const postMovement = (body) =>
  auth(request(app).post('/api/cash-registers/1/movements')).send(body);

const insertMovement = (type, amount) =>
  db.query(
    `INSERT INTO cash_movements (session_id, movement_type, amount, description, user_id)
     VALUES (?, ?, ?, ?, ?)`,
    [sessionId, type, amount, `Movimiento ${type}`, user.userId]
  );

let user;
let token;
let sessionId;

beforeAll(async () => {
  user  = await createTestUser({ role: 'supervisor' });
  token = await loginAs(user);
  ({ sessionId } = await openTestRegister({ userId: user.userId, openAmount: 100 }));
});

describe('manual cash movements', () => {
  it('saves a manual withdrawal as a withdrawal', async () => {
    const res = await postMovement({ movementType: 'withdrawal', amount: 30, description: 'Retiro' });

    expect(res.status).toBe(201);
    const [[row]] = await db.query(
      'SELECT movement_type, amount FROM cash_movements WHERE cash_movement_id = ?', [res.body.data.cashMovementId]
    );
    expect(row).toEqual({ movement_type: 'withdrawal', amount: 30 });
  });

  it('saves a manual income as an income', async () => {
    const res = await postMovement({ movementType: 'income', amount: 50, description: 'SOBRANTE' });

    expect(res.status).toBe(201);
  });

  it('responds 400 to an expense: expenses are registered as expenses', async () => {
    const res = await postMovement({ movementType: 'expense', amount: 20, description: 'Gasto' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/gastos/);
  });
});

describe('expected cash by movement type', () => {
  // 100 de apertura + 50 de ingreso − 30 de retiro (tests de arriba)
  // + 20 de reingreso − 20 de gasto − 5 de salida histórica − 10 de devolución
  const EXPECTED = 105;

  beforeAll(async () => {
    await insertMovement('expense', 20);
    await insertMovement('expense_refund', 20);
    await insertMovement('legacy_expense', 5);
    await insertMovement('return', 10);
  });

  it('applies to the session status', async () => {
    const res = await auth(request(app).get('/api/cash-registers/1/status'));

    expect(res.body.data.summary).toEqual({
      open_amount: 100, total_in: 70, total_out: 65, expected_close: EXPECTED,
    });
    const cash = res.body.data.paymentBreakdown.find(m => m.code === 'cash');
    expect(cash.expected).toBe(EXPECTED);
  });

  it('applies to the cash sessions report, list and detail', async () => {
    const list   = await auth(request(app).get('/api/reports/cash-sessions'));
    const detail = await auth(request(app).get(`/api/reports/cash-sessions/${sessionId}`));

    expect(list.body.data.find(s => s.sessionId === sessionId).expected).toBe(EXPECTED);
    expect(detail.body.data.expected).toBe(EXPECTED);
  });

  it('applies to the open registers of the dashboard', async () => {
    const today = todayInMexico();
    const res = await auth(request(app).get('/api/dashboard').query({ start_date: today, end_date: today }));

    const register = res.body.data.cash_registers.find(r => r.cash_register_id === 1);
    expect(register.expected_close).toBe(EXPECTED);
  });

  it('applies to the cash cut, with its withdrawal saved as a withdrawal', async () => {
    // Como el POS: primero el retiro del corte y después el cierre
    const withdrawal = await postMovement({ movementType: 'withdrawal', amount: 40, description: 'Retiro en corte de caja' });
    const res = await auth(request(app).patch('/api/cash-registers/1/close'))
      .send({ cashCounted: EXPECTED, withdrawAmt: 40 });

    expect(withdrawal.status).toBe(201);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ expectedClose: EXPECTED, difference: 0, closeAmount: 65 });
    expect(res.body.data.movements.at(-1)).toMatchObject({
      movement_type: 'withdrawal', amount: 40, description: 'Retiro en corte de caja',
    });
  });
});
