// src/services/creditService.js
// Módulo de crédito.
// - Una venta a crédito genera un registro en credit_sales.
// - El saldo del cliente (customers.credit_balance) se actualiza en cada operación.
// - Los abonos pueden registrarse en cualquier sucursal.
// - Se valida el límite de crédito antes de autorizar.

const db = require('../config/db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../errors/AppError');

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

// ─── Helpers internos ─────────────────────────────────────────────────────────

const getCustomerWithLock = async (conn, customerId) => {
  const [rows] = await conn.query(
    `SELECT customer_id, first_name, last_name,
            credit_limit, credit_balance, is_active
     FROM customers WHERE customer_id = ? FOR UPDATE`,
    [customerId]
  );
  if (rows.length === 0) throw new NotFoundError('Cliente no encontrado');
  return rows[0];
};

// ─── Consultas ────────────────────────────────────────────────────────────────

const getCreditsByCustomer = async (customerId) => {
  const [rows] = await db.query(
    `SELECT cs.*,
            o.created_at as sale_date,
            o.total      as order_total,
            b.name       as branch_name
     FROM credit_sales cs
     JOIN orders   o ON cs.order_id   = o.order_id
     JOIN branches b ON o.branch_id   = b.branch_id
     WHERE cs.customer_id = ?
     ORDER BY cs.credit_sale_id DESC`,
    [customerId]
  );
  return rows;
};

const getCreditById = async (creditSaleId) => {
  const [rows] = await db.query(
    `SELECT cs.*,
            c.first_name, c.last_name, c.phone_number,
            c.credit_limit, c.credit_balance
     FROM credit_sales cs
     JOIN customers c ON cs.customer_id = c.customer_id
     WHERE cs.credit_sale_id = ?`,
    [creditSaleId]
  );
  if (rows.length === 0) throw new NotFoundError('Crédito no encontrado');

  // Artículos de la venta que generó este crédito — mismo query que usa
  // orderService.getOrderById, ya que credit_sales.order_id apunta
  // directamente a esa orden.
  const [details] = await db.query(
    `SELECT od.*, p.name as product_name, p.sku,
            pv.label as variant_label, pv.sku as variant_sku
     FROM order_details od
     JOIN products p ON od.product_id = p.product_id
     LEFT JOIN product_variants pv ON od.variant_id = pv.variant_id
     WHERE od.order_id = ?`,
    [rows[0].order_id]
  );

  const [payments] = await db.query(
    `SELECT cp.*, b.name as branch_name, u.first_name as received_by
     FROM credit_payments cp
     JOIN branches b ON cp.branch_id = b.branch_id
     JOIN users    u ON cp.user_id   = u.user_id
     WHERE cp.credit_sale_id = ?
     ORDER BY cp.created_at ASC`,
    [creditSaleId]
  );

  // Desglose por método de cada abono — un abono puede tener 1+ filas si fue mixto
  const paymentIds = payments.map(p => p.payment_id);
  let detailsByPayment = {};
  if (paymentIds.length > 0) {
    const [details] = await db.query(
      `SELECT cpd.*, pm.code, pm.name as method_name
       FROM credit_payment_details cpd
       JOIN payment_methods pm ON cpd.payment_method_id = pm.payment_method_id
       WHERE cpd.payment_id IN (?)`,
      [paymentIds]
    );
    detailsByPayment = details.reduce((acc, d) => {
      (acc[d.payment_id] ??= []).push(d);
      return acc;
    }, {});
  }

  const paymentsWithDetails = payments.map(p => ({
    ...p,
    details: detailsByPayment[p.payment_id] ?? [],
  }));

  return { credit: rows[0], details, payments: paymentsWithDetails };
};

const getOverdueCredits = async () => {
  const [rows] = await db.query(
    `SELECT cs.credit_sale_id, cs.total_amount, cs.balance, cs.due_date,
            DATEDIFF(NOW(), cs.due_date) as days_overdue,
            c.first_name, c.last_name, c.phone_number
     FROM credit_sales cs
     JOIN customers c ON cs.customer_id = c.customer_id
     WHERE cs.status = 'active' AND cs.due_date < CURDATE()
     ORDER BY days_overdue DESC`
  );
  return rows;
};

const getActiveCreditsByBranch = async ({ branchId = null, status, search, page = 1, limit = 20 }) => {
  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safePage  = Math.max(parseInt(page) || 1, 1);
  const offset    = (safePage - 1) * safeLimit;

  // FIX: branchId ahora es opcional — null/undefined = todas las
  // sucursales. Los abonos ya podían registrarse cruzado entre
  // sucursales (ver nota al inicio del archivo); esto solo alinea el
  // LISTADO con esa misma flexibilidad.
  const conditions = [];
  const params = [];

  if (branchId) {
    conditions.push('o.branch_id = ?');
    params.push(branchId);
  }

  // Sin status explícito, mantiene el comportamiento original: solo
  // activos/vencidos (para eso era esta función). Con status, filtra por
  // ese estado puntual (permite ver pagados/cancelados también).
  if (status) {
    conditions.push('cs.status = ?');
    params.push(status);
  } else {
    conditions.push(`cs.status IN ('active','overdue')`);
  }

  if (search) {
    const asId = parseInt(search);
    const like = `%${search}%`;
    conditions.push('(cs.credit_sale_id = ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone_number LIKE ?)');
    params.push(isNaN(asId) ? 0 : asId, like, like, like);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total
     FROM credit_sales cs
     JOIN orders    o ON cs.order_id    = o.order_id
     JOIN customers c ON cs.customer_id = c.customer_id
     ${where}`,
    params
  );

  // FIX: en vista consolidada (branchId nulo) se agrega el nombre de la
  // sucursal donde se originó cada crédito — sin esto, en esa vista es
  // imposible saber de cuál es cada uno
  const [rows] = await db.query(
    `SELECT cs.credit_sale_id, cs.total_amount, cs.amount_paid,
            cs.balance, cs.due_date, cs.status, cs.created_at,
            c.first_name, c.last_name, c.phone_number
            ${branchId ? '' : ', b.name as branch_name'}
     FROM credit_sales cs
     JOIN orders   o ON cs.order_id   = o.order_id
     JOIN customers c ON cs.customer_id = c.customer_id
     ${branchId ? '' : 'JOIN branches b ON o.branch_id = b.branch_id'}
     ${where}
     ORDER BY cs.due_date ASC
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

// ─── Crear crédito (se llama desde orderService cuando payment_method = 'credit') ──
//
// [CAMBIO] Antes se llamaba con totalAmount = solo la porción que quedaba a
// crédito (ej. venta de $280 con $100 de anticipo → totalAmount = $180), así
// que el anticipo nunca quedaba registrado en ningún lado del módulo de
// crédito — el crédito "nacía" ya achicado y el abono era invisible.
// Ahora totalAmount es el TOTAL de la venta y, si se recibió un anticipo al
// momento de crear la venta (downPayments), se aplica de inmediato como un
// abono real (credit_payments + credit_payment_details) dentro de la misma
// transacción — así el crédito nace por el total correcto y el anticipo
// aparece en el historial de abonos, con balance ya reflejando el resto.
//
// El límite de crédito disponible se sigue validando contra lo que
// realmente va a quedar pendiente (checkAmount), no contra el total bruto:
// si el cliente paga parte de contado, esa parte nunca representa una
// exposición de crédito real, así que no debe consumir línea de crédito.
const createCreditSale = async (conn, {
  orderId, customerId, totalAmount, checkAmount = totalAmount, dueDate = null,
  branchId = null, userId = null, downPayments = [],
}) => {
  const customer = await getCustomerWithLock(conn, customerId);

  if (customer.credit_limit === 0) {
    throw new ForbiddenError('El cliente no tiene línea de crédito autorizada');
  }

  const availableCredit = customer.credit_limit - customer.credit_balance;
  if (Number(checkAmount) > availableCredit) {
    throw new ValidationError(
      `Crédito insuficiente. Disponible: $${availableCredit.toFixed(2)}, solicitado: $${Number(checkAmount).toFixed(2)}`
    );
  }

  // Crear registro de crédito por el TOTAL de la venta
  const [result] = await conn.query(
    `INSERT INTO credit_sales
       (order_id, customer_id, total_amount, amount_paid, balance, due_date, status)
     VALUES (?, ?, ?, 0, ?, ?, 'active')`,
    [orderId, customerId, totalAmount, totalAmount, dueDate]
  );
  const creditSaleId = result.insertId;

  // Incrementar saldo del cliente por el total completo — si hubo anticipo,
  // se revierte la porción correspondiente unas líneas más abajo, dejando
  // el neto correcto en una sola transacción.
  await conn.query(
    `UPDATE customers
     SET credit_balance = credit_balance + ?, updated_at = NOW()
     WHERE customer_id = ?`,
    [totalAmount, customerId]
  );

  // Anticipo recibido al momento de la venta → se aplica de inmediato como abono
  const downAmount = downPayments.reduce((s, p) => s + Number(p.amount), 0);
  if (downAmount > 0) {
    if (!branchId || !userId) {
      throw new ValidationError('Se requiere branchId y userId para registrar el anticipo del crédito');
    }

    const newAmountPaid = downAmount;
    const newBalance    = +(Number(totalAmount) - downAmount).toFixed(2);
    const newStatus     = newBalance <= 0 ? 'paid' : 'active';

    await conn.query(
      `UPDATE credit_sales
       SET amount_paid = ?, balance = ?, status = ?, updated_at = NOW()
       WHERE credit_sale_id = ?`,
      [newAmountPaid, newBalance, newStatus, creditSaleId]
    );

    await conn.query(
      `UPDATE customers
       SET credit_balance = credit_balance - ?, updated_at = NOW()
       WHERE customer_id = ?`,
      [downAmount, customerId]
    );

    const [payResult] = await conn.query(
      `INSERT INTO credit_payments (credit_sale_id, branch_id, user_id, amount, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [creditSaleId, branchId, userId, downAmount, 'Anticipo registrado al momento de la venta']
    );
    const paymentId = payResult.insertId;

    for (const p of downPayments) {
      await conn.query(
        `INSERT INTO credit_payment_details
           (payment_id, payment_method_id, amount, cash_received, cash_change, reference)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [paymentId, p.payment_method_id, p.amount, p.cash_received ?? null, p.cash_change ?? null, p.reference ?? null]
      );
    }
  }

  return creditSaleId;
};

// ─── Registrar abono ──────────────────────────────────────────────────────────

const addPayment = async ({ creditSaleId, branchId, userId, payments, notes = null, cashRegisterId = null }) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Validar métodos de pago y calcular el monto total del abono
    // sumando el desglose — el monto nunca se recibe como dato separado,
    // así se evita que el total y el desglose se desincronicen.
    const methods     = await validatePayments(conn, payments);
    const methodsById = new Map(methods.map(m => [m.payment_method_id, m]));
    const amount = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    // Bloquear el crédito
    const [credits] = await conn.query(
      `SELECT * FROM credit_sales WHERE credit_sale_id = ? FOR UPDATE`,
      [creditSaleId]
    );
    if (credits.length === 0) throw new NotFoundError('Crédito no encontrado');
    const credit = credits[0];

    if (credit.status === 'paid' || credit.status === 'cancelled') {
      throw new ValidationError(`El crédito ya está en estado "${credit.status}"`);
    }
    if (amount > credit.balance) {
      throw new ValidationError(
        `El abono ($${amount}) excede el saldo pendiente ($${credit.balance})`
      );
    }

    const newAmountPaid = credit.amount_paid + amount;
    const newBalance    = credit.balance - amount;
    const newStatus     = newBalance === 0 ? 'paid' : 'active';

    // [FIX] La caja ahora es obligatoria para CUALQUIER abono, no solo
    // efectivo — mismo criterio ya aplicado en layawayService.addPayment.
    // Sin esto, un abono con tarjeta/transferencia queda sin ninguna sesión
    // a la cual atribuirlo, y por diseño (ver payment_events) necesitamos
    // esa sesión para que aparezca en el corte de caja correcto.
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

    // Actualizar crédito
    await conn.query(
      `UPDATE credit_sales
       SET amount_paid = ?, balance = ?, status = ?, updated_at = NOW()
       WHERE credit_sale_id = ?`,
      [newAmountPaid, newBalance, newStatus, creditSaleId]
    );

    // Reducir saldo del cliente
    await conn.query(
      `UPDATE customers
       SET credit_balance = credit_balance - ?, updated_at = NOW()
       WHERE customer_id = ?`,
      [amount, credit.customer_id]
    );

    // Registrar pago (cabecera) — el método ya no vive aquí, vive en el detalle
    const [payResult] = await conn.query(
      `INSERT INTO credit_payments (credit_sale_id, branch_id, user_id, amount, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [creditSaleId, branchId, userId, amount, notes]
    );
    const paymentId = payResult.insertId;

    // Registrar el desglose por método
    for (const p of payments) {
      await conn.query(
        `INSERT INTO credit_payment_details
           (payment_id, payment_method_id, amount, cash_received, cash_change, reference)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [paymentId, p.payment_method_id, p.amount, p.cash_received ?? null, p.cash_change ?? null, p.reference ?? null]
      );

      // [NUEVO] Rastro en payment_events para el corte de caja — cubre
      // TODOS los métodos, no solo efectivo.
      await conn.query(
        `INSERT INTO payment_events
           (source_type, source_id, branch_id, cash_register_id, session_id,
            payment_method_id, amount, user_id)
         VALUES ('credit', ?, ?, ?, ?, ?, ?, ?)`,
        [creditSaleId, branchId, cashRegisterId, sessions[0].session_id, p.payment_method_id, p.amount, userId]
      );
    }

    // La restricción de "solo tu propia caja abierta" se mantiene, pero
    // acotada a cuando de verdad hay efectivo de por medio — elegir la
    // caja para trazabilidad (tarjeta/transferencia) no toca ningún cajón
    // de dinero ajeno, así que no necesita esa restricción.
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
        [sessions[0].session_id, cashAmount, `Abono a crédito #${creditSaleId}`, userId]
      );
    }

    await conn.commit();
    return { creditSaleId, newBalance, status: newStatus };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── Actualizar estado de créditos vencidos (cron o llamada manual) ───────────

const markOverdueCredits = async () => {
  const [result] = await db.query(
    `UPDATE credit_sales
     SET status = 'overdue'
     WHERE status = 'active' AND due_date < CURDATE()`
  );
  return { updated: result.affectedRows };
};

// ─── Aprobar / modificar límite de crédito de un cliente ─────────────────────

const updateCreditLimit = async ({ customerId, newLimit, approvedBy }) => {
  if (newLimit < 0) throw new ValidationError('El límite de crédito no puede ser negativo');

  const [customers] = await db.query(
    `SELECT credit_balance FROM customers WHERE customer_id = ?`, [customerId]
  );
  if (customers.length === 0) throw new NotFoundError('Cliente no encontrado');

  if (newLimit < customers[0].credit_balance) {
    throw new ValidationError(
      `El nuevo límite ($${newLimit}) no puede ser menor al saldo adeudado ($${customers[0].credit_balance})`
    );
  }

  await db.query(
    `UPDATE customers SET credit_limit = ?, updated_at = NOW() WHERE customer_id = ?`,
    [newLimit, customerId]
  );
  return { customerId, newLimit };
};

// ─── Cancelar crédito (se llama desde orderService cuando se cancela la orden) ──
// Solo revierte créditos SIN abonos — si el cliente ya pagó algo, mezclar esa
// cancelación con pagos ya cobrados es un caso de negocio ambiguo (¿se le
// devuelve el dinero? ¿se le abona a otra cosa?) que debe resolverse a mano
// desde el módulo de créditos, no de forma automática aquí.
const ANTICIPO_NOTE = 'Anticipo registrado al momento de la venta';

const cancelCreditSale = async (conn, { orderId }) => {
  const [credits] = await conn.query(
    `SELECT * FROM credit_sales WHERE order_id = ? FOR UPDATE`,
    [orderId]
  );
  if (credits.length === 0) return null; // la orden no tenía porción a crédito
  const credit = credits[0];

  if (credit.status === 'cancelled') return credit;

  if (Number(credit.amount_paid) > 0) {
    // [CAMBIO] Antes CUALQUIER amount_paid > 0 bloqueaba la cancelación
    // automática. Ahora el crédito puede nacer con un abono ya aplicado
    // (el anticipo tomado en el momento de la venta — ver createCreditSale),
    // y ese abono es parte de la MISMA operación que se está cancelando, no
    // un pago posterior independiente. Si todos los abonos registrados son
    // ese anticipo (y no hay abonos reales hechos después, en otra visita),
    // es seguro revertirlo junto con todo lo demás.
    const [payments] = await conn.query(
      `SELECT payment_id, notes FROM credit_payments WHERE credit_sale_id = ?`,
      [credit.credit_sale_id]
    );
    const onlyInitialAnticipo = payments.length > 0 && payments.every(p => p.notes === ANTICIPO_NOTE);

    if (!onlyInitialAnticipo) {
      throw new ValidationError(
        'No se puede cancelar la venta: el cliente ya abonó a este crédito. Ajusta el crédito manualmente desde el módulo de créditos antes de cancelar.'
      );
    }

    const paymentIds = payments.map(p => p.payment_id);
    await conn.query(`DELETE FROM credit_payment_details WHERE payment_id IN (?)`, [paymentIds]);
    await conn.query(`DELETE FROM credit_payments WHERE payment_id IN (?)`, [paymentIds]);
  }

  // FIX: 'balance = 0' a mano violaba chk_credit_sales_balance
  // (balance = total_amount - amount_paid) porque total_amount nunca se
  // toca aquí — con amount_paid ya en 0, el único balance matemáticamente
  // válido ES total_amount (nada se pagó, y la venta completa quedó
  // cancelada, así que tampoco se debe nada realmente: un balance de
  // 'total_amount' en un crédito 'cancelled' no representa saldo
  // pendiente, es solo el remanente aritmético de la fórmula del CHECK —
  // getOverdueCredits/getActiveCreditsByBranch nunca listan 'cancelled'
  // como adeudo). Se referencia la columna total_amount directamente en el
  // mismo UPDATE en vez de hacer un segundo SELECT.
  await conn.query(
    `UPDATE credit_sales
     SET status = 'cancelled', amount_paid = 0, balance = total_amount, updated_at = NOW()
     WHERE credit_sale_id = ?`,
    [credit.credit_sale_id]
  );

  // El neto que este crédito le sumó al saldo del cliente siempre es
  // credit.balance (total_amount - amount_paid en el momento de cancelar,
  // ya sea 0 si nunca hubo abono o el resto tras revertir el anticipo).
  await conn.query(
    `UPDATE customers SET credit_balance = credit_balance - ?, updated_at = NOW() WHERE customer_id = ?`,
    [credit.balance, credit.customer_id]
  );

  return credit;
};

module.exports = {
  getCreditsByCustomer, getCreditById,
  getOverdueCredits, getActiveCreditsByBranch,
  createCreditSale, cancelCreditSale, addPayment,
  markOverdueCredits, updateCreditLimit,
};