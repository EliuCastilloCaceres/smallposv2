// src/services/purchaseService.js
// Módulo de compras (specs/14-modulo-de-compras.md).
//
// - Una compra guarda proveedor, fecha, sucursal, método de pago (activos,
//   sin Crédito), folio, notas y comprobante opcionales, su total (la suma
//   de sus líneas) y quién la registró. Cada línea lleva producto, variante
//   (obligatoria en un producto variable), cantidad, costo unitario y
//   subtotal.
// - Al registrarla, en la misma transacción: cada línea entra al inventario
//   de la sucursal ('purchase', ligada a la compra) y el costo de cada
//   producto se recalcula con el promedio ponderado global (requisito 9).
// - "Pagado desde caja": solo con Efectivo, de hoy y de una caja con sesión
//   abierta de la sucursal. Se crea su salida en cash_movements, de tipo
//   'purchase', por el total.
// - El comprobante se puede agregar o reemplazar después de registrar la
//   compra, mientras esté activa (specs/15-comprobante-despues-de-guardar.md);
//   se guarda quién lo subió y cuándo.
// - No se edita: se cancela con motivo. Cancelar revierte el inventario
//   ('purchase_cancelled'), todo o nada, y no toca el costo. Si se pagó desde
//   caja y su sesión sigue abierta, registra el reingreso ('purchase_refund').
// - Alcance por sucursal: un usuario con sucursal solo ve y registra las de
//   la suya (lo resuelve el controller); el admin central ve todas.

const db = require('../config/db');
const stockService = require('./stockService');
const {
  NotFoundError, ValidationError, ForbiddenError, ConflictError, InsufficientStockError,
} = require('../errors/AppError');
const { todayInMexico } = require('../utils/timezone');
const {
  isValidDate, toId, toFlag, optionalText, parseOptionalText, parseRecordDate,
  findPaymentMethod, findActiveProvider, assertActiveBranch, lockOpenSession, registerRefund,
} = require('../helpers/cashOutflows');

const FOLIO_MAX = 50;
const NOTES_MAX = 255;
const REASON_MAX = 255;
const MAX_ITEMS = 200;
const MOVEMENT_DESCRIPTION_MAX = 100; // cash_movements.description
const STOCK_REASON_MAX = 255;         // inventory_movements.reason
const MAX_AMOUNT = 9999999999.99;     // decimal(12,2)
const MAX_QUANTITY = 999999999.999;   // decimal(12,3)
const PRODUCT_SEARCH_LIMIT = 10;
const STATUSES = ['active', 'cancelled', 'all'];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ¿n tiene a lo más `decimals` decimales? (tolera el error del punto flotante)
const hasDecimals = (n, decimals) => {
  const scaled = n * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
};

// ─── Validaciones ─────────────────────────────────────────────────────────────

const parseQuantity = (value, line) => {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(n) || n <= 0) {
    throw new ValidationError(`Línea ${line}: la cantidad debe ser mayor a 0`);
  }
  if (!hasDecimals(n, 3)) throw new ValidationError(`Línea ${line}: la cantidad admite hasta 3 decimales`);
  if (n > MAX_QUANTITY) throw new ValidationError(`Línea ${line}: la cantidad es demasiado grande`);
  return Math.round(n * 1000) / 1000;
};

const parseUnitCost = (value, line) => {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(n) || n <= 0) {
    throw new ValidationError(`Línea ${line}: el costo unitario debe ser mayor a 0`);
  }
  if (!hasDecimals(n, 2)) throw new ValidationError(`Línea ${line}: el costo unitario admite hasta 2 decimales`);
  if (n > MAX_AMOUNT) throw new ValidationError(`Línea ${line}: el costo unitario es demasiado grande`);
  return round2(n);
};

// Las líneas llegan como arreglo (JSON) o como texto JSON (multipart, con
// comprobante). Valida su forma; los productos se validan con la BD después.
const parseItems = (value) => {
  let items = value;
  if (typeof value === 'string') {
    try { items = JSON.parse(value); } catch { items = null; }
  }
  if (!Array.isArray(items)) throw new ValidationError('Las líneas de la compra no son válidas');
  if (items.length === 0) throw new ValidationError('La compra debe tener al menos un producto');
  if (items.length > MAX_ITEMS) {
    throw new ValidationError(`La compra no puede tener más de ${MAX_ITEMS} productos`);
  }

  const seen = new Set();
  return items.map((item, i) => {
    const line = i + 1;
    if (!item || typeof item !== 'object') throw new ValidationError(`Línea ${line}: no es válida`);
    const productId = toId(item.product_id);
    if (!productId) throw new ValidationError(`Línea ${line}: el producto no existe o está inactivo`);
    const hasVariant = item.variant_id !== undefined && item.variant_id !== null && item.variant_id !== '';
    const variantId = hasVariant ? toId(item.variant_id) : null;
    if (hasVariant && !variantId) throw new ValidationError(`Línea ${line}: la variante no existe o está inactiva`);

    const key = `${productId}:${variantId ?? 0}`;
    if (seen.has(key)) throw new ValidationError(`Línea ${line}: el producto ya está en otra línea de la compra`);
    seen.add(key);

    const quantity = parseQuantity(item.quantity, line);
    const unitCost = parseUnitCost(item.unit_cost, line);
    const subtotal = round2(quantity * unitCost);
    if (subtotal > MAX_AMOUNT) throw new ValidationError(`Línea ${line}: el subtotal es demasiado grande`);
    return { line, productId, variantId, quantity, unitCost, subtotal };
  });
};

// Productos y variantes de las líneas, activos y bien combinados. Bloquea las
// filas de los productos (FOR UPDATE, en orden de id para no cruzarse con
// otra compra) porque su costo se recalcula en esta transacción. Devuelve
// Map product_id → { name, purchase_price }.
const lockLineProducts = async (conn, items) => {
  const productIds = [...new Set(items.map(i => i.productId))].sort((a, b) => a - b);
  const [productRows] = await conn.query(
    `SELECT product_id, name, is_variable, purchase_price, is_active
       FROM products WHERE product_id IN (?) ORDER BY product_id FOR UPDATE`,
    [productIds]
  );
  const products = new Map(productRows.map(p => [p.product_id, p]));

  const variantIds = items.map(i => i.variantId).filter(id => id !== null);
  const variants = new Map();
  if (variantIds.length > 0) {
    const [variantRows] = await conn.query(
      'SELECT variant_id, product_id, is_active FROM product_variants WHERE variant_id IN (?)',
      [variantIds]
    );
    variantRows.forEach(v => variants.set(v.variant_id, v));
  }

  for (const item of items) {
    const product = products.get(item.productId);
    if (!product || !product.is_active) {
      throw new ValidationError(`Línea ${item.line}: el producto no existe o está inactivo`);
    }
    if (product.is_variable && item.variantId === null) {
      throw new ValidationError(`Línea ${item.line}: elige la variante de «${product.name}»`);
    }
    if (!product.is_variable && item.variantId !== null) {
      throw new ValidationError(`Línea ${item.line}: «${product.name}» no tiene variantes`);
    }
    if (item.variantId !== null) {
      const variant = variants.get(item.variantId);
      if (!variant || !variant.is_active || variant.product_id !== item.productId) {
        throw new ValidationError(`Línea ${item.line}: la variante no existe o está inactiva`);
      }
    }
  }
  return products;
};

// ─── Costo promedio ponderado (requisito 9) ───────────────────────────────────
// Una vez por producto, con todas sus líneas de la compra:
//   (E × C + Σ cantidad × costo) / (E + Σ cantidad)
// E: existencia total del producto antes de las entradas de esta compra (todas
// las sucursales y variantes). C: su costo actual. Si E ≤ 0 o C = 0, el costo
// nuevo es el promedio de las líneas.

const weightedCost = ({ stock, currentCost, quantity, value }) => {
  if (stock <= 0 || currentCost <= 0) return round2(value / quantity);
  return round2((stock * currentCost + value) / (stock + quantity));
};

// Map product_id → { before, after }. Se llama antes de aplicar las entradas.
const computeNewCosts = async (conn, items, products) => {
  const byProduct = new Map();
  for (const item of items) {
    const acc = byProduct.get(item.productId) ?? { quantity: 0, value: 0 };
    acc.quantity += item.quantity;
    acc.value    += item.quantity * item.unitCost;
    byProduct.set(item.productId, acc);
  }

  const [stockRows] = await conn.query(
    `SELECT product_id, COALESCE(SUM(quantity), 0) AS stock
       FROM inventory_stock WHERE product_id IN (?) GROUP BY product_id`,
    [[...byProduct.keys()]]
  );
  const stockByProduct = new Map(stockRows.map(r => [r.product_id, Number(r.stock)]));

  const costs = new Map();
  for (const [productId, { quantity, value }] of byProduct) {
    const before = Number(products.get(productId).purchase_price);
    const after  = weightedCost({ stock: stockByProduct.get(productId) ?? 0, currentCost: before, quantity, value });
    costs.set(productId, { before, after });
  }
  return costs;
};

// ─── Lectura ──────────────────────────────────────────────────────────────────

const DETAIL_SQL = `
  SELECT p.purchase_id, DATE_FORMAT(p.purchase_date, '%Y-%m-%d') AS purchase_date,
         p.total, p.folio, p.notes, p.status,
         p.branch_id, b.name AS branch_name,
         p.provider_id, pv.name AS provider_name,
         p.payment_method_id, pm.name AS payment_method_name, pm.code AS payment_method_code,
         p.receipt_file, p.receipt_name,
         p.receipt_uploaded_by, p.receipt_uploaded_at,
         CONCAT_WS(' ', ru.first_name, ru.last_name) AS receipt_uploaded_by_name,
         p.created_at, CONCAT_WS(' ', cu.first_name, cu.last_name) AS created_by_name,
         p.cash_movement_id, cm.session_id, cr.name AS register_name, crs.closed_at AS session_closed_at,
         p.cancel_reason, p.cancelled_at, CONCAT_WS(' ', xu.first_name, xu.last_name) AS cancelled_by_name,
         p.refund_cash_movement_id
    FROM purchases p
    JOIN branches b         ON b.branch_id = p.branch_id
    JOIN providers pv       ON pv.provider_id = p.provider_id
    JOIN payment_methods pm ON pm.payment_method_id = p.payment_method_id
    JOIN users cu           ON cu.user_id = p.created_by
    LEFT JOIN users xu      ON xu.user_id = p.cancelled_by
    LEFT JOIN users ru      ON ru.user_id = p.receipt_uploaded_by
    LEFT JOIN cash_movements cm          ON cm.cash_movement_id = p.cash_movement_id
    LEFT JOIN cash_register_sessions crs ON crs.session_id = cm.session_id
    LEFT JOIN cash_registers cr          ON cr.cash_register_id = crs.cash_register_id
`;

const ITEMS_SQL = `
  SELECT pi.purchase_item_id, pi.product_id, pr.name AS product_name, pr.sku, pr.uom,
         pi.variant_id, v.label AS variant_label, v.sku AS variant_sku,
         pi.quantity, pi.unit_cost, pi.subtotal, pi.cost_before, pi.cost_after
    FROM purchase_items pi
    JOIN products pr              ON pr.product_id = pi.product_id
    LEFT JOIN product_variants v  ON v.variant_id = pi.variant_id
   WHERE pi.purchase_id = ?
   ORDER BY pi.purchase_item_id
`;

const toDetail = (r, items) => ({
  purchase_id:         r.purchase_id,
  purchase_date:       r.purchase_date,
  total:               r.total,
  folio:               r.folio,
  notes:               r.notes,
  status:              r.status,
  branch_id:           r.branch_id,
  branch_name:         r.branch_name,
  provider_id:         r.provider_id,
  provider_name:       r.provider_name,
  payment_method_id:   r.payment_method_id,
  payment_method_name: r.payment_method_name,
  payment_method_code: r.payment_method_code,
  has_receipt:         r.receipt_file !== null,
  receipt_name:        r.receipt_name,
  receipt_uploaded_at: r.receipt_uploaded_at,
  receipt_uploaded_by_name: r.receipt_uploaded_by === null ? null : r.receipt_uploaded_by_name,
  created_at:          r.created_at,
  created_by_name:     r.created_by_name,
  paid_from_register:  r.cash_movement_id !== null,
  cash_movement:       r.cash_movement_id === null ? null : {
    cash_movement_id: r.cash_movement_id,
    session_id:       r.session_id,
    register_name:    r.register_name,
    session_open:     r.session_closed_at === null,
  },
  cancel_reason:       r.cancel_reason,
  cancelled_at:        r.cancelled_at,
  cancelled_by_name:   r.status === 'cancelled' ? r.cancelled_by_name : null,
  refund_registered:   r.refund_cash_movement_id !== null,
  items,
});

// branchId null = cualquier sucursal (admin central). Una compra de otra
// sucursal responde igual que una que no existe.
const findPurchase = async (conn, { purchaseId, branchId = null }) => {
  const params = [toId(purchaseId)];
  let branchFilter = '';
  if (branchId !== null) { branchFilter = 'AND p.branch_id = ?'; params.push(branchId); }
  const [rows] = await conn.query(`${DETAIL_SQL} WHERE p.purchase_id = ? ${branchFilter}`, params);
  if (rows.length === 0) throw new NotFoundError('Compra no encontrada');
  return rows[0];
};

const loadDetail = async (conn, row) => {
  const [items] = await conn.query(ITEMS_SQL, [row.purchase_id]);
  return toDetail(row, items);
};

const getPurchaseById = async ({ purchaseId, branchId = null }) =>
  loadDetail(db, await findPurchase(db, { purchaseId, branchId }));

// Archivo del comprobante: { fileName, originalName }
const getReceipt = async ({ purchaseId, branchId = null }) => {
  const row = await findPurchase(db, { purchaseId, branchId });
  if (!row.receipt_file) throw new NotFoundError('La compra no tiene comprobante');
  return { fileName: row.receipt_file, originalName: row.receipt_name };
};

// Lista con filtros y paginación. summary: total y número de las compras
// ACTIVAS del filtro, sin importar el filtro de estado (requisito 32). La
// búsqueda encuentra el folio, las notas o un producto de sus líneas (nombre,
// SKU o SKU de variante).
const listPurchases = async ({
  branchId = null, startDate, endDate, providerId, paymentMethodId,
  status = 'active', search, page = 1, limit = 20,
}) => {
  if (!STATUSES.includes(status)) throw new ValidationError('El estado debe ser active, cancelled o all');
  if (startDate && !isValidDate(startDate)) throw new ValidationError('start_date no es una fecha válida (YYYY-MM-DD)');
  if (endDate && !isValidDate(endDate)) throw new ValidationError('end_date no es una fecha válida (YYYY-MM-DD)');
  if (startDate && endDate && startDate > endDate) {
    throw new ValidationError('start_date no puede ser posterior a end_date');
  }

  const where  = ['1=1'];
  const params = [];
  if (branchId !== null)     { where.push('p.branch_id = ?');         params.push(branchId); }
  if (startDate)             { where.push('p.purchase_date >= ?');    params.push(startDate); }
  if (endDate)               { where.push('p.purchase_date <= ?');    params.push(endDate); }
  if (toId(providerId))      { where.push('p.provider_id = ?');       params.push(toId(providerId)); }
  if (toId(paymentMethodId)) { where.push('p.payment_method_id = ?'); params.push(toId(paymentMethodId)); }
  if (search && search.trim()) {
    where.push(`(p.folio LIKE ? OR p.notes LIKE ? OR EXISTS (
      SELECT 1
        FROM purchase_items si
        JOIN products sp             ON sp.product_id = si.product_id
        LEFT JOIN product_variants sv ON sv.variant_id = si.variant_id
       WHERE si.purchase_id = p.purchase_id
         AND (sp.name LIKE ? OR sp.sku LIKE ? OR sv.sku LIKE ?)
    ))`);
    const like = `%${search.trim()}%`;
    params.push(like, like, like, like, like);
  }
  const baseWhere = where.join(' AND ');

  const statusWhere  = status === 'all' ? '' : ' AND p.status = ?';
  const statusParams = status === 'all' ? [] : [status];

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const safePage  = Math.max(parseInt(page, 10) || 1, 1);

  const [rows] = await db.query(
    `SELECT p.purchase_id, DATE_FORMAT(p.purchase_date, '%Y-%m-%d') AS purchase_date,
            p.total, p.folio, p.status, p.created_at,
            p.branch_id, b.name AS branch_name,
            pv.name AS provider_name, pm.name AS payment_method_name,
            (SELECT COUNT(*) FROM purchase_items c WHERE c.purchase_id = p.purchase_id) AS item_count,
            (p.cash_movement_id IS NOT NULL) AS paid_from_register,
            (p.receipt_file IS NOT NULL) AS has_receipt
       FROM purchases p
       JOIN branches b         ON b.branch_id = p.branch_id
       JOIN providers pv       ON pv.provider_id = p.provider_id
       JOIN payment_methods pm ON pm.payment_method_id = p.payment_method_id
      WHERE ${baseWhere}${statusWhere}
      ORDER BY p.purchase_date DESC, p.created_at DESC, p.purchase_id DESC
      LIMIT ? OFFSET ?`,
    [...params, ...statusParams, safeLimit, (safePage - 1) * safeLimit]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM purchases p WHERE ${baseWhere}${statusWhere}`,
    [...params, ...statusParams]
  );

  const [[summary]] = await db.query(
    `SELECT COUNT(*) AS count, COALESCE(SUM(p.total), 0) AS total_amount
       FROM purchases p WHERE ${baseWhere} AND p.status = 'active'`,
    params
  );

  return {
    data: rows.map(r => ({
      ...r,
      item_count:         Number(r.item_count),
      paid_from_register: !!r.paid_from_register,
      has_receipt:        !!r.has_receipt,
    })),
    pagination: {
      page:       safePage,
      limit:      safeLimit,
      total:      Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / safeLimit)),
    },
    summary: {
      count:        Number(summary.count),
      total_amount: +Number(summary.total_amount).toFixed(2),
    },
  };
};

// Datos para los formularios de compra (módulo y POS), para que el cajero y
// el almacenista no necesiten providers.read ni otros permisos de catálogo.
// branchId null (admin central): las cajas abiertas de todas las sucursales
// y la lista de sucursales activas para elegir.
const getOptions = async ({ branchId = null }) => {
  const [paymentMethods] = await db.query(
    `SELECT payment_method_id, code, name
       FROM payment_methods WHERE is_active = 1 AND code <> 'credit' ORDER BY name ASC`
  );
  const [providers] = await db.query(
    'SELECT provider_id, name FROM providers WHERE is_active = 1 ORDER BY name ASC'
  );
  const [registers] = await db.query(
    `SELECT cr.cash_register_id, cr.name, cr.branch_id, b.name AS branch_name, s.session_id
       FROM cash_registers cr
       JOIN branches b ON b.branch_id = cr.branch_id
       JOIN cash_register_sessions s ON s.cash_register_id = cr.cash_register_id AND s.closed_at IS NULL
      WHERE cr.is_active = 1 ${branchId !== null ? 'AND cr.branch_id = ?' : ''}
      ORDER BY b.name ASC, cr.name ASC`,
    branchId !== null ? [branchId] : []
  );
  const result = { payment_methods: paymentMethods, providers, registers };
  if (branchId === null) {
    const [branches] = await db.query(
      'SELECT branch_id, name FROM branches WHERE is_active = 1 ORDER BY name ASC'
    );
    result.branches = branches;
  }
  return result;
};

// Productos para las líneas: hasta 10 activos por nombre, SKU o SKU de una
// variante activa, primero los de SKU exacto (el lector de códigos de
// barras). Con su costo actual, sus variantes activas y el stock en la
// sucursal (branchId null: sin stock).
const searchProducts = async ({ branchId = null, search }) => {
  const q = optionalText(search);
  if (!q) return [];
  const like = `%${q}%`;

  const [productRows] = await db.query(
    `SELECT p.product_id, p.name, p.sku, p.uom, p.purchase_price, (p.is_variable = 1) AS is_variable
       FROM products p
      WHERE p.is_active = 1
        AND (p.name LIKE ? OR p.sku LIKE ? OR EXISTS (
          SELECT 1 FROM product_variants v
           WHERE v.product_id = p.product_id AND v.is_active = 1 AND v.sku LIKE ?
        ))
      ORDER BY (p.sku = ? OR EXISTS (
                 SELECT 1 FROM product_variants v
                  WHERE v.product_id = p.product_id AND v.is_active = 1 AND v.sku = ?
               )) DESC,
               p.name ASC
      LIMIT ?`,
    [like, like, like, q, q, PRODUCT_SEARCH_LIMIT]
  );
  if (productRows.length === 0) return [];

  const ids = productRows.map(p => p.product_id);
  const [variantRows] = await db.query(
    `SELECT variant_id, product_id, label, sku
       FROM product_variants WHERE product_id IN (?) AND is_active = 1
      ORDER BY label ASC`,
    [ids]
  );
  let stockRows = [];
  if (branchId !== null) {
    [stockRows] = await db.query(
      'SELECT product_id, variant_id, quantity FROM inventory_stock WHERE branch_id = ? AND product_id IN (?)',
      [branchId, ids]
    );
  }
  const stockOf = (productId, variantId) => {
    if (branchId === null) return null;
    const row = stockRows.find(s => s.product_id === productId && s.variant_id === variantId);
    return row ? Number(row.quantity) : 0;
  };

  return productRows.map(p => {
    const isVariable = !!p.is_variable;
    return {
      product_id:     p.product_id,
      name:           p.name,
      sku:            p.sku,
      uom:            p.uom,
      purchase_price: Number(p.purchase_price),
      is_variable:    isVariable,
      stock:          isVariable ? null : stockOf(p.product_id, null),
      variants:       isVariable
        ? variantRows.filter(v => v.product_id === p.product_id).map(v => ({
          variant_id: v.variant_id,
          label:      v.label,
          sku:        v.sku,
          stock:      stockOf(p.product_id, v.variant_id),
        }))
        : [],
    };
  });
};

// ─── Registro ─────────────────────────────────────────────────────────────────

// canReadPurchases: sin purchases.read (el cajero) solo se aceptan compras
// pagadas desde caja (requisito 28). receipt: { fileName, originalName } del
// comprobante ya guardado, o null.
const createPurchase = async ({ branchId, userId, canReadPurchases, data, receipt = null }) => {
  const paidFromRegister = toFlag(data.paid_from_register);
  if (!paidFromRegister && !canReadPurchases) {
    throw new ForbiddenError('Solo puedes registrar compras pagadas desde tu caja');
  }

  const folio = parseOptionalText(data.folio, FOLIO_MAX, `El folio no puede superar los ${FOLIO_MAX} caracteres`);
  const notes = parseOptionalText(data.notes, NOTES_MAX, `Las notas no pueden superar los ${NOTES_MAX} caracteres`);
  const purchaseDate = parseRecordDate(data.purchase_date, 'de la compra');
  if (paidFromRegister && purchaseDate !== todayInMexico()) {
    throw new ValidationError('Una compra pagada desde caja es de hoy');
  }
  const items = parseItems(data.items);
  const total = round2(items.reduce((sum, i) => sum + i.subtotal, 0));
  if (total > MAX_AMOUNT) throw new ValidationError('El total de la compra es demasiado grande');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await assertActiveBranch(conn, branchId);
    const provider = await findActiveProvider(conn, data.provider_id);
    if (!provider) throw new ValidationError('El proveedor es requerido');
    const paymentMethod = await findPaymentMethod(conn, data.payment_method_id, 'Una compra no se puede pagar con Crédito');

    let sessionId = null;
    if (paidFromRegister) {
      if (paymentMethod.code !== 'cash') {
        throw new ValidationError('Solo una compra en Efectivo se puede pagar desde caja');
      }
      if (!toId(data.cash_register_id)) throw new ValidationError('Elige la caja de la que sale el efectivo');
      sessionId = await lockOpenSession(conn, { cashRegisterId: data.cash_register_id, branchId });
    }

    const products = await lockLineProducts(conn, items);
    // Antes de las entradas: E es la existencia previa a esta compra
    const costs = await computeNewCosts(conn, items, products);

    // Con comprobante, lo subió quien registra, a la hora del registro
    const [result] = await conn.query(
      `INSERT INTO purchases
         (branch_id, purchase_date, provider_id, payment_method_id, folio, notes, total,
          receipt_file, receipt_name, receipt_uploaded_by, receipt_uploaded_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? IS NULL, NULL, CURRENT_TIMESTAMP), ?)`,
      [
        branchId, purchaseDate, provider.provider_id, paymentMethod.payment_method_id, folio, notes, total,
        receipt?.fileName ?? null, receipt?.originalName ?? null, receipt ? userId : null,
        receipt?.fileName ?? null, userId,
      ]
    );
    const purchaseId = result.insertId;

    await conn.query(
      `INSERT INTO purchase_items
         (purchase_id, product_id, variant_id, quantity, unit_cost, subtotal, cost_before, cost_after)
       VALUES ?`,
      [items.map(i => [
        purchaseId, i.productId, i.variantId, i.quantity, i.unitCost, i.subtotal,
        costs.get(i.productId).before, costs.get(i.productId).after,
      ])]
    );

    for (const [productId, { after }] of costs) {
      await conn.query('UPDATE products SET purchase_price = ? WHERE product_id = ?', [after, productId]);
    }

    const stockReason = `Compra #${purchaseId} – ${provider.name}`.slice(0, STOCK_REASON_MAX);
    for (const item of items) {
      await stockService.applyStockMovement(conn, {
        branchId,
        productId:     item.productId,
        variantId:     item.variantId,
        delta:         item.quantity,
        operationType: 'purchase',
        reason:        stockReason,
        referenceId:   purchaseId,
        referenceType: 'purchase',
        userId,
      });
    }

    if (paidFromRegister) {
      const [movement] = await conn.query(
        `INSERT INTO cash_movements (session_id, movement_type, amount, description, user_id)
         VALUES (?, 'purchase', ?, ?, ?)`,
        [sessionId, total, `Compra #${purchaseId}: ${provider.name}`.slice(0, MOVEMENT_DESCRIPTION_MAX), userId]
      );
      await conn.query(
        'UPDATE purchases SET cash_movement_id = ? WHERE purchase_id = ?',
        [movement.insertId, purchaseId]
      );
    }

    await conn.commit();
    return getPurchaseById({ purchaseId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── Cancelación ──────────────────────────────────────────────────────────────

// refund: 'registered' si se registró el reingreso en la sesión abierta,
// 'session_closed' si se pagó desde caja pero su sesión ya se cerró, o null
// si no se pagó desde caja. El costo de los productos no cambia (decisión
// #34 del borrador).
const cancelPurchase = async ({ purchaseId, branchId = null, userId, reason }) => {
  const cleanReason = optionalText(reason);
  if (!cleanReason) throw new ValidationError('El motivo de la cancelación es requerido');
  if (cleanReason.length > REASON_MAX) {
    throw new ValidationError(`El motivo no puede superar los ${REASON_MAX} caracteres`);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const params = [toId(purchaseId)];
    let branchFilter = '';
    if (branchId !== null) { branchFilter = 'AND branch_id = ?'; params.push(branchId); }
    const [[purchase]] = await conn.query(
      `SELECT purchase_id, branch_id, total, status, cash_movement_id
         FROM purchases WHERE purchase_id = ? ${branchFilter} FOR UPDATE`,
      params
    );
    if (!purchase) throw new NotFoundError('Compra no encontrada');
    if (purchase.status === 'cancelled') throw new ValidationError('La compra ya está cancelada');

    // Reversión del inventario, todo o nada (requisito 17): si a una línea le
    // falta stock, el rollback deshace las salidas que ya se aplicaron
    const [items] = await conn.query(
      `SELECT pi.product_id, pi.variant_id, pi.quantity, pr.name, v.label
         FROM purchase_items pi
         JOIN products pr             ON pr.product_id = pi.product_id
         LEFT JOIN product_variants v ON v.variant_id = pi.variant_id
        WHERE pi.purchase_id = ?
        ORDER BY pi.purchase_item_id`,
      [purchase.purchase_id]
    );
    for (const item of items) {
      try {
        await stockService.applyStockMovement(conn, {
          branchId:      purchase.branch_id,
          productId:     item.product_id,
          variantId:     item.variant_id,
          delta:         -Number(item.quantity),
          operationType: 'purchase_cancelled',
          reason:        `Cancelación de la compra #${purchase.purchase_id}`,
          referenceId:   purchase.purchase_id,
          referenceType: 'purchase',
          userId,
        });
      } catch (err) {
        if (!(err instanceof InsufficientStockError)) throw err;
        const name = item.label ? `${item.name} (${item.label})` : item.name;
        throw new ConflictError(`No hay stock suficiente de «${name}» para revertir la compra.`);
      }
    }

    const { refund, refundMovementId } = await registerRefund(conn, {
      cashMovementId: purchase.cash_movement_id,
      movementType:   'purchase_refund',
      amount:         purchase.total,
      description:    `Reingreso de la compra #${purchase.purchase_id}`,
      userId,
    });

    await conn.query(
      `UPDATE purchases
          SET status = 'cancelled', cancel_reason = ?, cancelled_by = ?, cancelled_at = NOW(),
              refund_cash_movement_id = ?
        WHERE purchase_id = ?`,
      [cleanReason, userId, refundMovementId, purchase.purchase_id]
    );

    await conn.commit();
    return { purchase: await getPurchaseById({ purchaseId: purchase.purchase_id }), refund };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── Comprobante después de registrar ────────────────────────────────────────

// Agrega o reemplaza el comprobante de una compra activa (spec 15,
// requisitos 4–7). receipt: { fileName, originalName } del archivo ya
// guardado. Devuelve el detalle y el archivo anterior (previousFile), que el
// controller borra después de guardar.
const replaceReceipt = async ({ purchaseId, branchId = null, userId, receipt }) => {
  if (!receipt) throw new ValidationError('Elige el comprobante.');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const params = [toId(purchaseId)];
    let branchFilter = '';
    if (branchId !== null) { branchFilter = 'AND branch_id = ?'; params.push(branchId); }
    const [[purchase]] = await conn.query(
      `SELECT purchase_id, status, receipt_file
         FROM purchases WHERE purchase_id = ? ${branchFilter} FOR UPDATE`,
      params
    );
    if (!purchase) throw new NotFoundError('Compra no encontrada');
    if (purchase.status === 'cancelled') {
      throw new ValidationError('No se puede cambiar el comprobante de una compra cancelada.');
    }

    await conn.query(
      `UPDATE purchases
          SET receipt_file = ?, receipt_name = ?, receipt_uploaded_by = ?, receipt_uploaded_at = NOW()
        WHERE purchase_id = ?`,
      [receipt.fileName, receipt.originalName, userId, purchase.purchase_id]
    );

    await conn.commit();
    return {
      purchase:     await getPurchaseById({ purchaseId: purchase.purchase_id }),
      previousFile: purchase.receipt_file,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = {
  listPurchases, getPurchaseById, getReceipt, getOptions, searchProducts, createPurchase, cancelPurchase,
  replaceReceipt,
};
