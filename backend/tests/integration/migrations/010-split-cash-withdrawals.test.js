// tests/integration/migrations/010-split-cash-withdrawals.test.js
// Salidas de caja históricas (spec 12, T2). Sobre una base ya migrada se
// cargan movimientos con la forma de antes de la spec 12 (retiros y gastos
// como 'expense') y se vuelve a aplicar la 010 (solo cambia datos).
const mysql   = require('mysql2/promise');
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { TEST_DB }          = require('../../helpers/database');
const { runMigrations }    = require('../../../src/utils/migrations');
const { loginAs }          = require('../../helpers/auth');
const { createTestUser }   = require('../../helpers/users');
const { openTestRegister } = require('../../helpers/sales');

const MIGRATION = '010-split-cash-withdrawals.sql';

const migrate = async () => {
  const conn = await mysql.createConnection({ ...TEST_DB, multipleStatements: true });
  try {
    await runMigrations(conn);
  } finally {
    await conn.end();
  }
};

const insertMovement = async (type, amount, description) => {
  const [result] = await db.query(
    `INSERT INTO cash_movements (session_id, movement_type, amount, description, user_id)
     VALUES (?, ?, ?, ?, ?)`,
    [sessionId, type, amount, description, user.userId]
  );
  return result.insertId;
};

const movementType = async (id) => {
  const [[row]] = await db.query('SELECT movement_type FROM cash_movements WHERE cash_movement_id = ?', [id]);
  return row.movement_type;
};

const sessionExpected = async () => {
  const res = await request(app)
    .get(`/api/reports/cash-sessions/${sessionId}`)
    .set('Authorization', `Bearer ${token}`);
  return res.body.data.expected;
};

let user;
let token;
let sessionId;
const movements = {};
let expectedBefore;

beforeAll(async () => {
  user  = await createTestUser({ role: 'supervisor' });
  token = await loginAs(user);
  ({ sessionId } = await openTestRegister({ userId: user.userId, openAmount: 500 }));

  movements.cutWithdrawal = await insertMovement('expense', 300, 'Retiro en corte de caja');
  movements.supplier      = await insertMovement('expense', 120, 'PAGO DE PEPSI');
  movements.power         = await insertMovement('expense', 80, 'PAGO DE CORRIENTE');
  movements.noDescription = await insertMovement('expense', 10, null);
  movements.income        = await insertMovement('income', 50, 'SOBRANTE');
  movements.sale          = await insertMovement('sale', 400, 'Venta #1');
  movements.return        = await insertMovement('return', 25, 'Devolución #1');

  expectedBefore = await sessionExpected();

  await db.query('DELETE FROM schema_migrations WHERE name = ?', [MIGRATION]);
  await migrate();
});

describe(`migration ${MIGRATION}`, () => {
  it('turns the cash cut withdrawal into a withdrawal', async () => {
    expect(await movementType(movements.cutWithdrawal)).toBe('withdrawal');
  });

  it('turns every other expense movement into a legacy expense, none into an expense', async () => {
    expect(await movementType(movements.supplier)).toBe('legacy_expense');
    expect(await movementType(movements.power)).toBe('legacy_expense');
    expect(await movementType(movements.noDescription)).toBe('legacy_expense');

    const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM cash_movements WHERE movement_type = 'expense'");
    expect(n).toBe(0);
  });

  it('leaves the other movement types unchanged', async () => {
    expect(await movementType(movements.income)).toBe('income');
    expect(await movementType(movements.sale)).toBe('sale');
    expect(await movementType(movements.return)).toBe('return');
  });

  it('keeps the expected cash of the session', async () => {
    // 500 + 400 + 50 − 300 − 120 − 80 − 10 − 25
    expect(expectedBefore).toBe(415);
    expect(await sessionExpected()).toBe(415);
  });
});
