// tests/integration/expenses/cancel-expense.test.js
// Cancelación de gastos (spec 12, T5): motivo obligatorio, reingreso con la
// sesión abierta, sin reingreso con la sesión cerrada, 400 al cancelar dos
// veces, alcance por sucursal y 403 sin expenses.cancel.
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }          = require('../../helpers/auth');
const { createTestUser }   = require('../../helpers/users');
const { openTestRegister, paymentMethodId } = require('../../helpers/sales');
const { expenseCategoryId, insertExpense } = require('../../helpers/expenses');

let tokens = {};
let ids = {};
let supervisor;
let branch2;

const cancel = (token, expenseId, body) =>
  request(app).post(`/api/expenses/${expenseId}/cancel`).set('Authorization', `Bearer ${token}`).send(body);

const registerStatus = async () =>
  (await request(app).get('/api/cash-registers/1/status').set('Authorization', `Bearer ${tokens.supervisor}`)).body.data;

// Gasto pagado desde la Caja 1, registrado por la API
const expenseFromRegister = async (amount) => {
  const res = await request(app).post('/api/expenses').set('Authorization', `Bearer ${tokens.supervisor}`).send({
    expense_category_id: ids.luz, amount, description: 'Garrafones de agua',
    payment_method_id: ids.cash, paid_from_register: true, cash_register_id: 1,
  });
  return res.body.data;
};

const plainExpense = (overrides = {}) => insertExpense({
  expenseDate: '2026-10-01', categoryId: ids.luz, amount: 400, paymentMethodId: ids.transfer,
  userId: supervisor.userId, ...overrides,
});

beforeAll(async () => {
  const [branch] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Norte', 1)");
  branch2 = branch.insertId;

  supervisor   = await createTestUser({ role: 'supervisor' });
  const cajero = await createTestUser({ role: 'cajero' });
  const admin  = await createTestUser({ role: 'admin', branchId: null });
  [tokens.supervisor, tokens.cajero, tokens.admin] = await Promise.all([supervisor, cajero, admin].map(loginAs));
  await openTestRegister({ userId: cajero.userId, openAmount: 1000 });

  ids.cash     = await paymentMethodId('cash');
  ids.transfer = await paymentMethodId('transfer');
  ids.luz      = await expenseCategoryId('Servicios');
});

describe('cancel an expense', () => {
  it('requires a reason of up to 255 characters', async () => {
    const expenseId = await plainExpense();

    const empty = await cancel(tokens.supervisor, expenseId, { reason: '  ' });
    const long  = await cancel(tokens.supervisor, expenseId, { reason: 'x'.repeat(256) });

    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe('El motivo de la cancelación es requerido');
    expect(long.status).toBe(400);
  });

  it('cancels an expense with its reason, who and when, without touching the register', async () => {
    const expenseId = await plainExpense();

    const res = await cancel(tokens.supervisor, expenseId, { reason: ' Capturado dos veces ' });

    expect(res.status).toBe(200);
    expect(res.body.data.refund).toBeNull();
    expect(res.body.data.expense).toMatchObject({
      status: 'cancelled', cancel_reason: 'Capturado dos veces',
      cancelled_by_name: 'Test supervisor', refund_registered: false,
    });
    expect(res.body.data.expense.cancelled_at).not.toBeNull();
  });

  it('keeps a cancelled expense in the list as cancelled', async () => {
    const expenseId = await plainExpense({ description: 'Para cancelar' });
    await cancel(tokens.supervisor, expenseId, { reason: 'Error' });

    const res = await request(app).get('/api/expenses').query({ status: 'all', search: 'Para cancelar' })
      .set('Authorization', `Bearer ${tokens.supervisor}`);

    expect(res.body.data).toEqual([expect.objectContaining({ expense_id: expenseId, status: 'cancelled' })]);
  });

  it('responds 400 to an expense already cancelled', async () => {
    const expenseId = await plainExpense();
    await cancel(tokens.supervisor, expenseId, { reason: 'Error' });

    const res = await cancel(tokens.supervisor, expenseId, { reason: 'Otra vez' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('El gasto ya está cancelado');
  });
});

describe('cancel an expense paid from the register', () => {
  it('registers its refund in the session while it is open', async () => {
    const before  = (await registerStatus()).summary.expected_close;
    const expense = await expenseFromRegister(150);

    const res = await cancel(tokens.supervisor, expense.expense_id, { reason: 'No se compró' });
    const status = await registerStatus();

    expect(res.body.data.refund).toBe('registered');
    expect(res.body.data.expense.refund_registered).toBe(true);
    expect(status.movements.at(-1)).toMatchObject({
      movement_type: 'expense_refund', amount: 150, description: `Reingreso del gasto #${expense.expense_id}`,
    });
    expect(status.summary.expected_close).toBe(before);
  });

  it('cancels without refund once the session is closed', async () => {
    const expense = await expenseFromRegister(80);
    const [[{ refunds: before }]] = await db.query(
      "SELECT COUNT(*) AS refunds FROM cash_movements WHERE movement_type = 'expense_refund'"
    );
    await db.query('UPDATE cash_register_sessions SET closed_at = NOW() WHERE session_id = ?', [expense.cash_movement.session_id]);
    await db.query('UPDATE cash_registers SET is_open = 0 WHERE cash_register_id = 1');

    const res = await cancel(tokens.supervisor, expense.expense_id, { reason: 'Se devolvió después del corte' });
    const [[{ refunds: after }]] = await db.query(
      "SELECT COUNT(*) AS refunds FROM cash_movements WHERE movement_type = 'expense_refund'"
    );

    expect(res.status).toBe(200);
    expect(res.body.data.refund).toBe('session_closed');
    expect(res.body.data.expense).toMatchObject({
      status: 'cancelled', refund_registered: false, cash_movement: expect.objectContaining({ session_open: false }),
    });
    expect(after).toBe(before);
  });
});

describe('cancel permissions and branch scope', () => {
  it('responds 403 to a user without expenses.cancel, like a cashier', async () => {
    const expenseId = await plainExpense();

    const res = await cancel(tokens.cajero, expenseId, { reason: 'Error' });

    expect(res.status).toBe(403);
  });

  it('answers an expense of another branch like one that does not exist', async () => {
    const expenseId = await plainExpense({ branchId: branch2 });

    const res = await cancel(tokens.supervisor, expenseId, { reason: 'Error' });

    expect(res.status).toBe(404);
  });

  it('lets the central admin cancel an expense of any branch', async () => {
    const expenseId = await plainExpense({ branchId: branch2 });

    const res = await cancel(tokens.admin, expenseId, { reason: 'Error' });

    expect(res.status).toBe(200);
    expect(res.body.data.expense.status).toBe('cancelled');
  });
});
