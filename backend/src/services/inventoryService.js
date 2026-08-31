// src/services/inventoryService.js
// Gestión de inventario: stock actual, ajustes manuales, ajuste masivo,
// traspasos entre sucursales y bitácora de movimientos.

const db           = require('../config/db');
const stockService = require('./stockService');
const { NotFoundError, ValidationError } = require('../errors/AppError');
// FIX: getMovements comparaba fechas de pared (México) directo contra
// m.created_at (hora del servidor) — mismo bug ya corregido en
// orderService.js/reportService.js. Se usa el mismo módulo compartido.
const { toServerRange, todayInMexico } = require('../utils/timezone');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OPERATION_TYPES = ['entry', 'exit', 'purchase', 'sale', 'return', 'adjustment', 'transfer_out', 'transfer_in'];

const ADJUSTMENT_REASONS = [
  'Conteo físico',
  'Merma',
  'Producto dañado',
  'Error de registro',
  'Compra a proveedor',
  'Devolución de cliente',
  'Otro',
];

// Verifica que el producto existe (ya no tiene branch_id — catálogo global)
const assertProductExists = async (productId) => {
  const [[product]] = await db.query(
    'SELECT product_id FROM products WHERE product_id = ? AND is_active = 1',
    [productId]
  );
  if (!product) throw new NotFoundError('Producto no encontrado');
};

// ─── getStockByBranch ─────────────────────────────────────────────────────────
// Devuelve el stock agrupado por producto.
// Productos simples: un solo registro con quantity.
// Productos variables: un registro por variante activa.
// Soporta paginación y búsqueda por nombre/SKU.

const getStockByBranch = async ({ branchId, filters = {} }) => {
  const { search, page = 1, limit = 30, low_stock, category_id } = filters;

  const safeLimit = Math.min(Math.max(parseInt(limit) || 30, 1), 100);
  const safePage  = Math.max(parseInt(page) || 1, 1);
  const offset    = (safePage - 1) * safeLimit;

  const conditions = ['p.is_active = 1'];
  const params     = [];

  // [FIX] Antes solo `visibleCategories` (para los chips) sabía qué
  // categorías están ocultas para esta sucursal — la query de stock nunca
  // las excluía, así que sus productos seguían apareciendo en "Todas"
  // aunque su chip no se mostrara. Mismo modelo opt-out que
  // categoryService.getVisibleForBranch: una fila en
  // branch_hidden_categories = oculta; sin fila = visible. Productos sin
  // categoría (category_id NULL) nunca matchean el NOT EXISTS, así que
  // siempre quedan visibles.
  conditions.push(`NOT EXISTS (
    SELECT 1 FROM branch_hidden_categories bhc
    WHERE bhc.branch_id = ? AND bhc.category_id = p.category_id
  )`);
  params.push(branchId);

  if (search) {
    conditions.push(`(
      p.name LIKE ? OR p.sku LIKE ? OR EXISTS (
        SELECT 1 FROM product_variants pv2
        WHERE pv2.product_id = p.product_id
          AND pv2.is_active  = 1
          AND pv2.sku LIKE ?
      )
    )`);
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (category_id) {
    conditions.push('p.category_id = ?');
    params.push(category_id);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  // Total de productos únicos (para paginación)
  const [[{ total }]] = await db.query(
    `SELECT COUNT(DISTINCT p.product_id) AS total
     FROM products p ${where}`,
    params
  );

  // ── Paso 1: fijar qué productos van en esta página ──
  // Se pagina sobre `products` sola (sin JOIN a variantes), así un producto
  // con varias variantes cuenta como UN solo lugar en la página — nunca
  // queda partido entre dos páginas.
  const [pageRows] = await db.query(
    `SELECT p.product_id
     FROM products p
     ${where}
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  if (pageRows.length === 0) {
    return {
      data: [],
      pagination: { total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  const productIds   = pageRows.map(r => r.product_id);
  const idPlaceholders = productIds.map(() => '?').join(',');

  // ── Paso 2: traer el detalle completo (categoría, variantes, stock) SOLO
  // de esos productos, sin LIMIT — para que ninguna variante se quede fuera.
  const [rows] = await db.query(
    `SELECT
       p.product_id, p.sku, p.name, p.image,
       (p.is_variable = 1) AS is_variable, p.uom,
       c.name  AS category_name,
       c.color AS category_color,
       pv.variant_id, pv.label AS variant_label, pv.sku AS variant_sku,
       COALESCE(s.quantity, 0) AS quantity
     FROM products p
     LEFT JOIN categories c         ON p.category_id = c.category_id
     LEFT JOIN product_variants pv  ON p.product_id  = pv.product_id
                                    AND pv.is_active  = 1
     LEFT JOIN inventory_stock s    ON p.product_id  = s.product_id
                                    AND s.branch_id   = ?
                                    AND s.variant_id <=> pv.variant_id
     WHERE p.product_id IN (${idPlaceholders})
     ORDER BY p.created_at DESC, pv.label ASC`,
    [branchId, ...productIds]
  );

  // Agrupar variantes bajo su producto
  const productsMap = new Map();
  for (const row of rows) {
    if (!productsMap.has(row.product_id)) {
      productsMap.set(row.product_id, {
        product_id:     row.product_id,
        sku:            row.sku,
        name:           row.name,
        image:          row.image,
        is_variable:    Boolean(row.is_variable),
        uom:            row.uom,
        category_name:  row.category_name,
        category_color: row.category_color,
        total_stock:    0,
        variants:       [],
      });
    }
    const product = productsMap.get(row.product_id);

    if (row.is_variable && row.variant_id) {
      product.variants.push({
        variant_id:    row.variant_id,
        label:         row.variant_label,
        sku:           row.variant_sku,
        quantity:      row.quantity,
      });
      product.total_stock += row.quantity;
    } else if (!row.is_variable) {
      product.total_stock = row.quantity;
    }
  }

  let data = Array.from(productsMap.values());

  // Filtro de stock bajo (después de agrupar)
  if (low_stock === 'true' || low_stock === '1') {
    data = data.filter(p => p.total_stock <= 5);
  }

  return {
    data,
    pagination: {
      total,
      page:       safePage,
      limit:      safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
};

// ─── getMovements ─────────────────────────────────────────────────────────────

const getMovements = async ({ branchId, filters = {} }) => {
  const {
    product_id,
    operation_type,
    date_from,
    date_to,
    page  = 1,
    limit = 30,
  } = filters;

  const safeLimit = Math.min(Math.max(parseInt(limit) || 30, 1), 100);
  const safePage  = Math.max(parseInt(page) || 1, 1);
  const offset    = (safePage - 1) * safeLimit;

  // FIX: antes usaba new Date().toISOString().slice(0,10) para "hoy" — esa
  // fecha sale en UTC, no en México, así que cerca de medianoche (México
  // va 6h detrás de UTC) el default de "hoy" podía ser en realidad el día
  // siguiente. todayInMexico() calcula la fecha de pared correcta.
  const now      = todayInMexico();
  const fromDate = date_from || now;
  const toDate   = date_to   || now;

  // FIX: fromDate/toDate son fechas de pared en México (las que manda el
  // frontend o el default de arriba); se traducen al rango equivalente en
  // hora del servidor antes de comparar contra m.created_at, o un
  // movimiento cerca de medianoche quedaba en el día equivocado.
  const [serverFrom, serverTo] = await toServerRange(fromDate, toDate);

  const conditions = ['m.branch_id = ?', 'm.created_at BETWEEN ? AND ?'];
  const params     = [branchId, serverFrom, serverTo];

  if (operation_type) {
    conditions.push('m.operation_type = ?');
    params.push(operation_type);
  }
  if (product_id) {
    conditions.push('m.product_id = ?');
    params.push(product_id);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM inventory_movements m ${where}`,
    params
  );

  const [rows] = await db.query(
    `SELECT
       m.movement_id, m.operation_type, m.quantity,
       m.quantity_before, m.quantity_after,
       m.reason, m.reference_id, m.reference_type, m.created_at,
       p.name  AS product_name,  p.sku  AS product_sku,
       pv.label AS variant_label, pv.sku AS variant_sku,
       CONCAT(u.first_name, ' ', u.last_name) AS user_name, u.username
     FROM inventory_movements m
     JOIN  products p            ON m.product_id  = p.product_id
     LEFT JOIN product_variants pv ON m.variant_id = pv.variant_id
     JOIN  users u               ON m.user_id     = u.user_id
     ${where}
     ORDER BY m.movement_id DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  return {
    data: rows,
    pagination: {
      total,
      page:       safePage,
      limit:      safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
};

// ─── createAdjustment ─────────────────────────────────────────────────────────

const createAdjustment = async ({
  branchId, productId, variantId = null,
  operationType, quantity, reason, userId,
}) => {
  if (!['entry', 'exit'].includes(operationType))
    throw new ValidationError('operationType debe ser "entry" o "exit"');
  if (!quantity || quantity <= 0)
    throw new ValidationError('La cantidad debe ser mayor a 0');
  if (!reason?.trim())
    throw new ValidationError('El motivo del ajuste es requerido');

  await assertProductExists(productId);

  // Si el producto es variable, verificar que la variante le pertenece
  if (variantId) {
    const [[variant]] = await db.query(
      'SELECT variant_id FROM product_variants WHERE variant_id = ? AND product_id = ? AND is_active = 1',
      [variantId, productId]
    );
    if (!variant) throw new NotFoundError('Variante no encontrada en este producto');
  }
  
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await stockService.manualAdjustment(conn, {
      branchId, productId, variantId,
      operationType, quantity, reason: reason.trim(), userId,
    });
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── bulkAdjustment ───────────────────────────────────────────────────────────
// Ajuste masivo — acepta array de items con quantity_new (stock absoluto final).
// Por cada item calcula el delta vs stock actual y registra un movimiento.
// No hace rollback global — continúa si un item falla y reporta errores.
// Devuelve { adjusted, failed, failed_detail, total }

const BULK_ADJ_LIMIT = 500;

const bulkAdjustment = async ({ branchId, items, reason, userId }) => {
  if (!Array.isArray(items) || items.length === 0)
    throw new ValidationError('No se enviaron items para ajustar');
  if (items.length > BULK_ADJ_LIMIT)
    throw new ValidationError(`El lote no puede superar ${BULK_ADJ_LIMIT} items`);
  if (!reason?.trim())
    throw new ValidationError('El motivo del ajuste masivo es requerido');

  const adjusted = [];
  const failed   = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const row  = i + 2;

    try {
      // quantity_new es el stock absoluto que debe quedar
      if (item.quantity_new === undefined || item.quantity_new === null)
        throw new ValidationError('quantity_new es requerido');
      if (isNaN(Number(item.quantity_new)) || Number(item.quantity_new) < 0)
        throw new ValidationError('quantity_new debe ser un número mayor o igual a 0');

      const quantityNew = Number(item.quantity_new);

      // Resolver product_id / variant_id desde SKU si no viene el ID
      // Normalizamos '' -> null: un CSV entrega celdas vacías como string
      // vacío, no como null/undefined, y `??` no las detecta como "vacías".
      let product_id = item.product_id === '' ? null : item.product_id;
      let variant_id = item.variant_id === '' ? null : item.variant_id;

      if (!product_id && item.sku) {
        const [[found]] = await db.query(
          'SELECT product_id FROM products WHERE sku = ? AND is_active = 1',
          [item.sku.trim()]
        );
        if (!found) throw new NotFoundError(`SKU "${item.sku}" no encontrado`);
        product_id = found.product_id;
      }

      if (!product_id) throw new ValidationError('product_id o sku es requerido');

      // Verificar si el producto es variable. Si lo es, es OBLIGATORIO indicar
      // una variante específica: ajustar solo el SKU padre dejaría el
      // movimiento "flotando" en variant_id = NULL, una fila que el stock
      // real (agrupado por variante) nunca lee — el ajuste se perdería
      // en silencio, igual que el bug de variantes huérfanas que ya vimos.
      const [[productRow]] = await db.query(
        'SELECT is_variable FROM products WHERE product_id = ?',
        [product_id]
      );
      if (!productRow) throw new NotFoundError(`Producto ID ${product_id} no encontrado`);

      if (!variant_id && item.variant_sku) {
        const [[found]] = await db.query(
          `SELECT pv.variant_id FROM product_variants pv
           JOIN products p ON pv.product_id = p.product_id
           WHERE pv.sku = ? AND pv.is_active = 1`,
          [item.variant_sku.trim(), branchId]
        );
        if (!found) throw new NotFoundError(`SKU de variante "${item.variant_sku}" no encontrado`);
        variant_id = found.variant_id;
      }

      if (productRow.is_variable && !variant_id)
        throw new ValidationError('Este producto tiene variantes — indica variant_sku o variant_id, no el SKU del producto padre');

      if (!productRow.is_variable && variant_id)
        throw new ValidationError('Este producto no es variable — no debe llevar variant_id/variant_sku');

      // Obtener stock actual
      const [[current]] = await db.query(
        `SELECT quantity FROM inventory_stock
         WHERE branch_id = ? AND product_id = ? AND variant_id <=> ?`,
        [branchId, product_id, variant_id ?? null]
      );
      const currentQty = current?.quantity ?? 0;
      const delta      = quantityNew - currentQty;
      const opType = quantityNew > currentQty ? 'entry' : 'exit'

      // Si no hay diferencia, omitir sin error
      if (delta === 0) {
        adjusted.push({ row, product_id, variant_id, delta: 0, note: 'Sin cambio' });
        continue;
      }

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await stockService.applyStockMovement(conn, {
          branchId,
          productId:     product_id,
          variantId:     variant_id ?? null,
          delta,
          operationType: opType,
          referenceType: 'adjustment',
          reason:        reason.trim(),
          userId,
        });
        await conn.commit();
        adjusted.push({ row, product_id, variant_id, delta, quantity_new: quantityNew });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } catch (err) {
      failed.push({
        row,
        sku:          item.sku?.trim()         ?? null,
        variant_sku:  item.variant_sku?.trim()  ?? null,
        product_id:   item.product_id           ?? null,
        reason:       err.message,
      });
    }
  }

  return {
    adjusted:      adjusted.filter(a => a.delta !== 0).length,
    skipped:       adjusted.filter(a => a.delta === 0).length,
    failed:        failed.length,
    failed_detail: failed,
    total:         items.length,
  };
};

// ─── getBulkAdjustmentTemplate ────────────────────────────────────────────────
// Plantilla CSV para ajuste masivo.
// quantity_new = stock absoluto que debe quedar después del ajuste.

const getBulkAdjustmentTemplate = () => {
  const headers = ['sku', 'variant_sku', 'product_id', 'variant_id', 'quantity_new'];
  const example = ['PLY-001', '', '', '', '45'];
  const notes   = [
    '# Instrucciones:',
    '# - Usa "sku" o "product_id" para identificar el producto (no ambos)',
    '# - Para productos con variantes, es OBLIGATORIO indicar "variant_sku" o "variant_id" (no basta con el SKU del producto padre)',
    '# - "quantity_new" es el stock final que debe quedar (no el delta)',
    '# - Filas con el mismo stock actual serán omitidas sin error',
    '# - Se recomienda borrar las instrucciones que usan # de este archivo antes de subirlo al sistema.',
  ].join('\n');
  return `${notes}\n${headers.join(',')}\n${example.join(',')}`;
};

// ─── Traspasos ────────────────────────────────────────────────────────────────

const requestTransfer = async ({
  fromBranchId, toBranchId,
  productId, variantId = null,
  quantity, notes, requestedBy,
}) => {
  console.log('Quantity: ', quantity)
  if (fromBranchId === toBranchId)
    throw new ValidationError('El origen y destino no pueden ser la misma sucursal');
  if (!quantity || quantity <= 0)
    throw new ValidationError('La cantidad debe ser mayor a 0');

  await assertProductExists(productId);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[stockRow]] = await conn.query(
      `SELECT quantity FROM inventory_stock
       WHERE branch_id = ? AND product_id = ? AND variant_id <=> ?
       FOR UPDATE`,
      [fromBranchId, productId, variantId ?? null]
    );
    const available = stockRow?.quantity ?? 0;
    if (available < quantity)
      throw new ValidationError(
        `Stock insuficiente en sucursal origen. Disponible: ${available}, solicitado: ${quantity}`
      );

    const [result] = await conn.query(
      `INSERT INTO inventory_transfers
         (from_branch_id, to_branch_id, product_id, variant_id, quantity, notes, requested_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fromBranchId, toBranchId, productId, variantId ?? null, quantity, notes ?? null, requestedBy]
    );

    await conn.commit();
    return { transferId: result.insertId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── bulkRequestTransfer ──────────────────────────────────────────────────────
// Traspaso de varios productos a la vez, hacia UNA misma sucursal destino.
// Cada item crea su propio registro en inventory_transfers (reutilizando
// requestTransfer, que ya valida stock disponible e inserta en su propia
// transacción) — igual que bulkAdjustment, no hace rollback global: si un
// producto falla, los demás se siguen procesando y se reporta el detalle.
// Devuelve { created, failed, failed_detail, total }

const BULK_TRANSFER_LIMIT = 200;

const bulkRequestTransfer = async ({ fromBranchId, toBranchId, items, notes, requestedBy }) => {
  if (fromBranchId === toBranchId)
    throw new ValidationError('El origen y destino no pueden ser la misma sucursal');
  if (!Array.isArray(items) || items.length === 0)
    throw new ValidationError('No se enviaron productos para el traspaso');
  if (items.length > BULK_TRANSFER_LIMIT)
    throw new ValidationError(`El lote no puede superar ${BULK_TRANSFER_LIMIT} productos`);

  const created = [];
  const failed  = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const row  = i + 1;

    try {
      const productId = item.product_id;
      const variantId  = item.variant_id ?? null;
      const quantity   = Number(item.quantity);

      if (!productId) throw new ValidationError('product_id es requerido');
      if (!quantity || quantity <= 0) throw new ValidationError('La cantidad debe ser mayor a 0');

      const result = await requestTransfer({
        fromBranchId, toBranchId,
        productId, variantId,
        quantity, notes, requestedBy,
      });

      created.push({ row, product_id: productId, variant_id: variantId, quantity, transfer_id: result.transferId });
    } catch (err) {
      failed.push({
        row,
        product_id: item.product_id ?? null,
        variant_id: item.variant_id ?? null,
        reason:     err.message,
      });
    }
  }

  return {
    created:       created.length,
    failed:        failed.length,
    failed_detail: failed,
    total:         items.length,
    transfer_ids:  created.map(c => c.transfer_id),
  };
};

// ─── ensureProductInDestination ──────────────────────────────────────────────
// Con catálogo global el producto YA existe en destino (mismo product_id).
// Solo necesitamos asegurar que exista el registro en inventory_stock
// y resolver el variant_id correcto.

const ensureProductInDestination = async (conn, {
  productId, variantId, toBranchId,
}) => {
  if (!variantId) {
    // Producto simple — asegurar registro de stock en destino
    await conn.query(
      `INSERT IGNORE INTO inventory_stock (branch_id, product_id, variant_id, quantity)
       VALUES (?, ?, NULL, 0)`,
      [toBranchId, productId]
    );
    return { destProductId: productId, destVariantId: null };
  }

  // Producto variable — asegurar registro de stock para esa variante en destino
  const [[variant]] = await conn.query(
    'SELECT variant_id FROM product_variants WHERE variant_id = ? AND product_id = ? AND is_active = 1',
    [variantId, productId]
  );
  if (!variant) throw new NotFoundError('Variante no encontrada');

  await conn.query(
    `INSERT IGNORE INTO inventory_stock (branch_id, product_id, variant_id, quantity)
     VALUES (?, ?, ?, 0)`,
    [toBranchId, productId, variantId]
  );

  return { destProductId: productId, destVariantId: variantId };
};

const confirmTransfer = async ({ transferId, confirmedBy }) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[transfer]] = await conn.query(
      'SELECT * FROM inventory_transfers WHERE transfer_id = ? FOR UPDATE',
      [transferId]
    );
    if (!transfer) throw new NotFoundError('Traspaso no encontrado');
    if (transfer.status !== 'pending')
      throw new ValidationError(`El traspaso ya está en estado "${transfer.status}"`);

    // Descontar en origen
    await stockService.applyStockMovement(conn, {
      branchId:      transfer.from_branch_id,
      productId:     transfer.product_id,
      variantId:     transfer.variant_id,
      delta:         -transfer.quantity,
      operationType: 'transfer_out',
      referenceId:   transferId,
      referenceType: 'transfer',
      userId:        confirmedBy,
    });

    // Asegurar que el producto y variante existen en destino
    // Si no existen los crea copiando datos del origen
    const { destProductId, destVariantId } = await ensureProductInDestination(conn, {
      productId:  transfer.product_id,
      variantId:  transfer.variant_id,
      toBranchId: transfer.to_branch_id,
    });

    // Agregar en destino usando los IDs correctos de la sucursal destino
    await stockService.applyStockMovement(conn, {
      branchId:      transfer.to_branch_id,
      productId:     destProductId,
      variantId:     destVariantId,
      delta:         transfer.quantity,
      operationType: 'transfer_in',
      referenceId:   transferId,
      referenceType: 'transfer',
      userId:        confirmedBy,
    });

    await conn.query(
      `UPDATE inventory_transfers
       SET status = 'completed', confirmed_by = ?, confirmed_at = NOW()
       WHERE transfer_id = ?`,
      [confirmedBy, transferId]
    );

    await conn.commit();
    return { transferId, status: 'confirmed' };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

const cancelTransfer = async ({ transferId }) => {
  const [[transfer]] = await db.query(
    'SELECT * FROM inventory_transfers WHERE transfer_id = ?',
    [transferId]
  );
  if (!transfer) throw new NotFoundError('Traspaso no encontrado');
  if (transfer.status !== 'pending')
    throw new ValidationError(`No se puede cancelar un traspaso en estado "${transfer.status}"`);

  await db.query(
    "UPDATE inventory_transfers SET status = 'cancelled' WHERE transfer_id = ?",
    [transferId]
  );
  return { transferId, status: 'cancelled' };
};

const getTransfers = async ({ branchId, filters = {} }) => {
  const { status, page = 1, limit = 20 } = filters;

  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safePage  = Math.max(parseInt(page) || 1, 1);
  const offset    = (safePage - 1) * safeLimit;

  const conditions = ['(t.from_branch_id = ? OR t.to_branch_id = ?)'];
  const params     = [branchId, branchId];

  if (status) { conditions.push('t.status = ?'); params.push(status); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM inventory_transfers t ${where}`,
    params
  );

  const [rows] = await db.query(
    `SELECT
       t.transfer_id, t.quantity, t.status, t.notes, t.created_at, t.confirmed_at,
       p.name  AS product_name,  p.sku  AS product_sku,
       pv.label AS variant_label,
       bf.name AS from_branch_name,
       bt.name AS to_branch_name,
       CONCAT(ur.first_name,' ',ur.last_name) AS requested_by_name,
       CONCAT(uc.first_name,' ',uc.last_name) AS confirmed_by_name
     FROM inventory_transfers t
     JOIN  products p            ON t.product_id     = p.product_id
     LEFT JOIN product_variants pv ON t.variant_id   = pv.variant_id
     JOIN  branches bf           ON t.from_branch_id = bf.branch_id
     JOIN  branches bt           ON t.to_branch_id   = bt.branch_id
     JOIN  users ur              ON t.requested_by   = ur.user_id
     LEFT JOIN users uc          ON t.confirmed_by   = uc.user_id
     ${where}
     ORDER BY t.transfer_id DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  return {
    data: rows,
    pagination: { total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) },
  };
};

// ─── Devoluciones ─────────────────────────────────────────────────────────────

const createReturn = async ({
  orderId, branchId, customerId, userId,
  reason, refundMethod, items,
}) => {
  const [[order]] = await db.query(
    'SELECT * FROM orders WHERE order_id = ? AND branch_id = ?',
    [orderId, branchId]
  );
  if (!order) throw new NotFoundError('Orden no encontrada en esta sucursal');
  if (order.status === 'cancelled')
    throw new ValidationError('No se puede hacer devolución de una orden cancelada');

  const amountRefunded = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [retResult] = await conn.query(
      `INSERT INTO returns
         (order_id, branch_id, customer_id, user_id,
          reason, amount_refunded, refund_method, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')`,
      [orderId, branchId, customerId, userId, reason ?? null, amountRefunded, refundMethod ?? 'cash']
    );
    const returnId = retResult.insertId;

    for (const item of items) {
      await conn.query(
        `INSERT INTO return_details
           (return_id, product_id, variant_id, quantity, unit_price)
         VALUES (?, ?, ?, ?, ?)`,
        [returnId, item.product_id, item.variant_id ?? null, item.quantity, item.unit_price]
      );
      await stockService.applyStockMovement(conn, {
        branchId,
        productId:     item.product_id,
        variantId:     item.variant_id ?? null,
        delta:         Math.abs(item.quantity),
        operationType: 'return',
        referenceId:   returnId,
        referenceType: 'return',
        userId,
      });
    }

    await conn.commit();
    return { returnId, amountRefunded };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── Migración de stock al cambiar simple <-> variable ────────────────────────
// IMPORTANTE: estas funciones reciben `conn` porque deben ejecutarse DENTRO
// de la misma transacción que actualiza products/product_variants (en
// productService.updateProduct). Si se corren fuera de esa transacción,
// una falla a medias podría dejar el producto convertido pero el stock
// sin migrar (o viceversa).

// Simple -> variable: mueve el stock de la fila plana (variant_id NULL)
// hacia la variante indicada, por cada sucursal donde haya stock.
// Debe llamarse ANTES de marcar is_variable = 1 en products.
const migrateStockToVariant = async (conn, { productId, toVariantId, userId }) => {
  if (!toVariantId)
    throw new ValidationError('Se requiere una variante destino para migrar el stock');

  const [stockRows] = await conn.query(
    `SELECT branch_id, quantity FROM inventory_stock
     WHERE product_id = ? AND variant_id IS NULL AND quantity != 0
     FOR UPDATE`,
    [productId]
  );

  for (const row of stockRows) {
    // Vaciar la fila vieja (variant_id NULL)
    await stockService.applyStockMovement(conn, {
      branchId: row.branch_id, productId, variantId: null,
      delta: -row.quantity,
      operationType: 'adjustment',
      reason: 'Conversión a producto variable — migración de stock',
      referenceType: 'product_conversion',
      userId,
    });
    // Acreditar ese mismo stock a la variante destino
    await stockService.applyStockMovement(conn, {
      branchId: row.branch_id, productId, variantId: toVariantId,
      delta: row.quantity,
      operationType: 'adjustment',
      reason: 'Conversión a producto variable — migración de stock',
      referenceType: 'product_conversion',
      userId,
    });
  }

  return { migratedBranches: stockRows.length };
};

// Variable -> simple: suma el stock de todas las variantes (activas o no)
// hacia la fila plana (variant_id NULL), por cada sucursal.
// Debe llamarse ANTES de marcar is_variable = 0 en products.
const migrateStockToSimple = async (conn, { productId, userId }) => {
  const [stockRows] = await conn.query(
    `SELECT branch_id, variant_id, quantity FROM inventory_stock
     WHERE product_id = ? AND variant_id IS NOT NULL AND quantity != 0
     FOR UPDATE`,
    [productId]
  );

  const totalsByBranch = new Map();
  for (const row of stockRows) {
    totalsByBranch.set(row.branch_id, (totalsByBranch.get(row.branch_id) ?? 0) + row.quantity);
  }

  // Vaciar cada variante
  for (const row of stockRows) {
    await stockService.applyStockMovement(conn, {
      branchId: row.branch_id, productId, variantId: row.variant_id,
      delta: -row.quantity,
      operationType: 'adjustment',
      reason: 'Conversión a producto simple — consolidación de stock',
      referenceType: 'product_conversion',
      userId,
    });
  }

  // Acreditar el total consolidado a la fila plana, por sucursal
  for (const [branchId, total] of totalsByBranch.entries()) {
    await stockService.applyStockMovement(conn, {
      branchId, productId, variantId: null,
      delta: total,
      operationType: 'adjustment',
      reason: 'Conversión a producto simple — consolidación de stock',
      referenceType: 'product_conversion',
      userId,
    });
  }

  return { migratedBranches: totalsByBranch.size };
};

module.exports = {
  getStockByBranch,
  getMovements,
  createAdjustment,
  bulkAdjustment,
  getBulkAdjustmentTemplate,
  requestTransfer,
  bulkRequestTransfer,
  confirmTransfer,
  cancelTransfer,
  getTransfers,
  createReturn,
  migrateStockToVariant,
  migrateStockToSimple,
  ADJUSTMENT_REASONS,
};