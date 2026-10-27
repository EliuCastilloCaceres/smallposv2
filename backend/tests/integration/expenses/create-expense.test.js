// tests/integration/expenses/create-expense.test.js
// Registro de gastos (spec 12, T5): con y sin comprobante, validaciones,
// pagado desde caja y el cajero sin expenses.read.
const fs      = require('fs');
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }          = require('../../helpers/auth');
const { createTestUser }   = require('../../helpers/users');
const { openTestRegister, paymentMethodId } = require('../../helpers/sales');
const { PNG_BYTES, PDF_BYTES, expenseCategoryId } = require('../../helpers/expenses');
const { todayInMexico }    = require('../../../src/utils/timezone');

const RECEIPTS_DIR = process.env.EXPENSE_RECEIPTS_DIR;
const receiptFiles = () => (fs.existsSync(RECEIPTS_DIR) ? fs.readdirSync(RECEIPTS_DIR) : []);

// El comprobante sobrante se borra sin esperar; se revisa unas veces
const eventually = async (check) => {
  for (let i = 0; i < 20; i++) {
    if (check()) return true;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return check();
};

const shiftDay = (iso, days) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

let tokens = {};
let ids = {};
let session1;
let branch2;
let register2;

const post = (token, body) =>
  request(app).post('/api/expenses').set('Authorization', `Bearer ${token}`).send(body);

// Multipart, como lo manda el navegador cuando hay comprobante
const postWithFile = (token, fields, file) => {
  let req = request(app).post('/api/expenses').set('Authorization', `Bearer ${token}`);
  for (const [key, value] of Object.entries(fields)) req = req.field(key, String(value));
  return req.attach('receipt', file.buffer, file.name);
};

const validExpense = (overrides = {}) => ({
  expense_category_id: ids.servicios,
  amount:              1500,
  description:         'Luz de octubre',
  payment_method_id:   ids.transfer,
  ...overrides,
});

const fromRegister = (overrides = {}) => validExpense({
  payment_method_id: ids.cash, paid_from_register: true, cash_register_id: 1, ...overrides,
});

beforeAll(async () => {
  fs.rmSync(RECEIPTS_DIR, { recursive: true, force: true });

  const [branch] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Norte', 1)");
  branch2 = branch.insertId;
  const [register] = await db.query(
    "INSERT INTO cash_registers (branch_id, name, is_active) VALUES (?, 'Caja Norte', 1)", [branch2]
  );
  register2 = register.insertId;

  const supervisor  = await createTestUser({ role: 'supervisor' });
  const cajero      = await createTestUser({ role: 'cajero' });
  const almacenista = await createTestUser({ role: 'almacenista' });
  const admin       = await createTestUser({ role: 'admin', branchId: null });
  const norte       = await createTestUser({ role: 'cajero', branchId: branch2 });

  ({ sessionId: session1 } = await openTestRegister({ userId: cajero.userId }));
  await openTestRegister({ userId: norte.userId, cashRegisterId: register2 });

  [tokens.supervisor, tokens.cajero, tokens.almacenista, tokens.admin] = await Promise.all(
    [supervisor, cajero, almacenista, admin].map(loginAs)
  );

  ids.cash      = await paymentMethodId('cash');
  ids.card      = await paymentMethodId('card');
  ids.transfer  = await paymentMethodId('transfer');
  ids.credit    = await paymentMethodId('credit');
  ids.servicios = await expenseCategoryId('Servicios');
  const [inactive] = await db.query("INSERT INTO expense_categories (name, is_active) VALUES ('Vieja', 0)");
  ids.inactiveCategory = inactive.insertId;
  const [pepsi] = await db.query("INSERT INTO providers (name, is_active) VALUES ('Pepsi', 1)");
  ids.pepsi = pepsi.insertId;
  const [old] = await db.query("INSERT INTO providers (name, is_active) VALUES ('Antiguo', 0)");
  ids.inactiveProvider = old.insertId;
});

describe('register an expense', () => {
  it('registers an expense without receipt, dated today by default', async () => {
    const res = await post(tokens.supervisor, validExpense({ provider_id: ids.pepsi, folio: ' F-123 ' }));

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      expense_date: todayInMexico(), amount: 1500, description: 'Luz de octubre', folio: 'F-123',
      status: 'active', branch_id: 1, category_name: 'Servicios', counts_in_net_profit: 1,
      payment_method_code: 'transfer', provider_name: 'Pepsi',
      has_receipt: false, paid_from_register: false, cash_movement: null, created_by_name: 'Test supervisor',
    });
  });

  it('accepts a past date', async () => {
    const yesterday = shiftDay(todayInMexico(), -1);
    const res = await post(tokens.supervisor, validExpense({ expense_date: yesterday }));

    expect(res.body.data.expense_date).toBe(yesterday);
  });

  it('saves the branch of a branch user, even if another one is sent', async () => {
    const res = await post(tokens.supervisor, validExpense({ branch_id: branch2 }));

    expect(res.body.data.branch_id).toBe(1);
  });

  it('lets the central admin choose the branch, and requires it', async () => {
    const withoutBranch = await post(tokens.admin, validExpense());
    const withBranch    = await post(tokens.admin, validExpense({ branch_id: branch2 }));

    expect(withoutBranch.status).toBe(400);
    expect(withBranch.status).toBe(201);
    expect(withBranch.body.data.branch_id).toBe(branch2);
  });

  it('registers an expense with a photo receipt and serves it to download', async () => {
    const res = await postWithFile(tokens.supervisor, validExpense(), { buffer: PNG_BYTES, name: 'ticket luz.png' });
    const receipt = await request(app)
      .get(`/api/expenses/${res.body.data.expense_id}/receipt`)
      .set('Authorization', `Bearer ${tokens.supervisor}`);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ has_receipt: true, receipt_name: 'ticket luz.png' });
    expect(receipt.status).toBe(200);
    expect(receipt.headers['content-type']).toBe('image/png');
    expect(receipt.headers['content-disposition']).toContain('ticket%20luz.png');
    expect(Buffer.compare(receipt.body, PNG_BYTES)).toBe(0);
  });

  it('accepts a PDF receipt', async () => {
    const res = await postWithFile(tokens.supervisor, validExpense(), { buffer: PDF_BYTES, name: 'factura.pdf' });
    const receipt = await request(app)
      .get(`/api/expenses/${res.body.data.expense_id}/receipt`)
      .set('Authorization', `Bearer ${tokens.supervisor}`);

    expect(res.status).toBe(201);
    expect(receipt.headers['content-type']).toBe('application/pdf');
  });

  it('keeps the receipt out of the public folder', async () => {
    const res = await postWithFile(tokens.supervisor, validExpense(), { buffer: PNG_BYTES, name: 'ticket.png' });

    expect(res.status).toBe(201);
    expect(receiptFiles().length).toBeGreaterThan(0);
    const publicFiles = await request(app).get(`/api/receipt/images/${receiptFiles()[0]}`);
    expect(publicFiles.status).toBe(404);
  });
});

describe('expense validations', () => {
  const tomorrow = () => shiftDay(todayInMexico(), 1);

  it.each([
    ['an amount of 0',                () => ({ amount: 0 }),                   /monto debe ser mayor a 0/],
    ['an amount that is not a number', () => ({ amount: 'abc' }),              /monto debe ser mayor a 0/],
    ['an empty description',          () => ({ description: '   ' }),          /descripción es requerida/],
    ['a description of 256 characters', () => ({ description: 'x'.repeat(256) }), /255 caracteres/],
    ['a folio of 51 characters',      () => ({ folio: 'F'.repeat(51) }),        /50 caracteres/],
    ['a future date',                 () => ({ expense_date: tomorrow() }),     /no puede ser futura/],
    ['a date that does not exist',    () => ({ expense_date: '2026-02-30' }),   /no es válida/],
    ['an inactive category',          () => ({ expense_category_id: ids.inactiveCategory }), /categoría de gasto no existe o está inactiva/],
    ['the Crédito payment method',    () => ({ payment_method_id: ids.credit }), /Crédito/],
    ['an inactive provider',          () => ({ provider_id: ids.inactiveProvider }), /proveedor no existe o está inactivo/],
  ])('rejects %s with 400', async (_, overrides, message) => {
    const res = await post(tokens.supervisor, validExpense(overrides()));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
  });

  it('rejects a receipt of another format and does not keep it', async () => {
    const before = receiptFiles().length;
    const res = await postWithFile(tokens.supervisor, validExpense(), { buffer: Buffer.from('hola'), name: 'notas.txt' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('El comprobante debe ser una foto (JPG, PNG o WEBP) o un PDF.');
    expect(await eventually(() => receiptFiles().length === before)).toBe(true);
  });

  it('rejects a file named like a photo that is not one, and does not keep it', async () => {
    const before = receiptFiles().length;
    const res = await postWithFile(tokens.supervisor, validExpense(), { buffer: Buffer.from('no soy una foto'), name: 'foto.png' });

    expect(res.status).toBe(400);
    expect(await eventually(() => receiptFiles().length === before)).toBe(true);
  });

  it('rejects a receipt of more than 5 MB', async () => {
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await postWithFile(tokens.supervisor, validExpense(), { buffer: big, name: 'grande.png' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('El comprobante no puede pesar más de 5 MB.');
  });

  it('removes the receipt when the expense is rejected', async () => {
    const before = receiptFiles().length;
    const res = await postWithFile(tokens.supervisor, validExpense({ amount: 0 }), { buffer: PNG_BYTES, name: 'ticket.png' });

    expect(res.status).toBe(400);
    expect(await eventually(() => receiptFiles().length === before)).toBe(true);
  });
});

describe('expense paid from the register', () => {
  const movementOf = async (expense) => {
    const [[row]] = await db.query(
      'SELECT session_id, movement_type, amount, description FROM cash_movements WHERE cash_movement_id = ?',
      [expense.cash_movement.cash_movement_id]
    );
    return row;
  };

  it('creates its cash movement in the open session, linked to the expense', async () => {
    const res = await post(tokens.supervisor, fromRegister({ amount: 250.5 }));
    const expense = res.body.data;

    expect(res.status).toBe(201);
    expect(expense).toMatchObject({
      paid_from_register: true,
      cash_movement: { session_id: session1, register_name: 'Caja 1', session_open: true },
    });
    expect(await movementOf(expense)).toEqual({
      session_id: session1, movement_type: 'expense', amount: 250.5,
      description: `Gasto #${expense.expense_id}: Servicios – Luz de octubre`,
    });
  });

  it('cuts the description of the cash movement to 100 characters', async () => {
    const res = await post(tokens.supervisor, fromRegister({ description: 'Pago de luz '.repeat(20) }));
    const { description } = await movementOf(res.body.data);

    expect(description).toHaveLength(100);
    expect(description.startsWith(`Gasto #${res.body.data.expense_id}: Servicios – Pago de luz`)).toBe(true);
  });

  it('subtracts the expense from the expected cash of the session', async () => {
    const status = () => request(app).get('/api/cash-registers/1/status').set('Authorization', `Bearer ${tokens.supervisor}`);
    const before = (await status()).body.data.summary.expected_close;

    await post(tokens.supervisor, fromRegister({ amount: 100 }));

    expect((await status()).body.data.summary.expected_close).toBe(+(before - 100).toFixed(2));
  });

  it('requires cash', async () => {
    const res = await post(tokens.supervisor, fromRegister({ payment_method_id: ids.card }));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Efectivo/);
  });

  it('requires the date of today', async () => {
    const res = await post(tokens.supervisor, fromRegister({ expense_date: shiftDay(todayInMexico(), -1) }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Un gasto pagado desde caja es de hoy');
  });

  it('requires a register with an open session of the branch of the expense', async () => {
    const [closed] = await db.query("INSERT INTO cash_registers (branch_id, name, is_active) VALUES (1, 'Caja cerrada', 1)");

    const otherBranch = await post(tokens.supervisor, fromRegister({ cash_register_id: register2 }));
    const noSession   = await post(tokens.supervisor, fromRegister({ cash_register_id: closed.insertId }));
    const noRegister  = await post(tokens.supervisor, fromRegister({ cash_register_id: '' }));

    expect([otherBranch.status, noSession.status, noRegister.status]).toEqual([400, 400, 400]);
    expect(otherBranch.body.message).toBe('La caja no tiene una sesión abierta en esta sucursal');
  });

  it('does not save the expense when the register has no open session', async () => {
    const countExpenses = async () => (await db.query('SELECT COUNT(*) AS n FROM expenses'))[0][0].n;
    const before = await countExpenses();

    await post(tokens.supervisor, fromRegister({ cash_register_id: register2 }));

    expect(await countExpenses()).toBe(before);
  });
});

describe('expenses of a user without expenses.read', () => {
  it('lets a cashier register an expense paid from their register', async () => {
    const res = await post(tokens.cajero, fromRegister());

    expect(res.status).toBe(201);
    expect(res.body.data.paid_from_register).toBe(true);
  });

  it('does not let a cashier register an expense outside the register', async () => {
    const res = await post(tokens.cajero, validExpense());

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Solo puedes registrar gastos pagados desde tu caja');
  });

  it('responds 403 to a user without expenses.create', async () => {
    const res = await post(tokens.almacenista, fromRegister());

    expect(res.status).toBe(403);
  });
});
