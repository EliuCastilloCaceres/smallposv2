// src/services/orderService.js
// Toda la lógica de negocio de ventas vive aquí.
// FIX: createOrder ahora inserta la cabecera de la orden ANTES de descontar stock,
//      pasando el orderId real a deductSaleStock. Se elimina el UPDATE posterior
//      que vinculaba movimientos por user_id (frágil ante concurrencia).

const db           = require('../config/db');
const stockService = require('./stockService');
const creditService = require('./creditService');
const { NotFoundError, ValidationError } = require('../errors/AppError');

// ─── Validar pagos ───────────────────────────────────────────────────────────

const validatePayments = async (conn, payments) => {
  if (!Array.isArray(payments) || payments.length === 0)
    throw new ValidationError('Debes indicar al menos un método de pago');

  for (const p of payments) {
    if (!p.payment_method_id) throw new ValidationError('Cada pago requiere payment_method_id');
    if (!(Number(p.amount) > 0)) throw new ValidationError('Cada pago requiere un amount mayor a 0');
  }

  const ids = [...new Set(payments.map(p => Number(p.payment_method_id)))];
  const [found] = await conn.query(
    'SELECT payment_method_id, code, is_active FROM payment_methods WHERE payment_method_id IN (?)',
    [ids]
  );
  if (found.length !== ids.length)
    throw new ValidationError('Uno o más payment_method_id no existen');
  if (found.some(f => !f.is_active))
    throw new ValidationError('Uno o más métodos de pago están inactivos');

  return found;
};

// ─── Crear venta ──────────────────────────────────────────────────────────────

const createOrder = async ({
  branchId,
  cashRegisterId,
  customerId,
  userId,
  subtotal,
  discount,
  total,
  payments,
  notes,
  items,
  dueDate = null,
}) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 0. Validar métodos de pago y que la suma cuadre con el total
    const methods     = await validatePayments(conn, payments);
    const methodsById = new Map(methods.map(m => [m.payment_method_id, m]));

    const paymentsSum = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    if (Math.abs(paymentsSum - Number(total)) > 0.01) {
      throw new ValidationError(
        `La suma de los pagos ($${paymentsSum.toFixed(2)}) no coincide con el total de la orden ($${Number(total).toFixed(2)})`
      );
    }

    // 1. Validar que la caja esté abierta
    const [register] = await conn.query(
      `SELECT cash_register_id, is_open FROM cash_registers
       WHERE cash_register_id = ? AND branch_id = ?`,
      [cashRegisterId, branchId]
    );
    if (register.length === 0) throw new NotFoundError('Caja no encontrada');
    if (!register[0].is_open) throw new ValidationError('La caja no está abierta');

    // 2. Obtener sesión activa de caja
    const [session] = await conn.query(
      `SELECT session_id FROM cash_register_sessions
       WHERE cash_register_id = ? AND closed_at IS NULL
       ORDER BY session_id DESC LIMIT 1`,
      [cashRegisterId]
    );
    if (session.length === 0) throw new ValidationError('No hay sesión de caja activa');
    const sessionId = session[0].session_id;

    // 3. Insertar orden (cabecera) — ya sin payment_method/cash_received/cash_change
    const [orderResult] = await conn.query(
      `INSERT INTO orders
         (branch_id, cash_register_id, customer_id, user_id,
          subtotal, discount, total, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
      [branchId, cashRegisterId, customerId, userId,
       subtotal, discount, total, notes ?? null]
    );
    const orderId = orderResult.insertId;

    // 4. Insertar detalles de la orden (snapshot de precios)
    for (const item of items) {
      await conn.query(
        `INSERT INTO order_details
           (order_id, product_id, variant_id, quantity,
            unit_price, purchase_price, discount, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.product_id,
          item.variant_id ?? null,
          item.quantity,
          item.unit_price,
          item.purchase_price,
          item.discount ?? 0,
          item.unit_price * item.quantity,
        ]
      );
    }

    // 5. Descontar stock (lanza InsufficientStockError si no hay)
    //    Ahora pasamos el orderId real, así los movimientos quedan vinculados
    //    desde el primer INSERT en inventory_movements.
    await stockService.deductSaleStock(conn, {
      branchId,
      items,
      orderId, // ← FIX: orderId ya conocido
      userId,
    });

    // 6. Insertar el desglose de pagos
    for (const p of payments) {
      await conn.query(
        `INSERT INTO order_payments
           (order_id, payment_method_id, amount, cash_received, cash_change, reference)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, p.payment_method_id, p.amount, p.cash_received ?? null, p.cash_change ?? null, p.reference ?? null]
      );
    }

    // 7. Si alguna porción del pago fue a crédito, registrar el crédito
    const creditAmount = payments.reduce((sum, p) => {
      const method = methodsById.get(Number(p.payment_method_id));
      return method?.code === 'credit' ? sum + Number(p.amount) : sum;
    }, 0);

    if (creditAmount > 0) {
      await creditService.createCreditSale(conn, {
        orderId, customerId,
        totalAmount: creditAmount,
        dueDate,
      });
    }

    // 8. Registrar movimiento de caja por cada porción pagada en efectivo
    for (const p of payments) {
      const method = methodsById.get(Number(p.payment_method_id));
      if (method?.code === 'cash') {
        await conn.query(
          `INSERT INTO cash_movements
             (session_id, movement_type, amount, description, user_id)
           VALUES (?, 'sale', ?, ?, ?)`,
          [sessionId, p.amount, `Venta #${orderId}`, userId]
        );
      }
    }

    await conn.commit();
    return { orderId };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── Cancelar venta ───────────────────────────────────────────────────────────

const cancelOrder = async ({ orderId, userId }) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [orders] = await conn.query(
      `SELECT * FROM orders WHERE order_id = ?`, [orderId]
    );
    if (orders.length === 0) throw new NotFoundError('Orden no encontrada');
    const order = orders[0];
    if (order.status === 'cancelled') throw new ValidationError('La orden ya está cancelada');

    const [details] = await conn.query(
      `SELECT product_id, variant_id, quantity FROM order_details WHERE order_id = ?`,
      [orderId]
    );

    await stockService.restoreSaleStock(conn, {
      branchId:      order.branch_id,
      items:         details,
      referenceId:   orderId,
      referenceType: 'order',
      userId,
    });

    await conn.query(
      `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE order_id = ?`,
      [orderId]
    );

    await conn.commit();
    return { orderId, status: 'cancelled' };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── Queries de lectura ───────────────────────────────────────────────────────

const getOrderById = async (orderId) => {
  const [orders] = await db.query(
    `SELECT o.*,
            c.first_name as customer_firstname, c.last_name as customer_lastname,
            u.first_name as user_firstname,     u.last_name as user_lastname,
            b.name as branch_name,              cr.name as cash_register_name
     FROM orders o
     JOIN customers c      ON o.customer_id      = c.customer_id
     JOIN users u          ON o.user_id           = u.user_id
     JOIN branches b       ON o.branch_id         = b.branch_id
     JOIN cash_registers cr ON o.cash_register_id = cr.cash_register_id
     WHERE o.order_id = ?`,
    [orderId]
  );
  if (orders.length === 0) throw new NotFoundError('Orden no encontrada');

  const [details] = await db.query(
    `SELECT od.*, p.name as product_name, p.sku,
            pv.label as variant_label, pv.sku as variant_sku
     FROM order_details od
     JOIN products p ON od.product_id = p.product_id
     LEFT JOIN product_variants pv ON od.variant_id = pv.variant_id
     WHERE od.order_id = ?`,
    [orderId]
  );

  const [payments] = await db.query(
    `SELECT op.order_payment_id, op.amount, op.cash_received, op.cash_change, op.reference,
            pm.payment_method_id, pm.code, pm.name as method_name
     FROM order_payments op
     JOIN payment_methods pm ON op.payment_method_id = pm.payment_method_id
     WHERE op.order_id = ?`,
    [orderId]
  );

  return { order: orders[0], details, payments };
};

const getOrdersByBranchAndDateRange = async ({ branchId, startDate, endDate, status = null }) => {
  let where = 'WHERE o.branch_id = ? AND o.created_at BETWEEN ? AND ?';
  const params = [branchId, startDate, `${endDate} 23:59:59`];

  if (status) {
    where += ' AND o.status = ?';
    params.push(status);
  }

  const [rows] = await db.query(
    `SELECT o.order_id, o.subtotal, o.discount, o.total,
            o.status, o.created_at,
            c.first_name as customer_firstname, c.last_name as customer_lastname,
            u.first_name as user_firstname,     u.last_name as user_lastname,
            cr.name as cash_register_name
     FROM orders o
     JOIN customers c       ON o.customer_id      = c.customer_id
     JOIN users u           ON o.user_id           = u.user_id
     JOIN cash_registers cr ON o.cash_register_id  = cr.cash_register_id
     ${where}
     ORDER BY o.created_at DESC`,
    params
  );
  return rows;
};

module.exports = { createOrder, cancelOrder, getOrderById, getOrdersByBranchAndDateRange };