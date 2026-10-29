// tests/integration/migrations/015-deactivate-merchandise-expense-category.test.js
// Categoría de gasto "Pago a proveedor (mercancía)" (spec 14, T4). Sobre una
// base ya migrada se reactiva la categoría, se guardan gastos con ella, como
// antes de la spec 14, y se vuelve a aplicar la 015 (solo cambia datos).
const mysql = require('mysql2/promise');
const db    = require('../../../src/config/db');
const { TEST_DB }         = require('../../helpers/database');
const { runMigrations }   = require('../../../src/utils/migrations');
const { createTestUser }  = require('../../helpers/users');
const { paymentMethodId } = require('../../helpers/sales');
const { expenseCategoryId, insertExpense } = require('../../helpers/expenses');

const MIGRATION = '015-deactivate-merchandise-expense-category.sql';
const MERCHANDISE = 'Pago a proveedor (mercancía)';

const migrate = async () => {
  const conn = await mysql.createConnection({ ...TEST_DB, multipleStatements: true });
  try {
    await runMigrations(conn);
  } finally {
    await conn.end();
  }
};

const expenseRows = async () => {
  const [rows] = await db.query(
    'SELECT expense_id, expense_category_id, status, amount FROM expenses ORDER BY expense_id'
  );
  return rows;
};

let merchandiseId;
let expensesBefore;

beforeAll(async () => {
  const user = await createTestUser({ role: 'supervisor' });
  const cash = await paymentMethodId('cash');
  merchandiseId = await expenseCategoryId(MERCHANDISE);

  await db.query('UPDATE expense_categories SET is_active = 1 WHERE expense_category_id = ?', [merchandiseId]);
  await insertExpense({
    expenseDate: '2026-10-27', categoryId: merchandiseId, amount: 1550, paymentMethodId: cash, userId: user.userId,
  });
  await insertExpense({
    expenseDate: '2026-10-27', categoryId: merchandiseId, amount: 1800, paymentMethodId: cash,
    status: 'cancelled', userId: user.userId,
  });
  await insertExpense({
    expenseDate: '2026-10-27', categoryId: await expenseCategoryId('Renta'), amount: 5000,
    paymentMethodId: cash, userId: user.userId,
  });
  expensesBefore = await expenseRows();

  await db.query('DELETE FROM schema_migrations WHERE name = ?', [MIGRATION]);
  await migrate();
});

describe(`migration ${MIGRATION}`, () => {
  it('deactivates the merchandise payment category, and only that one', async () => {
    const [rows] = await db.query('SELECT name, is_active FROM expense_categories ORDER BY expense_category_id');

    expect(rows).toEqual([
      { name: 'Renta',         is_active: 1 },
      { name: 'Servicios',     is_active: 1 },
      { name: 'Nómina',        is_active: 1 },
      { name: 'Insumos',       is_active: 1 },
      { name: 'Mantenimiento', is_active: 1 },
      { name: 'Otros',         is_active: 1 },
      { name: MERCHANDISE,     is_active: 0 },
    ]);
  });

  it('keeps the expenses that already have the category unchanged', async () => {
    expect(await expenseRows()).toEqual(expensesBefore);
    expect(expensesBefore.filter(e => e.expense_category_id === merchandiseId)).toHaveLength(2);
  });
});
