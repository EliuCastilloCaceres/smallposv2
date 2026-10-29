// tests/integration/purchases/purchase-receipt.test.js
// Comprobante después de registrar una compra (spec 15, T2): quién lo subió
// y cuándo, agregarlo, reemplazarlo, las validaciones, el alcance por
// sucursal y los permisos.
const fs      = require('fs');
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }         = require('../../helpers/auth');
const { createTestUser }  = require('../../helpers/users');
const { createTestProduct, paymentMethodId } = require('../../helpers/sales');
const { PNG_BYTES, PDF_BYTES } = require('../../helpers/expenses');

const RECEIPTS_DIR = process.env.PURCHASE_RECEIPTS_DIR;
const receiptFiles = () => (fs.existsSync(RECEIPTS_DIR) ? fs.readdirSync(RECEIPTS_DIR) : []);

// Los archivos sobrantes se borran sin esperar; se revisa unas veces
const eventually = async (check) => {
  for (let i = 0; i < 20; i++) {
    if (check()) return true;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return check();
};

const PNG = { buffer: PNG_BYTES, name: 'ticket pepsi.png' };
const PDF = { buffer: PDF_BYTES, name: 'factura.pdf' };

let tokens = {};
let ids = {};
let branch2;

const putReceipt = (token, purchaseId, file) => {
  const req = request(app).put(`/api/purchases/${purchaseId}/receipt`).set('Authorization', `Bearer ${token}`);
  return file ? req.attach('receipt', file.buffer, file.name) : req;
};

const storedFile = async (purchaseId) => {
  const [[row]] = await db.query('SELECT receipt_file FROM purchases WHERE purchase_id = ?', [purchaseId]);
  return row.receipt_file;
};

// Una compra guardada directo en la BD, sin líneas: basta para el comprobante
const newPurchase = async (overrides = {}) => {
  const [result] = await db.query('INSERT INTO purchases SET ?', [{
    branch_id: 1, purchase_date: '2026-10-28', provider_id: ids.pepsi, payment_method_id: ids.transfer,
    total: 190, created_by: ids.almacenista, ...overrides,
  }]);
  return result.insertId;
};

beforeAll(async () => {
  fs.rmSync(RECEIPTS_DIR, { recursive: true, force: true });

  const [branch] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Norte', 1)");
  branch2 = branch.insertId;
  // Un rol que ve las compras pero no las registra
  const [role] = await db.query("INSERT INTO roles (name, description) VALUES ('auditor', 'Solo ve compras')");
  await db.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT ?, permission_id FROM permissions WHERE module = 'purchases' AND action = 'read'`,
    [role.insertId]
  );

  const almacenista = await createTestUser({ role: 'almacenista' });
  const supervisor  = await createTestUser({ role: 'supervisor' });
  const cajero      = await createTestUser({ role: 'cajero' });
  const auditor     = await createTestUser({ role: 'auditor' });
  const admin       = await createTestUser({ role: 'admin', branchId: null });
  ids.almacenista = almacenista.userId;

  [tokens.almacenista, tokens.supervisor, tokens.cajero, tokens.auditor, tokens.admin] = await Promise.all(
    [almacenista, supervisor, cajero, auditor, admin].map(loginAs)
  );

  ids.transfer = await paymentMethodId('transfer');
  const [pepsi] = await db.query("INSERT INTO providers (name, is_active) VALUES ('Pepsi', 1)");
  ids.pepsi = pepsi.insertId;
});

describe('who uploaded the receipt of a new purchase', () => {
  const register = async (file) => {
    const soda = await createTestProduct({ purchasePrice: 8, stock: 10 });
    const fields = {
      provider_id: ids.pepsi, payment_method_id: ids.transfer,
      items: JSON.stringify([{ product_id: soda.productId, quantity: 20, unit_cost: 9.5 }]),
    };
    let req = request(app).post('/api/purchases').set('Authorization', `Bearer ${tokens.almacenista}`);
    for (const [key, value] of Object.entries(fields)) req = req.field(key, String(value));
    return file ? req.attach('receipt', file.buffer, file.name) : req;
  };

  it('is who registered the purchase, at the time of the registration', async () => {
    const res = await register(PNG);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ has_receipt: true, receipt_uploaded_by_name: 'Test almacenista' });
    expect(res.body.data.receipt_uploaded_at).toBe(res.body.data.created_at);
  });

  it('stays empty when the purchase is registered without a receipt', async () => {
    const res = await register(null);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      has_receipt: false, receipt_uploaded_by_name: null, receipt_uploaded_at: null,
    });
  });
});

describe('PUT /api/purchases/:id/receipt', () => {
  it('lets a warehouse keeper add a receipt to a purchase without one, and serves it to download', async () => {
    const purchaseId = await newPurchase();

    const res = await putReceipt(tokens.almacenista, purchaseId, PNG);
    const receipt = await request(app)
      .get(`/api/purchases/${purchaseId}/receipt`)
      .set('Authorization', `Bearer ${tokens.almacenista}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      purchase_id: purchaseId, has_receipt: true, receipt_name: 'ticket pepsi.png',
      receipt_uploaded_by_name: 'Test almacenista', items: [],
    });
    expect(res.body.data.receipt_uploaded_at).toBeTruthy();
    expect(receipt.status).toBe(200);
    expect(receipt.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(receipt.body, PNG_BYTES)).toBe(0);
  });

  it('shows the receipt in the detail and in the list', async () => {
    const purchaseId = await newPurchase({ folio: 'TARDIO-1' });
    await putReceipt(tokens.almacenista, purchaseId, PNG);

    const detail = await request(app)
      .get(`/api/purchases/${purchaseId}`)
      .set('Authorization', `Bearer ${tokens.supervisor}`);
    const list = await request(app)
      .get('/api/purchases')
      .query({ start_date: '2026-10-01', end_date: '2026-10-31', search: 'TARDIO-1' })
      .set('Authorization', `Bearer ${tokens.supervisor}`);

    expect(detail.body.data).toMatchObject({ has_receipt: true, receipt_uploaded_by_name: 'Test almacenista' });
    expect(list.body.data).toEqual([expect.objectContaining({ purchase_id: purchaseId, has_receipt: true })]);
  });

  it('replaces the receipt, records who replaced it and removes the previous file', async () => {
    const purchaseId = await newPurchase();
    await putReceipt(tokens.almacenista, purchaseId, PNG);
    const previous = await storedFile(purchaseId);

    const res = await putReceipt(tokens.supervisor, purchaseId, PDF);
    const current = await storedFile(purchaseId);
    const receipt = await request(app)
      .get(`/api/purchases/${purchaseId}/receipt`)
      .set('Authorization', `Bearer ${tokens.supervisor}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ receipt_name: 'factura.pdf', receipt_uploaded_by_name: 'Test supervisor' });
    expect(current).not.toBe(previous);
    expect(receiptFiles()).toContain(current);
    expect(await eventually(() => !receiptFiles().includes(previous))).toBe(true);
    expect(receipt.headers['content-type']).toBe('application/pdf');
  });

  it('requires a file', async () => {
    const purchaseId = await newPurchase();

    const res = await putReceipt(tokens.almacenista, purchaseId, null);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Elige el comprobante.');
  });

  it('rejects a receipt of another format and keeps the current one', async () => {
    const purchaseId = await newPurchase();
    await putReceipt(tokens.almacenista, purchaseId, PNG);
    const current = await storedFile(purchaseId);
    const before = receiptFiles().length;

    const res = await putReceipt(tokens.almacenista, purchaseId, { buffer: Buffer.from('hola'), name: 'foto.jpg' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('El comprobante debe ser una foto (JPG, PNG o WEBP) o un PDF.');
    expect(await storedFile(purchaseId)).toBe(current);
    expect(await eventually(() => receiptFiles().length === before)).toBe(true);
  });

  it('rejects a receipt of more than 5 MB', async () => {
    const purchaseId = await newPurchase();

    const res = await putReceipt(tokens.almacenista, purchaseId, {
      buffer: Buffer.concat([PNG_BYTES, Buffer.alloc(5 * 1024 * 1024)]), name: 'grande.png',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('El comprobante no puede pesar más de 5 MB.');
  });

  it('does not change the receipt of a cancelled purchase, and removes the uploaded file', async () => {
    const purchaseId = await newPurchase({ status: 'cancelled' });
    const before = receiptFiles().length;

    const res = await putReceipt(tokens.almacenista, purchaseId, PNG);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No se puede cambiar el comprobante de una compra cancelada.');
    expect(await storedFile(purchaseId)).toBeNull();
    expect(await eventually(() => receiptFiles().length === before)).toBe(true);
  });

  it('responds 404 to a branch user for a purchase of another branch, and lets the central admin change it', async () => {
    const purchaseId = await newPurchase({ branch_id: branch2 });
    const before = receiptFiles().length;

    const res = await putReceipt(tokens.almacenista, purchaseId, PNG);
    expect(res.status).toBe(404);
    expect(await eventually(() => receiptFiles().length === before)).toBe(true);

    const central = await putReceipt(tokens.admin, purchaseId, PNG);
    expect(central.status).toBe(200);
    expect(central.body.data.has_receipt).toBe(true);
  });

  it('responds 404 for a purchase that does not exist', async () => {
    const res = await putReceipt(tokens.almacenista, 999999, PNG);

    expect(res.status).toBe(404);
  });

  it.each([
    ['a cashier, without purchases.read', 'cajero'],
    ['a user without purchases.create', 'auditor'],
  ])('responds 403 to %s', async (_label, role) => {
    const purchaseId = await newPurchase();

    const res = await putReceipt(tokens[role], purchaseId, PNG);

    expect(res.status).toBe(403);
    expect(await storedFile(purchaseId)).toBeNull();
  });
});
