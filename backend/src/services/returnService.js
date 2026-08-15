// src/services/returnService.js
// Módulo de devoluciones.
// - Una devolución siempre está ligada a una orden (returns.order_id).
// - Las cantidades se validan contra lo vendido en esa línea MENOS lo que
//   ya se hubiera devuelto antes (una orden puede tener varias devoluciones
//   parciales) — nunca contra el total de la orden a secas.
// - El stock se restaura con stockService.restoreSaleStock, el mismo
//   helper que ya usa orderService.cancelOrder — con referenceType
//   'return' inserta el movimiento como 'return' en vez de 'sale_cancelled'.
// - El reembolso en efectivo recibe el mismo tratamiento que los abonos de
//   crédito/apartado: exige una caja abierta y propia del usuario, y
//   registra un cash_movement (tipo 'return', mismo tipo que ya usa
//   orderService.cancelOrder para el efectivo que se devuelve al cancelar
//   una venta).

const db           = require('../config/db');
const stockService = require('./stockService');
const { NotFoundError, ValidationError, ForbiddenError } = require('../errors/AppError');

const keyOf = (productId, variantId) => `${productId}-${variantId ?? 0}`;

// ─── Consultas ────────────────────────────────────────────────────────────────

const getReturnsByBranch = async ({
  branchId, status, search, startDate, endDate, page = 1, limit = 20,
}) => {
  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safePage  = Math.max(parseInt(page) || 1, 1);
  const offset    = (safePage - 1) * safeLimit;

  const conditions = [];
  const params = [];

  // branchId es null en vista consolidada (sin filtro) — a diferencia de
  // getReturnById, aquí no hace falta distinguir null de undefined porque
  // el controller siempre resuelve con resolveUnrestrictedBranchId.
  if (branchId) {
    conditions.push('r.branch_id = ?');
    params.push(branchId);
  }

  if (startDate && endDate) {
    conditions.push('r.created_at BETWEEN ? AND ?');
    params.push(startDate, `${endDate} 23:59:59`);
  }
  if (status) {
    conditions.push('r.status = ?');
    params.push(status);
  }
  if (search) {
    const asId = parseInt(search);
    const like = `%${search}%`;
    conditions.push('(r.return_id = ? OR r.order_id = ? OR c.first_name LIKE ? OR c.last_name LIKE ?)');
    params.push(isNaN(asId) ? 0 : asId, isNaN(asId) ? 0 : asId, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total
     FROM returns r
     JOIN customers c ON r.customer_id = c.customer_id
     ${where}`,
    params
  );

  const [rows] = await db.query(
    `SELECT r.return_id, r.order_id, r.branch_id, r.amount_refunded, r.refund_method,
            r.status, r.reason, r.created_at,
            b.name as branch_name,
            c.first_name, c.last_name,
            u.first_name as user_firstname, u.last_name as user_lastname
     FROM returns r
     JOIN customers c ON r.customer_id = c.customer_id
     JOIN users u     ON r.user_id     = u.user_id
     JOIN branches b  ON r.branch_id   = b.branch_id
     ${where}
     ORDER BY r.created_at DESC
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

const getReturnById = async (returnId, branchId) => {
  const [rows] = await db.query(
    `SELECT r.*,
            c.first_name, c.last_name, c.phone_number,
            u.first_name as user_firstname, u.last_name as user_lastname,
            pm.name as payment_method_name
     FROM returns r
     JOIN customers c ON r.customer_id = c.customer_id
     JOIN users u     ON r.user_id     = u.user_id
     LEFT JOIN payment_methods pm ON r.payment_method_id = pm.payment_method_id
     WHERE r.return_id = ?`,
    [returnId]
  );
  if (rows.length === 0) throw new NotFoundError('Devolución no encontrada');
  // branchId llega null en vista consolidada (sin filtro) — al igual que
  // undefined, significa "sin restricción de sucursal" acá.
  if (branchId !== undefined && branchId !== null && rows[0].branch_id !== branchId) {
    throw new ForbiddenError('Esta devolución pertenece a otra sucursal');
  }

  const [details] = await db.query(
    `SELECT rd.*, p.name as product_name, p.sku,
            pv.label as variant_label
     FROM return_details rd
     JOIN products p ON rd.product_id = p.product_id
     LEFT JOIN product_variants pv ON rd.variant_id = pv.variant_id
     WHERE rd.return_id = ?`,
    [returnId]
  );

  return { return: rows[0], details };
};

// Artículos de una orden disponibles para devolver — usado por el modal de
// creación al buscar el folio de venta. Resta lo que ya se haya devuelto en
// devoluciones previas (completadas) de esa misma orden.
const getReturnableItems = async (orderId, branchId) => {
  const [orders] = await db.query(`SELECT * FROM orders WHERE order_id = ?`, [orderId]);
  if (orders.length === 0) throw new NotFoundError('Orden no encontrada');
  const order = orders[0];
  if (branchId !== null && branchId !== undefined && order.branch_id !== branchId) {
      throw new ForbiddenError('Esta orden pertenece a otra sucursal');
    }
  if (order.status === 'cancelled') {
    throw new ValidationError('No se puede devolver una venta cancelada');
  }

  const [details] = await db.query(
    `SELECT od.order_detail_id, od.product_id, od.variant_id, od.quantity, od.unit_price,
            p.name as product_name, p.sku, pv.label as variant_label
     FROM order_details od
     JOIN products p ON od.product_id = p.product_id
     LEFT JOIN product_variants pv ON od.variant_id = pv.variant_id
     WHERE od.order_id = ?`,
    [orderId]
  );

  const [returned] = await db.query(
    `SELECT rd.product_id, rd.variant_id, SUM(rd.quantity) as returned_qty
     FROM return_details rd
     JOIN returns r ON rd.return_id = r.return_id
     WHERE r.order_id = ? AND r.status = 'completed'
     GROUP BY rd.product_id, rd.variant_id`,
    [orderId]
  );
  const returnedMap = new Map(returned.map(r => [keyOf(r.product_id, r.variant_id), Number(r.returned_qty)]));

  const items = details.map(d => {
    const alreadyReturned = returnedMap.get(keyOf(d.product_id, d.variant_id)) ?? 0;
    return {
      ...d,
      already_returned:    alreadyReturned,
      returnable_quantity: +(Number(d.quantity) - alreadyReturned).toFixed(3),
    };
  });

  return { order, items };
};

// ─── Crear devolución ─────────────────────────────────────────────────────────

const createReturn = async ({
  orderId, branchId, userId,
  items, // [{ product_id, variant_id, quantity }]
  reason = null,
  refundAmount = 0,
  paymentMethodId = null,
  cashRegisterId = null,
}) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError('Selecciona al menos un producto a devolver');
  }
  for (const it of items) {
    if (!it.product_id) throw new ValidationError('Cada artículo requiere product_id');
    if (!(Number(it.quantity) > 0)) throw new ValidationError('Cada artículo requiere una cantidad mayor a 0');
  }
  if (Number(refundAmount) < 0) throw new ValidationError('El monto a reembolsar no puede ser negativo');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [orders] = await conn.query(`SELECT * FROM orders WHERE order_id = ? FOR UPDATE`, [orderId]);
    if (orders.length === 0) throw new NotFoundError('Orden no encontrada');
    const order = orders[0];
    if (branchId !== null && branchId !== undefined && order.branch_id !== branchId) {
      throw new ForbiddenError('Esta orden pertenece a otra sucursal');
    }
    if (order.status === 'cancelled') {
      throw new ValidationError('No se puede devolver una venta cancelada');
    }

    const [details] = await conn.query(
      `SELECT product_id, variant_id, quantity, unit_price FROM order_details WHERE order_id = ?`,
      [orderId]
    );
    const detailsByKey = new Map(details.map(d => [keyOf(d.product_id, d.variant_id), d]));

    const [returnedRows] = await conn.query(
      `SELECT rd.product_id, rd.variant_id, SUM(rd.quantity) as returned_qty
       FROM return_details rd
       JOIN returns r ON rd.return_id = r.return_id
       WHERE r.order_id = ? AND r.status = 'completed'
       GROUP BY rd.product_id, rd.variant_id`,
      [orderId]
    );
    const returnedMap = new Map(returnedRows.map(r => [keyOf(r.product_id, r.variant_id), Number(r.returned_qty)]));

    // Validar cada línea contra lo vendido menos lo ya devuelto, y armar el
    // arreglo que necesita stockService (product_id/variant_id/quantity).
    const stockItems = [];
    for (const it of items) {
      const key    = keyOf(it.product_id, it.variant_id ?? null);
      const detail = detailsByKey.get(key);
      if (!detail) throw new ValidationError('Uno de los productos no pertenece a esta orden');

      const alreadyReturned = returnedMap.get(key) ?? 0;
      const returnable      = Number(detail.quantity) - alreadyReturned;
      if (Number(it.quantity) > returnable + 1e-9) {
        throw new ValidationError(
          `La cantidad a devolver de "${key}" excede lo disponible (disponible: ${returnable})`
        );
      }

      stockItems.push({
        product_id: it.product_id,
        variant_id: it.variant_id ?? null,
        quantity:   Number(it.quantity),
        unit_price: detail.unit_price,
      });
      // Acumular por si la misma línea viniera repetida en el payload
      returnedMap.set(key, alreadyReturned + Number(it.quantity));
    }

    // Resolver el método de pago del reembolso ANTES de insertar la
    // cabecera, para no tener que hacer un UPDATE después.
    let paymentMethod = null;
    if (Number(refundAmount) > 0) {
      if (!paymentMethodId) throw new ValidationError('Selecciona el método del reembolso');
      const [methods] = await conn.query(
        `SELECT payment_method_id, code, is_active FROM payment_methods WHERE payment_method_id = ?`,
        [paymentMethodId]
      );
      if (methods.length === 0) throw new ValidationError('El método de pago del reembolso no existe');
      if (!methods[0].is_active) throw new ValidationError('El método de pago del reembolso está inactivo');
      paymentMethod = methods[0];
    }

    // Cabecera de la devolución
    const [result] = await conn.query(
      `INSERT INTO returns
         (order_id, branch_id, customer_id, user_id, reason,
          amount_refunded, refund_method, payment_method_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
      [
        orderId, branchId, order.customer_id, userId, reason ?? null,
        refundAmount, paymentMethod?.code ?? null, paymentMethod?.payment_method_id ?? null,
      ]
    );
    const returnId = result.insertId;

    // Detalle de artículos devueltos
    for (const it of stockItems) {
      await conn.query(
        `INSERT INTO return_details (return_id, product_id, variant_id, quantity, unit_price)
         VALUES (?, ?, ?, ?, ?)`,
        [returnId, it.product_id, it.variant_id, it.quantity, it.unit_price]
      );
    }

    // Restaurar stock — mismo helper que usa cancelOrder; con
    // referenceType 'return' el movimiento queda como 'return' (no
    // 'sale_cancelled', que es exclusivo de cancelar la orden completa).
    await stockService.restoreSaleStock(conn, {
      branchId, items: stockItems,
      referenceId: returnId, referenceType: 'return',
      userId,
    });

    // Reembolso en efectivo — mismo tratamiento que los abonos de
    // crédito/apartado: la caja debe estar abierta y ser del usuario que
    // registra la devolución. Aquí no hay "efectivo recibido/cambio" (el
    // dinero sale de la caja, no entra), solo el monto que se descuenta.
    if (Number(refundAmount) > 0 && paymentMethod?.code === 'cash') {
      if (!cashRegisterId) {
        throw new ValidationError('Selecciona la caja de la que saldrá el efectivo del reembolso');
      }

      const [registers] = await conn.query(
        `SELECT cash_register_id, is_open FROM cash_registers WHERE cash_register_id = ?`,
        [cashRegisterId]
      );
      if (registers.length === 0) throw new NotFoundError('Caja no encontrada');
      if (!registers[0].is_open) {
        throw new ValidationError('Esa caja no está abierta. Ábrela desde el POS antes de registrar el reembolso en efectivo.');
      }

      const [sessions] = await conn.query(
        `SELECT session_id, user_id FROM cash_register_sessions
         WHERE cash_register_id = ? AND closed_at IS NULL
         ORDER BY session_id DESC LIMIT 1`,
        [cashRegisterId]
      );
      if (sessions.length === 0) {
        throw new ValidationError('Esa caja no tiene una sesión activa. Ábrela desde el POS antes de registrar el reembolso en efectivo.');
      }
      if (sessions[0].user_id !== userId) {
        throw new ForbiddenError('Solo puedes registrar el efectivo del reembolso en una caja que tú mismo tengas abierta.');
      }

      await conn.query(
        `INSERT INTO cash_movements (session_id, movement_type, amount, description, user_id)
         VALUES (?, 'return', ?, ?, ?)`,
        [sessions[0].session_id, refundAmount, `Devolución #${returnId} (venta #${orderId})`, userId]
      );
    }

    // Si con esta devolución se devolvió TODO lo vendido en la orden (sumando
    // devoluciones previas + esta), marcar la orden como 'refunded'. Si fue
    // parcial, la orden se queda 'completed' — sigue siendo una venta válida.
    const allReturned = details.every(d => {
      const key = keyOf(d.product_id, d.variant_id);
      return (returnedMap.get(key) ?? 0) >= Number(d.quantity) - 1e-9;
    });
    if (allReturned) {
      await conn.query(
        `UPDATE orders SET status = 'refunded', updated_at = NOW() WHERE order_id = ?`,
        [orderId]
      );
    }

    await conn.commit();
    return { returnId, amountRefunded: Number(refundAmount), orderFullyRefunded: allReturned };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = {
  getReturnsByBranch, getReturnById, getReturnableItems, createReturn,
};