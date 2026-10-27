// tests/integration/migrations/009-add-expenses.test.js
// Tabla de gastos (spec 12, T1). La base de cada archivo de integración ya
// viene migrada.
const db = require('../../../src/config/db');
const { createTestUser }  = require('../../helpers/users');
const { paymentMethodId } = require('../../helpers/sales');

let user;
let cash;
let rentaId;

const insertExpense = (overrides = {}) => {
  const row = {
    branch_id: 1, expense_date: '2026-10-01', expense_category_id: rentaId,
    amount: 1500, description: 'Renta de octubre', payment_method_id: cash,
    created_by: user.userId, ...overrides,
  };
  return db.query('INSERT INTO expenses SET ?', [row]);
};

beforeAll(async () => {
  user = await createTestUser({ role: 'supervisor' });
  cash = await paymentMethodId('cash');
  const [[renta]] = await db.query("SELECT expense_category_id FROM expense_categories WHERE name = 'Renta'");
  rentaId = renta.expense_category_id;
});

describe('migration 009-add-expenses', () => {
  it('creates the expenses table, with new expenses active and without cash movement or receipt', async () => {
    const [result] = await insertExpense();
    const [[expense]] = await db.query(
      `SELECT DATE_FORMAT(expense_date, '%Y-%m-%d') AS expense_date, amount, status,
              provider_id, folio, receipt_file, cash_movement_id, refund_cash_movement_id, cancelled_at
         FROM expenses WHERE expense_id = ?`,
      [result.insertId]
    );

    expect(expense).toEqual({
      expense_date: '2026-10-01', amount: 1500, status: 'active',
      provider_id: null, folio: null, receipt_file: null,
      cash_movement_id: null, refund_cash_movement_id: null, cancelled_at: null,
    });
  });

  it('rejects an expense with a category that does not exist', async () => {
    await expect(insertExpense({ expense_category_id: 999999 }))
      .rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  });

  it('rejects an expense without description', async () => {
    await expect(db.query(
      `INSERT INTO expenses (branch_id, expense_date, expense_category_id, amount, payment_method_id, created_by)
       VALUES (1, '2026-10-01', ?, 100, ?, ?)`,
      [rentaId, cash, user.userId]
    )).rejects.toMatchObject({ code: 'ER_NO_DEFAULT_FOR_FIELD' });
  });
});
