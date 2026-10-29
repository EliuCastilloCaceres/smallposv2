// tests/integration/migrations/016-add-expenses-receipt-uploader.test.js
// Quién subió el comprobante de un gasto (spec 15, T1). Parte de una base
// migrada hasta la 015, con gastos guardados con la forma de antes, y aplica
// el resto de las migraciones.
const fs    = require('fs');
const os    = require('os');
const path  = require('path');
const mysql = require('mysql2/promise');
const db    = require('../../../src/config/db');
const { TEST_DB, resetDatabase } = require('../../helpers/database');
const { runMigrations, MIGRATIONS_DIR } = require('../../../src/utils/migrations');
const { createTestUser }  = require('../../helpers/users');
const { paymentMethodId } = require('../../helpers/sales');
const { expenseCategoryId, insertExpense } = require('../../helpers/expenses');

const MIGRATION = '016-add-expenses-receipt-uploader.sql';

// Aplica las migraciones anteriores a esta (o todas, sin argumento), desde
// una copia de la carpeta con solo esos archivos
const migrate = async ({ before } = {}) => {
  let dir = MIGRATIONS_DIR;
  if (before) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'));
    for (const name of fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql') && f < before)) {
      fs.copyFileSync(path.join(MIGRATIONS_DIR, name), path.join(dir, name));
    }
  }
  const conn = await mysql.createConnection({ ...TEST_DB, multipleStatements: true });
  try {
    await runMigrations(conn, { dir });
  } finally {
    await conn.end();
    if (before) fs.rmSync(dir, { recursive: true, force: true });
  }
};

const uploader = async (expenseId) => {
  const [[row]] = await db.query(
    `SELECT receipt_uploaded_by, DATE_FORMAT(receipt_uploaded_at, '%Y-%m-%d %H:%i:%s') AS receipt_uploaded_at
       FROM expenses WHERE expense_id = ?`,
    [expenseId]
  );
  return row;
};

let registrar;
const ids = {};

beforeAll(async () => {
  await resetDatabase({ migrate: false });
  await migrate({ before: MIGRATION });

  registrar = await createTestUser({ role: 'supervisor' });
  const base = {
    expenseDate: '2026-10-27', categoryId: await expenseCategoryId('Renta'), amount: 100,
    paymentMethodId: await paymentMethodId('cash'), userId: registrar.userId,
  };
  ids.withReceipt = await insertExpense(base);
  ids.cancelled   = await insertExpense({ ...base, status: 'cancelled' });
  ids.noReceipt   = await insertExpense(base);
  await db.query(
    `UPDATE expenses SET receipt_file = 'receipt.pdf', receipt_name = 'factura.pdf',
            created_at = '2026-10-27 19:37:47'
      WHERE expense_id IN (?, ?)`,
    [ids.withReceipt, ids.cancelled]
  );

  await migrate();
});

describe(`migration ${MIGRATION}`, () => {
  it('fills the uploader of existing receipts with who registered the expense and when', async () => {
    const expected = { receipt_uploaded_by: registrar.userId, receipt_uploaded_at: '2026-10-27 19:37:47' };

    expect(await uploader(ids.withReceipt)).toEqual(expected);
    expect(await uploader(ids.cancelled)).toEqual(expected);
  });

  it('leaves both columns empty in expenses without a receipt', async () => {
    expect(await uploader(ids.noReceipt)).toEqual({ receipt_uploaded_by: null, receipt_uploaded_at: null });
  });

  it('only accepts an existing user as the uploader', async () => {
    await expect(db.query('UPDATE expenses SET receipt_uploaded_by = 999999 WHERE expense_id = ?', [ids.noReceipt]))
      .rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  });
});
