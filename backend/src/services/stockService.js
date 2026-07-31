// src/services/stockService.js
// Fuente de verdad única para TODAS las operaciones de stock.
// Todas las funciones reciben una conexión de BD activa (conn)
// para poder participar en transacciones externas.
//
// Regla: nunca llames a estas funciones fuera de una transacción.

const { InsufficientStockError, NotFoundError } = require('../errors/AppError');

// ─── Leer stock actual ────────────────────────────────────────────────────────

const getStock = async (conn, { branchId, productId, variantId = null }) => {
  const [rows] = await conn.query(
    `SELECT quantity FROM inventory_stock
     WHERE branch_id = ? AND product_id = ? AND variant_id <=> ?`,
    [branchId, productId, variantId]
  );
  return rows[0]?.quantity ?? 0;
};

// ─── Movimiento atómico ───────────────────────────────────────────────────────
// delta positivo = entrada, negativo = salida.
// Crea o actualiza inventory_stock e inserta en inventory_movements.

const applyStockMovement = async (conn, {
  branchId,
  productId,
  variantId = null,
  delta,           // número, puede ser negativo
  operationType,   // 'sale','return','purchase','adjustment','transfer_in','transfer_out'
  reason = null,
  referenceId = null,
  referenceType = null,
  userId,
}) => {
  // 1. Obtener stock actual (con bloqueo de fila para evitar condición de carrera)
  const [stockRows] = await conn.query(
    `SELECT stock_id, quantity FROM inventory_stock
     WHERE branch_id = ? AND product_id = ? AND variant_id <=> ?
     FOR UPDATE`,
    [branchId, productId, variantId]
  );

  const quantityBefore = stockRows[0]?.quantity ?? 0;
  const quantityAfter  = quantityBefore + delta;

  // 2. Validar que no quede negativo en salidas
  if (quantityAfter < 0) {
    // Obtener nombre del producto para el mensaje de error
    const [prod] = await conn.query(
      `SELECT name FROM products WHERE product_id = ?`, [productId]
    );
    throw new InsufficientStockError(prod[0]?.name ?? `ID ${productId}`);
  }

  // 3. Upsert en inventory_stock
  if (stockRows.length > 0) {
    await conn.query(
      `UPDATE inventory_stock SET quantity = ? WHERE stock_id = ?`,
      [quantityAfter, stockRows[0].stock_id]
    );
  } else {
    await conn.query(
      `INSERT INTO inventory_stock (branch_id, product_id, variant_id, quantity)
       VALUES (?, ?, ?, ?)`,
      [branchId, productId, variantId, quantityAfter]
    );
  }

  // 4. Insertar en bitácora (inmutable, nunca se borra)
  await conn.query(
    `INSERT INTO inventory_movements
       (branch_id, product_id, variant_id, operation_type, quantity,
        quantity_before, quantity_after, reason, reference_id, reference_type, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      branchId, productId, variantId, operationType, delta,
      quantityBefore, quantityAfter, reason,
      referenceId, referenceType, userId,
    ]
  );

  return { quantityBefore, quantityAfter };
};

// ─── Reducir stock por venta (lista de items) ─────────────────────────────────

const deductSaleStock = async (conn, { branchId, items, orderId, userId }) => {
  for (const item of items) {
    await applyStockMovement(conn, {
      branchId,
      productId:     item.product_id,
      variantId:     item.variant_id ?? null,
      delta:         -Math.abs(item.quantity),
      operationType: 'sale',
      referenceId:   orderId,
      referenceType: 'order',
      userId,
    });
  }
};

// ─── Restaurar stock por cancelación / devolución ────────────────────────────

const restoreSaleStock = async (conn, { branchId, items, referenceId, referenceType = 'return', userId }) => {
  for (const item of items) {
    await applyStockMovement(conn, {
      branchId,
      productId:     item.product_id,
      variantId:     item.variant_id ?? null,
      delta:         Math.abs(item.quantity),
      operationType: referenceType === 'order' ? 'sale_cancelled' : 'return',
      referenceId,
      referenceType,
      userId,
    });
  }
};

// ─── Ajuste manual de inventario ─────────────────────────────────────────────

const manualAdjustment = async (conn, {
  branchId, productId, variantId = null,
  operationType, // 'entry' | 'exit'
  quantity,
  reason,
  userId,
}) => {
  const delta = operationType === 'entry' ? Math.abs(quantity) : -Math.abs(quantity);
  let opType;
  if(operationType ==='entry'){
    if(reason==='Compra a proveedor') opType='purchase'
    else opType = 'entry'
  }else{
    if(reason === 'Devolución de cliente') opType ='return'
    else opType ='exit'
  }
  return applyStockMovement(conn, {
    branchId, productId, variantId,
    delta,
    operationType: opType,
    reason,
    referenceType: 'adjustment',
    userId,
  });
};

module.exports = { getStock, applyStockMovement, deductSaleStock, restoreSaleStock, manualAdjustment };
