// tests/integration/expenses/expense-receipt.test.js
// Comprobante después de registrar un gasto (spec 15, T2): quién lo subió y
// cuándo, agregarlo, reemplazarlo, las validaciones, el alcance por sucursal
// y los permisos.
const fs      = require('fs');
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }         = require('../../helpers/auth');
const { createTestUser }  = require('../../helpers/users');
const { paymentMethodId } = require('../../helpers/sales');
const { PNG_BYTES, PDF_BYTES, expenseCategoryId, insertExpense } = require('../../helpers/expenses');

const RECEIPTS_DIR = process.env.EXPENSE_RECEIPTS_DIR;
const receiptFiles = () => (fs.existsSync(RECEIPTS_DIR) ? fs.readdirSync(RECEIPTS_DIR) : []);

// Los archivos sobrantes se borran sin esperar; se revisa unas veces
const eventually = async (check) => {
  for (let i = 0; i < 20; i++) {
    if (check()) return true;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return check();
};

const PNG = { buffer: PNG_BYTES, name: 'factura luz.png' };
const PDF = { buffer: PDF_BYTES, name: 'factura.pdf' };

let tokens = {};
let ids = {};
let branch2;

const putReceipt = (token, expenseId, file) => {
  const req = request(app).put(`/api/expenses/${expenseId}/receipt`).set('Authorization', `Bearer ${token}`);
  return file ? req.attach('receipt', file.buffer, file.name) : req;
};

const getDetail = (token, expenseId) =>
  request(app).get(`/api/expenses/${expenseId}`).set('Authorization', `Bearer ${token}`);

const storedFile = async (expenseId) => {
  const [[row]] = await db.query('SELECT receipt_file FROM expenses WHERE expense_id = ?', [expenseId]);
  return row.receipt_file;
};

const newExpense = (overrides = {}) => insertExpense({
  expenseDate: '2026-10-27', categoryId: ids.renta, amount: 5000, paymentMethodId: ids.transfer,
  userId: ids.supervisor, ...overrides,
});

beforeAll(async () => {
  fs.rmSync(RECEIPTS_DIR, { recursive: true, force: true });

  const [branch] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Norte', 1)");
  branch2 = branch.insertId;
  // Un rol que ve los gastos pero no los registra
  const [role] = await db.query("INSERT INTO roles (name, description) VALUES ('auditor', 'Solo ve gastos')");
  await db.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT ?, permission_id FROM permissions WHERE module = 'expenses' AND action = 'read'`,
    [role.insertId]
  );

  const supervisor  = await createTestUser({ role: 'supervisor' });
  const cajero      = await createTestUser({ role: 'cajero' });
  const almacenista = await createTestUser({ role: 'almacenista' });
  const auditor     = await createTestUser({ role: 'auditor' });
  const admin       = await createTestUser({ role: 'admin', branchId: null });
  ids.supervisor = supervisor.userId;

  [tokens.supervisor, tokens.cajero, tokens.almacenista, tokens.auditor, tokens.admin] = await Promise.all(
    [supervisor, cajero, almacenista, auditor, admin].map(loginAs)
  );

  ids.renta     = await expenseCategoryId('Renta');
  ids.servicios = await expenseCategoryId('Servicios');
  ids.transfer  = await paymentMethodId('transfer');
});

describe('who uploaded the receipt of a new expense', () => {
  const register = (file) => {
    let req = request(app).post('/api/expenses').set('Authorization', `Bearer ${tokens.supervisor}`);
    const fields = {
      expense_category_id: ids.servicios, amount: 1500, description: 'Luz de octubre', payment_method_id: ids.transfer,
    };
    for (const [key, value] of Object.entries(fields)) req = req.field(key, String(value));
    return file ? req.attach('receipt', file.buffer, file.name) : req;
  };

  it('is who registered the expense, at the time of the registration', async () => {
    const res = await register(PNG);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ has_receipt: true, receipt_uploaded_by_name: 'Test supervisor' });
    expect(res.body.data.receipt_uploaded_at).toBe(res.body.data.created_at);
  });

  it('stays empty when the expense is registered without a receipt', async () => {
    const res = await register(null);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      has_receipt: false, receipt_uploaded_by_name: null, receipt_uploaded_at: null,
    });
  });
});

describe('PUT /api/expenses/:id/receipt', () => {
  it('adds a receipt to an expense without one, and serves it to download', async () => {
    const expenseId = await newExpense();

    const res = await putReceipt(tokens.supervisor, expenseId, PNG);
    const receipt = await request(app)
      .get(`/api/expenses/${expenseId}/receipt`)
      .set('Authorization', `Bearer ${tokens.supervisor}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      expense_id: expenseId, has_receipt: true, receipt_name: 'factura luz.png',
      receipt_uploaded_by_name: 'Test supervisor',
    });
    expect(res.body.data.receipt_uploaded_at).toBeTruthy();
    expect(receipt.status).toBe(200);
    expect(receipt.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(receipt.body, PNG_BYTES)).toBe(0);
  });

  it('shows the receipt in the detail and in the list', async () => {
    const expenseId = await newExpense({ description: 'Renta con comprobante tardío' });
    await putReceipt(tokens.supervisor, expenseId, PNG);

    const detail = await getDetail(tokens.supervisor, expenseId);
    const list = await request(app)
      .get('/api/expenses')
      .query({ start_date: '2026-10-01', end_date: '2026-10-31', search: 'comprobante tardío' })
      .set('Authorization', `Bearer ${tokens.supervisor}`);

    expect(detail.body.data).toMatchObject({ has_receipt: true, receipt_uploaded_by_name: 'Test supervisor' });
    expect(list.body.data).toEqual([expect.objectContaining({ expense_id: expenseId, has_receipt: true })]);
  });

  it('replaces the receipt, records who replaced it and removes the previous file', async () => {
    const expenseId = await newExpense();
    await putReceipt(tokens.supervisor, expenseId, PNG);
    const previous = await storedFile(expenseId);

    const res = await putReceipt(tokens.admin, expenseId, PDF);
    const current = await storedFile(expenseId);
    const receipt = await request(app)
      .get(`/api/expenses/${expenseId}/receipt`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ receipt_name: 'factura.pdf', receipt_uploaded_by_name: 'Test admin' });
    expect(current).not.toBe(previous);
    expect(receiptFiles()).toContain(current);
    expect(await eventually(() => !receiptFiles().includes(previous))).toBe(true);
    expect(receipt.headers['content-type']).toBe('application/pdf');
  });

  it('requires a file', async () => {
    const expenseId = await newExpense();

    const res = await putReceipt(tokens.supervisor, expenseId, null);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Elige el comprobante.');
  });

  it('rejects a receipt of another format and keeps the current one', async () => {
    const expenseId = await newExpense();
    await putReceipt(tokens.supervisor, expenseId, PNG);
    const current = await storedFile(expenseId);
    const before = receiptFiles().length;

    const res = await putReceipt(tokens.supervisor, expenseId, { buffer: Buffer.from('hola'), name: 'notas.txt' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('El comprobante debe ser una foto (JPG, PNG o WEBP) o un PDF.');
    expect(await storedFile(expenseId)).toBe(current);
    expect(await eventually(() => receiptFiles().length === before)).toBe(true);
  });

  it('rejects a receipt of more than 5 MB', async () => {
    const expenseId = await newExpense();

    const res = await putReceipt(tokens.supervisor, expenseId, {
      buffer: Buffer.concat([PNG_BYTES, Buffer.alloc(5 * 1024 * 1024)]), name: 'grande.png',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('El comprobante no puede pesar más de 5 MB.');
  });

  it('does not change the receipt of a cancelled expense, and removes the uploaded file', async () => {
    const expenseId = await newExpense({ status: 'cancelled' });
    const before = receiptFiles().length;

    const res = await putReceipt(tokens.supervisor, expenseId, PNG);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No se puede cambiar el comprobante de un gasto cancelado.');
    expect(await storedFile(expenseId)).toBeNull();
    expect(await eventually(() => receiptFiles().length === before)).toBe(true);
  });

  it('responds 404 to a branch user for an expense of another branch, and lets the central admin change it', async () => {
    const expenseId = await newExpense({ branchId: branch2 });
    const before = receiptFiles().length;

    const res = await putReceipt(tokens.supervisor, expenseId, PNG);
    expect(res.status).toBe(404);
    expect(await eventually(() => receiptFiles().length === before)).toBe(true);

    const central = await putReceipt(tokens.admin, expenseId, PNG);
    expect(central.status).toBe(200);
    expect(central.body.data.has_receipt).toBe(true);
  });

  it('responds 404 for an expense that does not exist', async () => {
    const res = await putReceipt(tokens.supervisor, 999999, PNG);

    expect(res.status).toBe(404);
  });

  it.each([
    ['a cashier, without expenses.read', 'cajero'],
    ['a user without expenses.create', 'auditor'],
    ['a warehouse keeper, without expenses permissions', 'almacenista'],
  ])('responds 403 to %s', async (_label, role) => {
    const expenseId = await newExpense();

    const res = await putReceipt(tokens[role], expenseId, PNG);

    expect(res.status).toBe(403);
    expect(await storedFile(expenseId)).toBeNull();
  });
});
