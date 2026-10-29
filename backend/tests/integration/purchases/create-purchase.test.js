// tests/integration/purchases/create-purchase.test.js
// Registro de compras (spec 14, T5): con y sin comprobante, validaciones, la
// entrada al inventario, el costo promedio ponderado, pagado desde caja, el
// cajero sin purchases.read y el alcance por sucursal.
const fs      = require('fs');
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }          = require('../../helpers/auth');
const { createTestUser }   = require('../../helpers/users');
const { openTestRegister, createTestProduct, paymentMethodId } = require('../../helpers/sales');
const { PNG_BYTES }        = require('../../helpers/expenses');
const { todayInMexico }    = require('../../../src/utils/timezone');

const RECEIPTS_DIR = process.env.PURCHASE_RECEIPTS_DIR;
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
  request(app).post('/api/purchases').set('Authorization', `Bearer ${token}`).send(body);

// Multipart, como lo manda el navegador cuando hay comprobante: las líneas
// van como JSON en el campo "items"
const postWithFile = (token, fields, file) => {
  let req = request(app).post('/api/purchases').set('Authorization', `Bearer ${token}`);
  for (const [key, value] of Object.entries(fields)) {
    req = req.field(key, key === 'items' ? JSON.stringify(value) : String(value));
  }
  return req.attach('receipt', file.buffer, file.name);
};

const validPurchase = (items, overrides = {}) => ({
  provider_id:       ids.pepsi,
  payment_method_id: ids.transfer,
  items,
  ...overrides,
});

const fromRegister = (items, overrides = {}) => validPurchase(items, {
  payment_method_id: ids.cash, paid_from_register: true, cash_register_id: 1, ...overrides,
});

const productCost = async (productId) => {
  const [[row]] = await db.query('SELECT purchase_price FROM products WHERE product_id = ?', [productId]);
  return row.purchase_price;
};

const stockOf = async (productId, { branchId = 1, variantId = null } = {}) => {
  const [[row]] = await db.query(
    'SELECT quantity FROM inventory_stock WHERE branch_id = ? AND product_id = ? AND variant_id <=> ?',
    [branchId, productId, variantId]
  );
  return row ? row.quantity : 0;
};

const setStock = (productId, branchId, quantity, variantId = null) =>
  db.query(
    `INSERT INTO inventory_stock (branch_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
    [branchId, productId, variantId, quantity]
  );

beforeAll(async () => {
  fs.rmSync(RECEIPTS_DIR, { recursive: true, force: true });

  const [branch] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Norte', 1)");
  branch2 = branch.insertId;
  const [register] = await db.query(
    "INSERT INTO cash_registers (branch_id, name, is_active) VALUES (?, 'Caja Norte', 1)", [branch2]
  );
  register2 = register.insertId;
  await db.query("INSERT INTO roles (name, description) VALUES ('invitado', 'Rol sin permisos de compras')");

  const supervisor  = await createTestUser({ role: 'supervisor' });
  const cajero      = await createTestUser({ role: 'cajero' });
  const almacenista = await createTestUser({ role: 'almacenista' });
  const admin       = await createTestUser({ role: 'admin', branchId: null });
  const norte       = await createTestUser({ role: 'cajero', branchId: branch2 });
  const invitado    = await createTestUser({ role: 'invitado' });

  ({ sessionId: session1 } = await openTestRegister({ userId: cajero.userId }));
  await openTestRegister({ userId: norte.userId, cashRegisterId: register2 });

  [tokens.supervisor, tokens.cajero, tokens.almacenista, tokens.admin, tokens.invitado] = await Promise.all(
    [supervisor, cajero, almacenista, admin, invitado].map(loginAs)
  );

  ids.cash     = await paymentMethodId('cash');
  ids.card     = await paymentMethodId('card');
  ids.transfer = await paymentMethodId('transfer');
  ids.credit   = await paymentMethodId('credit');
  const [pepsi] = await db.query("INSERT INTO providers (name, is_active) VALUES ('Pepsi', 1)");
  ids.pepsi = pepsi.insertId;
  const [old] = await db.query("INSERT INTO providers (name, is_active) VALUES ('Antiguo', 0)");
  ids.inactiveProvider = old.insertId;
});

describe('register a purchase', () => {
  it('registers a purchase dated today by default, with its lines, total and stock entries', async () => {
    const soda  = await createTestProduct({ purchasePrice: 8, stock: 10 });
    const chips = await createTestProduct({ purchasePrice: 5, stock: 0 });

    const res = await post(tokens.almacenista, validPurchase([
      { product_id: soda.productId,  quantity: 20,  unit_cost: 9.5 },
      { product_id: chips.productId, quantity: 1.5, unit_cost: 4.25 },
    ], { folio: ' F-123 ', notes: ' Entrega del martes ' }));

    expect(res.status).toBe(201);
    const purchase = res.body.data;
    expect(purchase).toMatchObject({
      purchase_date: todayInMexico(), total: 196.38, folio: 'F-123', notes: 'Entrega del martes',
      status: 'active', branch_id: 1, provider_name: 'Pepsi', payment_method_code: 'transfer',
      has_receipt: false, paid_from_register: false, cash_movement: null, created_by_name: 'Test almacenista',
    });
    expect(purchase.items).toEqual([
      expect.objectContaining({ product_id: soda.productId,  variant_id: null, quantity: 20,  unit_cost: 9.5,  subtotal: 190 }),
      expect.objectContaining({ product_id: chips.productId, variant_id: null, quantity: 1.5, unit_cost: 4.25, subtotal: 6.38 }),
    ]);

    expect(await stockOf(soda.productId)).toBe(30);
    expect(await stockOf(chips.productId)).toBe(1.5);
    const [movements] = await db.query(
      `SELECT product_id, operation_type, quantity, quantity_before, quantity_after, reason, reference_id, reference_type
         FROM inventory_movements WHERE reference_type = 'purchase' AND reference_id = ? ORDER BY movement_id`,
      [purchase.purchase_id]
    );
    expect(movements).toEqual([
      {
        product_id: soda.productId, operation_type: 'purchase', quantity: 20, quantity_before: 10, quantity_after: 30,
        reason: `Compra #${purchase.purchase_id} – Pepsi`, reference_id: purchase.purchase_id, reference_type: 'purchase',
      },
      {
        product_id: chips.productId, operation_type: 'purchase', quantity: 1.5, quantity_before: 0, quantity_after: 1.5,
        reason: `Compra #${purchase.purchase_id} – Pepsi`, reference_id: purchase.purchase_id, reference_type: 'purchase',
      },
    ]);
  });

  it('accepts a past date, and the generic provider', async () => {
    const product   = await createTestProduct();
    const yesterday = shiftDay(todayInMexico(), -1);

    const res = await post(tokens.supervisor, validPurchase(
      [{ product_id: product.productId, quantity: 1, unit_cost: 10 }],
      { purchase_date: yesterday, provider_id: 1 }
    ));

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ purchase_date: yesterday, provider_id: 1 });
  });

  it('registers a purchase with a receipt sent as multipart', async () => {
    const product = await createTestProduct();
    const before  = receiptFiles().length;

    const res = await postWithFile(tokens.supervisor, validPurchase(
      [{ product_id: product.productId, quantity: 2, unit_cost: 10 }]
    ), { buffer: PNG_BYTES, name: 'ticket.png' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ has_receipt: true, receipt_name: 'ticket.png', total: 20 });
    expect(receiptFiles().length).toBe(before + 1);
  });

  it('does not keep the receipt when the purchase is rejected', async () => {
    const before = receiptFiles().length;

    const res = await postWithFile(tokens.supervisor, validPurchase([]), { buffer: PNG_BYTES, name: 'ticket.png' });

    expect(res.status).toBe(400);
    expect(await eventually(() => receiptFiles().length === before)).toBe(true);
  });
});

describe('purchase validations', () => {
  let simple;
  let variable;
  let other;

  beforeAll(async () => {
    simple   = await createTestProduct();
    variable = await createTestProduct({ variants: ['CH', 'M'] });
    other    = await createTestProduct({ variants: ['G'] });
  });

  const line = (overrides = {}) => ({ product_id: simple.productId, quantity: 1, unit_cost: 10, ...overrides });

  it.each([
    ['no provider',               () => validPurchase([line()], { provider_id: '' }),                 'El proveedor es requerido'],
    ['an inactive provider',      () => validPurchase([line()], { provider_id: ids.inactiveProvider }), /proveedor no existe o está inactivo/],
    ['Crédito',                   () => validPurchase([line()], { payment_method_id: ids.credit }),    'Una compra no se puede pagar con Crédito'],
    ['a future date',             () => validPurchase([line()], { purchase_date: shiftDay(todayInMexico(), 1) }), 'La fecha de la compra no puede ser futura'],
    ['an invalid date',           () => validPurchase([line()], { purchase_date: '2026-02-30' }),      /fecha de la compra no es válida/],
    ['no lines',                  () => validPurchase([]),                                             'La compra debe tener al menos un producto'],
    ['lines that are not a list', () => validPurchase('no es json'),                                   'Las líneas de la compra no son válidas'],
    ['a quantity of 0',           () => validPurchase([line({ quantity: 0 })]),                        'Línea 1: la cantidad debe ser mayor a 0'],
    ['a quantity with 4 decimals', () => validPurchase([line({ quantity: 1.0001 })]),                  'Línea 1: la cantidad admite hasta 3 decimales'],
    ['a cost of 0',               () => validPurchase([line(), line({ product_id: variable.productId, variant_id: variable.variantIds[0], unit_cost: 0 })]), 'Línea 2: el costo unitario debe ser mayor a 0'],
    ['a cost with 3 decimals',    () => validPurchase([line({ unit_cost: 8.333 })]),                   'Línea 1: el costo unitario admite hasta 2 decimales'],
    ['the same product twice',    () => validPurchase([line(), line({ quantity: 2 })]),                'Línea 2: el producto ya está en otra línea de la compra'],
    ['a variable product without variant', () => validPurchase([line({ product_id: variable.productId })]), /Línea 1: elige la variante de/],
    ['a simple product with a variant',    () => validPurchase([line({ variant_id: variable.variantIds[0] })]), /Línea 1: .* no tiene variantes/],
    ['a variant of another product',       () => validPurchase([line({ product_id: variable.productId, variant_id: other.variantIds[0] })]), 'Línea 1: la variante no existe o está inactiva'],
    ['a product that does not exist',      () => validPurchase([line({ product_id: 999999 })]),        'Línea 1: el producto no existe o está inactivo'],
  ])('rejects %s with 400', async (_, body, message) => {
    const res = await post(tokens.supervisor, body());

    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(typeof message === 'string' ? message : expect.stringMatching(message));
  });

  it('rejects an inactive product and an inactive variant', async () => {
    const inactive = await createTestProduct();
    await db.query('UPDATE products SET is_active = 0 WHERE product_id = ?', [inactive.productId]);
    const withOldVariant = await createTestProduct({ variants: ['XL'] });
    await db.query('UPDATE product_variants SET is_active = 0 WHERE variant_id = ?', [withOldVariant.variantIds[0]]);

    const product = await post(tokens.supervisor, validPurchase([line({ product_id: inactive.productId })]));
    const variant = await post(tokens.supervisor, validPurchase([
      line({ product_id: withOldVariant.productId, variant_id: withOldVariant.variantIds[0] }),
    ]));

    expect(product.body.message).toBe('Línea 1: el producto no existe o está inactivo');
    expect(variant.body.message).toBe('Línea 1: la variante no existe o está inactiva');
  });

  it('rejects more than 200 lines', async () => {
    const lines = Array.from({ length: 201 }, (_, i) => line({ product_id: 100000 + i }));

    const res = await post(tokens.supervisor, validPurchase(lines));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('La compra no puede tener más de 200 productos');
  });

  it('does not move the stock nor the cost of a rejected purchase', async () => {
    const product = await createTestProduct({ purchasePrice: 8, stock: 10 });

    const res = await post(tokens.supervisor, validPurchase([
      { product_id: product.productId, quantity: 5, unit_cost: 20 },
      { product_id: 999999, quantity: 1, unit_cost: 1 },
    ]));

    expect(res.status).toBe(400);
    expect(await stockOf(product.productId)).toBe(10);
    expect(await productCost(product.productId)).toBe(8);
  });
});

describe('weighted average cost', () => {
  it('uses the stock of every branch: 10 pza at $8 and 20 bought at $9.50 give $9.00', async () => {
    const product = await createTestProduct({ purchasePrice: 8, stock: 4 });
    await setStock(product.productId, branch2, 6);

    const res = await post(tokens.supervisor, validPurchase([
      { product_id: product.productId, quantity: 20, unit_cost: 9.5 },
    ]));

    expect(await productCost(product.productId)).toBe(9);
    expect(res.body.data.items[0]).toMatchObject({ cost_before: 8, cost_after: 9 });
  });

  it('adds up the variants of a product: CH 4 and M 6 at $50, 10 CH bought at $56 give $53.00', async () => {
    const shirt = await createTestProduct({ purchasePrice: 50, stock: 0, variants: ['CH', 'M'] });
    const [ch, m] = shirt.variantIds;
    await setStock(shirt.productId, 1, 4, ch);
    await setStock(shirt.productId, 1, 6, m);

    await post(tokens.supervisor, validPurchase([
      { product_id: shirt.productId, variant_id: ch, quantity: 10, unit_cost: 56 },
    ]));

    expect(await productCost(shirt.productId)).toBe(53);
    expect(await stockOf(shirt.productId, { variantId: ch })).toBe(14);
  });

  it('computes the cost once per product with all its lines, and saves it on each line', async () => {
    const shirt = await createTestProduct({ purchasePrice: 50, stock: 5, variants: ['CH', 'M'] });
    const [ch, m] = shirt.variantIds;

    // (10 × 50 + 5 × 56 + 5 × 62) / 20 = 54.50
    const res = await post(tokens.supervisor, validPurchase([
      { product_id: shirt.productId, variant_id: ch, quantity: 5, unit_cost: 56 },
      { product_id: shirt.productId, variant_id: m,  quantity: 5, unit_cost: 62 },
    ]));

    expect(await productCost(shirt.productId)).toBe(54.5);
    expect(res.body.data.items.map(i => [i.cost_before, i.cost_after])).toEqual([[50, 54.5], [50, 54.5]]);
  });

  it('takes the cost of the purchase when there is no stock', async () => {
    const product = await createTestProduct({ purchasePrice: 8, stock: 0 });

    await post(tokens.supervisor, validPurchase([{ product_id: product.productId, quantity: 3, unit_cost: 12.34 }]));

    expect(await productCost(product.productId)).toBe(12.34);
  });

  it('takes the cost of the purchase when the product has no cost', async () => {
    const product = await createTestProduct({ purchasePrice: 0, stock: 50 });

    await post(tokens.supervisor, validPurchase([{ product_id: product.productId, quantity: 2, unit_cost: 7.5 }]));

    expect(await productCost(product.productId)).toBe(7.5);
  });

  it('rounds the new cost to the cent: 2 at $10 and 1 at $11 give $10.33', async () => {
    const product = await createTestProduct({ purchasePrice: 10, stock: 2 });

    await post(tokens.supervisor, validPurchase([{ product_id: product.productId, quantity: 1, unit_cost: 11 }]));

    expect(await productCost(product.productId)).toBe(10.33);
  });
});

describe('purchase paid from the register', () => {
  it('creates its cash movement for the total, linked to the purchase', async () => {
    const product = await createTestProduct();

    const res = await post(tokens.supervisor, fromRegister([
      { product_id: product.productId, quantity: 12, unit_cost: 15.5 },
    ]));

    expect(res.status).toBe(201);
    const purchase = res.body.data;
    expect(purchase).toMatchObject({ paid_from_register: true, total: 186 });
    expect(purchase.cash_movement).toMatchObject({ session_id: session1, register_name: 'Caja 1', session_open: true });
    const [[movement]] = await db.query(
      'SELECT session_id, movement_type, amount, description FROM cash_movements WHERE cash_movement_id = ?',
      [purchase.cash_movement.cash_movement_id]
    );
    expect(movement).toEqual({
      session_id: session1, movement_type: 'purchase', amount: 186, description: `Compra #${purchase.purchase_id}: Pepsi`,
    });
  });

  it('creates no cash movement when not paid from the register', async () => {
    const product = await createTestProduct();
    const [[before]] = await db.query('SELECT COUNT(*) AS n FROM cash_movements');

    await post(tokens.supervisor, validPurchase([{ product_id: product.productId, quantity: 1, unit_cost: 10 }]));

    const [[after]] = await db.query('SELECT COUNT(*) AS n FROM cash_movements');
    expect(after.n).toBe(before.n);
  });

  it.each([
    ['a method other than Efectivo', () => ({ payment_method_id: ids.card }),     'Solo una compra en Efectivo se puede pagar desde caja'],
    ['no register',                  () => ({ cash_register_id: '' }),            'Elige la caja de la que sale el efectivo'],
    ['a register of another branch', () => ({ cash_register_id: register2 }),     'La caja no tiene una sesión abierta en esta sucursal'],
    ['a past date',                  () => ({ purchase_date: shiftDay(todayInMexico(), -1) }), 'Una compra pagada desde caja es de hoy'],
  ])('rejects %s with 400', async (_, overrides, message) => {
    const product = await createTestProduct();

    const res = await post(tokens.supervisor, fromRegister(
      [{ product_id: product.productId, quantity: 1, unit_cost: 10 }], overrides()
    ));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
  });
});

describe('cashier without purchases.read', () => {
  it('can only register purchases paid from the register', async () => {
    const product = await createTestProduct();
    const items = [{ product_id: product.productId, quantity: 6, unit_cost: 10 }];

    const transfer = await post(tokens.cajero, validPurchase(items));
    const register = await post(tokens.cajero, fromRegister(items));

    expect(transfer.status).toBe(403);
    expect(transfer.body.message).toBe('Solo puedes registrar compras pagadas desde tu caja');
    expect(register.status).toBe(201);
    expect(register.body.data).toMatchObject({ paid_from_register: true, branch_id: 1 });
  });
});

describe('branch scope and permissions', () => {
  it('saves the branch of a branch user, even if another one is sent', async () => {
    const product = await createTestProduct();

    const res = await post(tokens.supervisor, validPurchase(
      [{ product_id: product.productId, quantity: 1, unit_cost: 10 }], { branch_id: branch2 }
    ));

    expect(res.body.data.branch_id).toBe(1);
    expect(await stockOf(product.productId, { branchId: branch2 })).toBe(0);
  });

  it('lets the central admin choose the branch, and requires it', async () => {
    const product = await createTestProduct({ stock: 0 });
    const items = [{ product_id: product.productId, quantity: 3, unit_cost: 10 }];

    const without = await post(tokens.admin, validPurchase(items));
    const north   = await post(tokens.admin, validPurchase(items, { branch_id: branch2 }));

    expect(without.status).toBe(400);
    expect(north.status).toBe(201);
    expect(north.body.data.branch_id).toBe(branch2);
    expect(await stockOf(product.productId, { branchId: branch2 })).toBe(3);
  });

  it('responds 403 to a user without purchases.create', async () => {
    const product = await createTestProduct();

    const res = await post(tokens.invitado, validPurchase([{ product_id: product.productId, quantity: 1, unit_cost: 10 }]));

    expect(res.status).toBe(403);
  });
});
