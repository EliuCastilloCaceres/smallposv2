// src/services/layawayService.js
// Módulo de apartados.
// - El apartado se crea en una sucursal (donde están los productos).
// - Los abonos pueden registrarse en cualquier sucursal.
// - El stock se reserva al crear el apartado y se descuenta definitivamente
//   al completarlo (convertirlo en venta).

const db           = require('../config/db');
const stockService = require('./stockService');
const { NotFoundError, ValidationError, ConflictError, ForbiddenError } = require('../errors/AppError');

// ─── Validar un arreglo de pagos (payment_method_id + amount) ────────────────
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

// ─── Consultas ────────────────────────────────────────────────────────────────

const getLayawaysByCustomer = async (customerId) => {
  const [rows] = await db.query(
    `SELECT l.*,
            c.first_name, c.last_name, c.phone_number,
            b.name as branch_name,
            u.first_name as created_by_name
     FROM layaways l
     JOIN customers c ON l.customer_id = c.customer_id
     JOIN branches  b ON l.branch_id   = b.branch_id
     JOIN users     u ON l.user_id     = u.user_id
     WHERE l.customer_id = ?
     ORDER BY l.layaway_id DESC`,
    [customerId]
  );
  return rows;
};

const getLayawayById = async (layawayId) => {
  const [rows] = await db.query(
    `SELECT l.*,
            c.first_name, c.last_name, c.phone_number,
            b.name as branch_name
     FROM layaways l
     JOIN customers c ON l.customer_id = c.customer_id
     JOIN branches  b ON l.branch_id   = b.branch_id
     WHERE l.layaway_id = ?`,
    [layawayId]
  );
  if (rows.length === 0) throw new NotFoundError('Apartado no encontrado');

  const [details] = await db.query(
    `SELECT ld.*, p.name as product_name, p.sku,
            pv.label as variant_label
     FROM layaway_details ld
     JOIN products p ON ld.product_id = p.product_id
     LEFT JOIN product_variants pv ON ld.variant_id = pv.variant_id
     WHERE ld.layaway_id = ?`,
    [layawayId]
  );

  const [payments] = await db.query(
    `SELECT lp.*, b.name as branch_name, u.first_name as received_by
     FROM layaway_payments lp
     JOIN branches b ON lp.branch_id = b.branch_id
     JOIN users    u ON lp.user_id   = u.user_id
     WHERE lp.layaway_id = ?
     ORDER BY lp.created_at ASC`,
    [layawayId]
  );

  const paymentIds = payments.map(p => p.payment_id);
  let detailsByPayment = {};
  if (paymentIds.length > 0) {
    const [pDetails] = await db.query(
      `SELECT lpd.*, pm.code, pm.name as method_name
       FROM layaway_payment_details lpd
       JOIN payment_methods pm ON lpd.payment_method_id = pm.payment_method_id
       WHERE lpd.payment_id IN (?)`,
      [paymentIds]
    );
    detailsByPayment = pDetails.reduce((acc, d) => {
      (acc[d.payment_id] ??= []).push(d);
      return acc;
    }, {});
  }

  const paymentsWithDetails = payments.map(p => ({
    ...p,
    details: detailsByPayment[p.payment_id] ?? [],
  }));

  return { layaway: rows[0], details, payments: paymentsWithDetails };
};

const getLayawaysByBranch = async ({ branchId, status = null, search, page = 1, limit = 20 }) => {
  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safePage  = Math.max(parseInt(page) || 1, 1);
  const offset    = (safePage - 1) * safeLimit;

  const conditions = ['l.branch_id = ?'];
  const params = [branchId];

  if (status) {
    conditions.push('l.status = ?');
    params.push(status);
  }
  if (search) {
    conditions.push('(c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone_number LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total
     FROM layaways l
     JOIN customers c ON l.customer_id = c.customer_id
     ${where}`,
    params
  );

  const [rows] = await db.query(
    `SELECT l.layaway_id, l.total_amount, l.amount_paid, l.balance,
            l.due_date, l.status, l.created_at,
            c.first_name, c.last_name, c.phone_number
     FROM layaways l
     JOIN customers c ON l.customer_id = c.customer_id
     ${where}
     ORDER BY l.layaway_id DESC
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

// ─── Crear apartado ───────────────────────────────────────────────────────────

const createLayaway = async ({
  customerId, branchId, userId,
  items, initialPayments = [],
  dueDate = null, notes = null,
}) => {
  if (!items || items.length === 0) {
    throw new ValidationError('El apartado debe tener al menos un producto');
  }

  const totalAmount = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);

  // El anticipo es opcional — un apartado puede crearse sin enganche.
  // Si viene, validamos igual que cualquier payments[] (métodos activos,
  // montos > 0), y el total del anticipo se deriva sumando el desglose.
  const hasInitialPayment = Array.isArray(initialPayments) && initialPayments.length > 0;
  const initialPaymentTotal = hasInitialPayment
    ? initialPayments.reduce((sum, p) => sum + Number(p.amount), 0)
    : 0;

  if (initialPaymentTotal > totalAmount) {
    throw new ValidationError('El anticipo no puede ser mayor al total');
  }
  const balance = totalAmount - initialPaymentTotal;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    if (hasInitialPayment) {
      await validatePayments(conn, initialPayments);
    }

    // Verificar stock disponible para todos los items antes de reservar
    for (const item of items) {
      const [stockRows] = await conn.query(
        `SELECT quantity FROM inventory_stock
         WHERE branch_id = ? AND product_id = ? AND variant_id <=> ?
         FOR UPDATE`,
        [branchId, item.product_id, item.variant_id ?? null]
      );
      const available = stockRows[0]?.quantity ?? 0;
      if (available < item.quantity) {
        const [prod] = await conn.query(
          `SELECT name FROM products WHERE product_id = ?`, [item.product_id]
        );
        await conn.rollback();
        throw new ValidationError(
          `Stock insuficiente para "${prod[0]?.name}". Disponible: ${available}`
        );
      }
    }

    // Crear cabecera
    const [result] = await conn.query(
      `INSERT INTO layaways
         (customer_id, branch_id, user_id, total_amount, amount_paid, balance, due_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [customerId, branchId, userId, totalAmount, initialPaymentTotal, balance, dueDate, notes]
    );
    const layawayId = result.insertId;

    // Insertar detalles y reservar stock
    for (const item of items) {
      await conn.query(
        `INSERT INTO layaway_details
           (layaway_id, product_id, variant_id, quantity, unit_price)
         VALUES (?, ?, ?, ?, ?)`,
        [layawayId, item.product_id, item.variant_id ?? null, item.quantity, item.unit_price]
      );

      // Reservar stock: descontamos de inventory_stock con tipo 'layaway_reserve'
      // Así el stock disponible refleja la realidad
      await stockService.applyStockMovement(conn, {
        branchId, productId: item.product_id, variantId: item.variant_id ?? null,
        delta: -Math.abs(item.quantity),
        operationType: 'layaway_reserve',
        referenceId: layawayId, referenceType: 'layaway',
        userId,
      });
    }

    // Registrar anticipo inicial si existe
    if (hasInitialPayment) {
      const [payResult] = await conn.query(
        `INSERT INTO layaway_payments (layaway_id, branch_id, user_id, amount, notes)
         VALUES (?, ?, ?, ?, 'Anticipo inicial')`,
        [layawayId, branchId, userId, initialPaymentTotal]
      );
      const paymentId = payResult.insertId;

      for (const p of initialPayments) {
        await conn.query(
          `INSERT INTO layaway_payment_details
             (payment_id, payment_method_id, amount, cash_received, cash_change, reference)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [paymentId, p.payment_method_id, p.amount, p.cash_received ?? null, p.cash_change ?? null, p.reference ?? null]
        );
      }
    }

    await conn.commit();
    return { layawayId, totalAmount, balance };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── Registrar abono ──────────────────────────────────────────────────────────

const addPayment = async ({ layawayId, branchId, userId, payments, notes = null, cashRegisterId = null }) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Validar métodos de pago y derivar el monto sumando el desglose —
    // mismo principio que en creditService: nunca se confía en un total
    // separado que pueda desincronizarse de la suma real.
    const methods     = await validatePayments(conn, payments);
    const methodsById = new Map(methods.map(m => [m.payment_method_id, m]));
    const amount = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    const [rows] = await conn.query(
      `SELECT * FROM layaways WHERE layaway_id = ? FOR UPDATE`,
      [layawayId]
    );
    if (rows.length === 0) throw new NotFoundError('Apartado no encontrado');
    const layaway = rows[0];

    if (layaway.status !== 'active') {
      throw new ValidationError(`No se puede abonar a un apartado en estado "${layaway.status}"`);
    }
    if (amount > layaway.balance) {
      throw new ValidationError(
        `El abono ($${amount}) excede el saldo pendiente ($${layaway.balance})`
      );
    }

    const newAmountPaid = layaway.amount_paid + amount;
    const newBalance    = layaway.balance - amount;
    const newStatus     = newBalance === 0 ? 'completed' : 'active';

    await conn.query(
      `UPDATE layaways
       SET amount_paid = ?, balance = ?, status = ?, updated_at = NOW()
       WHERE layaway_id = ?`,
      [newAmountPaid, newBalance, newStatus, layawayId]
    );

    // Registrar pago (cabecera) — el método ya no vive aquí, vive en el detalle
    const [payResult] = await conn.query(
      `INSERT INTO layaway_payments (layaway_id, branch_id, user_id, amount, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [layawayId, branchId, userId, amount, notes]
    );
    const paymentId = payResult.insertId;

    for (const p of payments) {
      await conn.query(
        `INSERT INTO layaway_payment_details
           (payment_id, payment_method_id, amount, cash_received, cash_change, reference)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [paymentId, p.payment_method_id, p.amount, p.cash_received ?? null, p.cash_change ?? null, p.reference ?? null]
      );
    }

    // [FIX] Igual que en creditService.addPayment: un abono hecho desde el
    // módulo de Apartados (no desde el POS) no trae una sesión de caja
    // implícita. Si el abono incluye efectivo, se exige indicar a qué caja
    // se aplica, y esa caja debe estar abierta con una sesión propia del
    // usuario que registra el abono.
    const cashAmount = payments.reduce((sum, p) => {
      const method = methodsById.get(Number(p.payment_method_id));
      return method?.code === 'cash' ? sum + Number(p.amount) : sum;
    }, 0);

    if (cashAmount > 0) {
      if (!cashRegisterId) {
        throw new ValidationError('Selecciona la caja donde se registrará el efectivo del abono');
      }

      const [registers] = await conn.query(
        `SELECT cash_register_id, is_open FROM cash_registers WHERE cash_register_id = ?`,
        [cashRegisterId]
      );
      if (registers.length === 0) throw new NotFoundError('Caja no encontrada');
      if (!registers[0].is_open) {
        throw new ValidationError('Esa caja no está abierta. Ábrela desde el POS antes de registrar el abono en efectivo.');
      }

      const [sessions] = await conn.query(
        `SELECT session_id, user_id FROM cash_register_sessions
         WHERE cash_register_id = ? AND closed_at IS NULL
         ORDER BY session_id DESC LIMIT 1`,
        [cashRegisterId]
      );
      if (sessions.length === 0) {
        throw new ValidationError('Esa caja no tiene una sesión activa. Ábrela desde el POS antes de registrar el abono en efectivo.');
      }
      if (sessions[0].user_id !== userId) {
        throw new ForbiddenError('Solo puedes registrar el efectivo del abono en una caja que tú mismo tengas abierta.');
      }

      await conn.query(
        `INSERT INTO cash_movements
           (session_id, movement_type, amount, description, user_id)
         VALUES (?, 'sale', ?, ?, ?)`,
        [sessions[0].session_id, cashAmount, `Abono a apartado #${layawayId}`, userId]
      );
    }

    await conn.commit();
    return { layawayId, newBalance, status: newStatus };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── Cancelar apartado ────────────────────────────────────────────────────────
// Devuelve el stock reservado al inventario disponible.

const cancelLayaway = async ({ layawayId, userId }) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT * FROM layaways WHERE layaway_id = ? FOR UPDATE`, [layawayId]
    );
    if (rows.length === 0) throw new NotFoundError('Apartado no encontrado');
    const layaway = rows[0];
    if (layaway.status !== 'active') {
      throw new ValidationError(`El apartado ya está en estado "${layaway.status}"`);
    }

    // Restaurar stock reservado
    const [details] = await conn.query(
      `SELECT * FROM layaway_details WHERE layaway_id = ?`, [layawayId]
    );
    for (const item of details) {
      await stockService.applyStockMovement(conn, {
        branchId: layaway.branch_id,
        productId: item.product_id, variantId: item.variant_id,
        delta: Math.abs(item.quantity),
        operationType: 'layaway_cancelled',
        referenceId: layawayId, referenceType: 'layaway',
        userId,
      });
    }

    await conn.query(
      `UPDATE layaways SET status = 'cancelled', updated_at = NOW() WHERE layaway_id = ?`,
      [layawayId]
    );

    await conn.commit();
    return { layawayId, status: 'cancelled' };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = {
  getLayawaysByCustomer, getLayawayById, getLayawaysByBranch,
  createLayaway, addPayment, cancelLayaway,
};