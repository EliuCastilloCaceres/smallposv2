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

  return { credit: rows[0], payments: paymentsWithDetails };
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

const getActiveCreditsByBranch = async (branchId) => {
  const [rows] = await db.query(
    `SELECT cs.credit_sale_id, cs.total_amount, cs.amount_paid,
            cs.balance, cs.due_date, cs.status, cs.created_at,
            c.first_name, c.last_name, c.phone_number
     FROM credit_sales cs
     JOIN orders   o ON cs.order_id   = o.order_id
     JOIN customers c ON cs.customer_id = c.customer_id
     WHERE o.branch_id = ? AND cs.status IN ('active','overdue')
     ORDER BY cs.due_date ASC`,
    [branchId]
  );
  return rows;
};

// ─── Crear crédito (se llama desde orderService cuando payment_method = 'credit') ──

const createCreditSale = async (conn, { orderId, customerId, totalAmount, dueDate = null }) => {
  const customer = await getCustomerWithLock(conn, customerId);

  if (customer.credit_limit === 0) {
    throw new ForbiddenError('El cliente no tiene línea de crédito autorizada');
  }

  const availableCredit = customer.credit_limit - customer.credit_balance;
  if (totalAmount > availableCredit) {
    throw new ValidationError(
      `Crédito insuficiente. Disponible: $${availableCredit.toFixed(2)}, solicitado: $${totalAmount.toFixed(2)}`
    );
  }

  // Crear registro de crédito
  const [result] = await conn.query(
    `INSERT INTO credit_sales
       (order_id, customer_id, total_amount, amount_paid, balance, due_date, status)
     VALUES (?, ?, ?, 0, ?, ?, 'active')`,
    [orderId, customerId, totalAmount, totalAmount, dueDate]
  );

  // Incrementar saldo del cliente
  await conn.query(
    `UPDATE customers
     SET credit_balance = credit_balance + ?, updated_at = NOW()
     WHERE customer_id = ?`,
    [totalAmount, customerId]
  );

  return result.insertId;
};

// ─── Registrar abono ──────────────────────────────────────────────────────────

const addPayment = async ({ creditSaleId, branchId, userId, payments, notes = null }) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Validar métodos de pago y calcular el monto total del abono
    // sumando el desglose — el monto nunca se recibe como dato separado,
    // así se evita que el total y el desglose se desincronicen.
    await validatePayments(conn, payments);
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

module.exports = {
  getCreditsByCustomer, getCreditById,
  getOverdueCredits, getActiveCreditsByBranch,
  createCreditSale, addPayment,
  markOverdueCredits, updateCreditLimit,
};