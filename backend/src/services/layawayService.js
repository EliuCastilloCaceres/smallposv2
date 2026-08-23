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

const getLayawaysByBranch = async ({ branchId = null, status = null, search, page = 1, limit = 20 }) => {
  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safePage  = Math.max(parseInt(page) || 1, 1);
  const offset    = (safePage - 1) * safeLimit;

  // FIX: branchId ahora es opcional — null/undefined = todas las
  // sucursales. Los abonos ya podían registrarse cruzado entre
  // sucursales (ver nota al inicio del archivo); esto alinea el LISTADO
  // con esa misma flexibilidad.
  const conditions = [];
  const params = [];

  if (branchId) {
    conditions.push('l.branch_id = ?');
    params.push(branchId);
  }
  if (status) {
    conditions.push('l.status = ?');
    params.push(status);
  }
  if (search) {
    const asId = parseInt(search);
    const like = `%${search}%`;
    conditions.push('(l.layaway_id = ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone_number LIKE ?)');
    params.push(isNaN(asId) ? 0 : asId, like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total
     FROM layaways l
     JOIN customers c ON l.customer_id = c.customer_id
     ${where}`,
    params
  );

  // FIX: en vista consolidada (branchId nulo) se agrega el nombre de la
  // sucursal donde se originó cada apartado
  const [rows] = await db.query(
    `SELECT l.layaway_id, l.total_amount, l.amount_paid, l.balance,
            l.due_date, l.status, l.created_at,
            c.first_name, c.last_name, c.phone_number
            ${branchId ? '' : ', b.name as branch_name'}
     FROM layaways l
     JOIN customers c ON l.customer_id = c.customer_id
     ${branchId ? '' : 'JOIN branches b ON l.branch_id = b.branch_id'}
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

    // [FIX] La caja ahora es obligatoria para CUALQUIER abono, sin importar
    // el método de pago — igual que en una venta normal del POS, donde
    // cash_register_id siempre queda vinculado a la orden aunque toda la
    // venta sea con tarjeta. Esto además nos da, de forma consistente, una
    // caja de la cual derivar la orden cuando este abono complete el
    // apartado (orders.cash_register_id es NOT NULL).
    if (!cashRegisterId) {
      throw new ValidationError('Selecciona la caja donde se registrará este abono');
    }
    const [registers] = await conn.query(
      `SELECT cash_register_id, is_open FROM cash_registers WHERE cash_register_id = ?`,
      [cashRegisterId]
    );
    if (registers.length === 0) throw new NotFoundError('Caja no encontrada');
    if (!registers[0].is_open) {
      throw new ValidationError('Esa caja no está abierta. Ábrela desde el POS antes de registrar el abono.');
    }

    const [sessions] = await conn.query(
      `SELECT session_id, user_id FROM cash_register_sessions
       WHERE cash_register_id = ? AND closed_at IS NULL
       ORDER BY session_id DESC LIMIT 1`,
      [cashRegisterId]
    );
    if (sessions.length === 0) {
      throw new ValidationError('Esa caja no tiene una sesión activa. Ábrela desde el POS antes de registrar el abono.');
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

    // La restricción de "solo tu propia caja abierta" se mantiene, pero
    // ahora acotada a cuando de verdad hay efectivo de por medio — elegir
    // la caja para trazabilidad (tarjeta/transferencia) no toca ningún
    // cajón de dinero ajeno, así que no necesita esa restricción.
    const cashAmount = payments.reduce((sum, p) => {
      const method = methodsById.get(Number(p.payment_method_id));
      return method?.code === 'cash' ? sum + Number(p.amount) : sum;
    }, 0);

    if (cashAmount > 0) {
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

    // [FIX] Si este abono completa el apartado, se convierte en una orden
    // real (orders/order_details/order_payments) — ver nota al inicio del
    // archivo: "el stock se descuenta definitivamente al completarlo
    // (convertirlo en venta)". Esa conversión nunca estaba implementada,
    // por eso los apartados no aparecían en dashboard, módulo de ventas ni
    // reportes de productos vendidos. El stock NO se vuelve a descontar
    // aquí — ya se reservó/descontó por completo al crear el apartado
    // ('layaway_reserve'); esta orden es solo el rastro contable.
    let orderId = null;
    if (newStatus === 'completed') {
      orderId = await convertLayawayToOrder(conn, {
        layawayId, customerId: layaway.customer_id,
        totalAmount: Number(layaway.total_amount),
        branchId, cashRegisterId, userId,
      });
    }

    await conn.commit();
    return { layawayId, newBalance, status: newStatus, orderId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── Completar apartado → registrar como venta ────────────────────────────────
// Se ejecuta dentro de la MISMA transacción de addPayment cuando el saldo
// llega a $0. El stock ya se descontó al crear el apartado ('layaway_reserve'),
// así que aquí NO se toca inventario — solo se genera el rastro contable
// (orders/order_details/order_payments) para dashboard, módulo de ventas y
// reportes de productos vendidos.
//
// NOTA: purchase_price no se guarda en layaway_details al crear el apartado
// (solo product_id, variant_id, quantity, unit_price), así que se toma el
// purchase_price ACTUAL de products (las variantes no tienen costo propio,
// siempre vive en el producto base) al momento de completar, no el que
// tenía cuando se apartó. Si tu negocio necesita el costo histórico
// exacto, habría que agregar esa columna a layaway_details desde la creación.
const convertLayawayToOrder = async (conn, { layawayId, customerId, totalAmount, branchId, cashRegisterId, userId }) => {
  const [details] = await conn.query(
    `SELECT ld.product_id, ld.variant_id, ld.quantity, ld.unit_price,
            p.purchase_price
     FROM layaway_details ld
     JOIN products p ON ld.product_id = p.product_id
     WHERE ld.layaway_id = ?`,
    [layawayId]
  );

  // Todos los pagos acumulados del apartado (anticipo inicial + cada abono,
  // incluido el que se acaba de insertar en esta misma transacción).
  const [payments] = await conn.query(
    `SELECT lpd.payment_method_id, lpd.amount, lpd.cash_received, lpd.cash_change, lpd.reference
     FROM layaway_payments lp
     JOIN layaway_payment_details lpd ON lpd.payment_id = lp.payment_id
     WHERE lp.layaway_id = ?`,
    [layawayId]
  );

  const [orderResult] = await conn.query(
    `INSERT INTO orders
       (branch_id, cash_register_id, customer_id, user_id,
        subtotal, discount, total, notes, status, layaway_id)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'completed', ?)`,
    [
      branchId, cashRegisterId, customerId, userId,
      totalAmount, totalAmount,
      `Apartado #${layawayId}`, layawayId,
    ]
  );
  const orderId = orderResult.insertId;

  for (const item of details) {
    await conn.query(
      `INSERT INTO order_details
         (order_id, product_id, variant_id, quantity,
          unit_price, purchase_price, discount, subtotal)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        orderId, item.product_id, item.variant_id, item.quantity,
        item.unit_price, item.purchase_price,
        item.unit_price * item.quantity,
      ]
    );
  }

  for (const p of payments) {
    await conn.query(
      `INSERT INTO order_payments
         (order_id, payment_method_id, amount, cash_received, cash_change, reference)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orderId, p.payment_method_id, p.amount, p.cash_received, p.cash_change, p.reference]
    );
  }

  return orderId;
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