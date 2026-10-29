// tests/integration/migrations/017-add-purchases-receipt-uploader.test.js
// Quién subió el comprobante de una compra (spec 15, T1). Parte de una base
// migrada hasta la 016, con compras guardadas con la forma de antes, y aplica
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

const MIGRATION = '017-add-purchases-receipt-uploader.sql';

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

const insertPurchase = async (overrides = {}) => {
  const [result] = await db.query('INSERT INTO purchases SET ?', [{
    branch_id: 1, purchase_date: '2026-10-28', provider_id: 1, payment_method_id: cash,
    total: 190, created_by: registrar.userId, ...overrides,
  }]);
  return result.insertId;
};

const uploader = async (purchaseId) => {
  const [[row]] = await db.query(
    `SELECT receipt_uploaded_by, DATE_FORMAT(receipt_uploaded_at, '%Y-%m-%d %H:%i:%s') AS receipt_uploaded_at
       FROM purchases WHERE purchase_id = ?`,
    [purchaseId]
  );
  return row;
};

let registrar;
let cash;
const ids = {};

beforeAll(async () => {
  await resetDatabase({ migrate: false });
  await migrate({ before: MIGRATION });

  registrar = await createTestUser({ role: 'almacenista' });
  cash      = await paymentMethodId('cash');
  const receipt = { receipt_file: 'receipt.jpg', receipt_name: 'ticket.jpg', created_at: '2026-10-28 19:56:23' };
  ids.withReceipt = await insertPurchase(receipt);
  ids.cancelled   = await insertPurchase({ ...receipt, status: 'cancelled' });
  ids.noReceipt   = await insertPurchase();

  await migrate();
});

describe(`migration ${MIGRATION}`, () => {
  it('fills the uploader of existing receipts with who registered the purchase and when', async () => {
    const expected = { receipt_uploaded_by: registrar.userId, receipt_uploaded_at: '2026-10-28 19:56:23' };

    expect(await uploader(ids.withReceipt)).toEqual(expected);
    expect(await uploader(ids.cancelled)).toEqual(expected);
  });

  it('leaves both columns empty in purchases without a receipt', async () => {
    expect(await uploader(ids.noReceipt)).toEqual({ receipt_uploaded_by: null, receipt_uploaded_at: null });
  });

  it('only accepts an existing user as the uploader', async () => {
    await expect(db.query('UPDATE purchases SET receipt_uploaded_by = 999999 WHERE purchase_id = ?', [ids.noReceipt]))
      .rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  });
});
