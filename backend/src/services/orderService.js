// src/services/orderService.js
// Toda la lógica de negocio de ventas vive aquí.
// FIX: createOrder ahora inserta la cabecera de la orden ANTES de descontar stock,
//      pasando el orderId real a deductSaleStock. Se elimina el UPDATE posterior
//      que vinculaba movimientos por user_id (frágil ante concurrencia).

const db = require('../config/db');
const stockService = require('./stockService');
const creditService = require('./creditService');
const { NotFoundError, ValidationError, ForbiddenError } = require('../errors/AppError');

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
    const methods = await validatePayments(conn, payments);
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

    // 7. Si alguna porción del pago fue a crédito, registrar el crédito por
    //    el TOTAL de la venta (no solo la porción a crédito) — si además
    //    hubo un anticipo (el resto de las líneas de payments), se aplica de
    //    inmediato como abono contra ese crédito, así queda visible en su
    //    historial en vez de perderse como si el crédito nunca hubiera
    //    incluido esa parte. El límite disponible solo se valida contra lo
    //    que realmente queda pendiente (la línea de crédito), no contra el
    //    total bruto — la porción pagada de contado no consume línea de
    //    crédito.
    const creditLines = payments.filter(p => methodsById.get(Number(p.payment_method_id))?.code === 'credit');

    if (creditLines.length > 0) {
      const creditCheckAmount = creditLines.reduce((sum, p) => sum + Number(p.amount), 0);
      const downPayments = payments.filter(p => !creditLines.includes(p));
      await creditService.createCreditSale(conn, {
        orderId, customerId,
        totalAmount: Number(total),
        checkAmount: creditCheckAmount,
        dueDate,
        branchId, userId,
        downPayments: downPayments.map(p => ({
          payment_method_id: p.payment_method_id,
          amount: p.amount,
          cash_received: p.cash_received,
          cash_change: p.cash_change,
          reference: p.reference,
        })),
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

const cancelOrder = async ({ orderId, userId, branchId }) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [orders] = await conn.query(
      `SELECT * FROM orders WHERE order_id = ?`, [orderId]
    );
    if (orders.length === 0) throw new NotFoundError('Orden no encontrada');
    const order = orders[0];
    // [FIX] No había validación de sucursal — cualquiera con permiso
    // orders:cancel podía cancelar una orden de OTRA sucursal si adivinaba
    // el orderId. branchId llega ya resuelto por resolveBranchId (fija
    // para no-admin, elegida por el admin vía BranchGate).
    // Si branchId existe (no es null ni undefined) y es diferente al de la orden, bloquea el acceso
    if (branchId !== null && branchId !== undefined && orders[0].branch_id !== branchId) {
      throw new ForbiddenError('Esta orden pertenece a otra sucursal');
    }

    if (order.status === 'cancelled') throw new ValidationError('La orden ya está cancelada');

    const [details] = await conn.query(
      `SELECT product_id, variant_id, quantity FROM order_details WHERE order_id = ?`,
      [orderId]
    );

    await stockService.restoreSaleStock(conn, {
      branchId: order.branch_id,
      items: details,
      referenceId: orderId,
      referenceType: 'order',
      userId,
    });

    // [FIX] Antes cancelar una orden restauraba el stock pero no tocaba
    // caja: el movimiento 'sale' original seguía sumando en
    // "Efectivo esperado" del corte aunque la venta ya no contara como
    // completada. Ahora se inserta un movimiento 'return' por el monto
    // pagado en efectivo, en la sesión ABIERTA de ese registro en este
    // momento. Si esa sesión ya cerró, no se toca nada — ese corte ya
    // quedó hecho con ese ingreso contado, no se puede corregir
    // retroactivamente desde aquí.
    const [[{ cash_amount: cashAmount }]] = await conn.query(
      `SELECT COALESCE(SUM(op.amount), 0) AS cash_amount
       FROM order_payments op
       JOIN payment_methods pm ON pm.payment_method_id = op.payment_method_id
       WHERE op.order_id = ? AND pm.code = 'cash'`,
      [orderId]
    );

    if (Number(cashAmount) > 0) {
      const [session] = await conn.query(
        `SELECT session_id FROM cash_register_sessions
         WHERE cash_register_id = ? AND closed_at IS NULL
         ORDER BY session_id DESC LIMIT 1`,
        [order.cash_register_id]
      );
      if (session.length > 0) {
        await conn.query(
          `INSERT INTO cash_movements
             (session_id, movement_type, amount, description, user_id)
           VALUES (?, 'return', ?, ?, ?)`,
          [session[0].session_id, Number(cashAmount), `Cancelación de venta #${orderId}`, userId]
        );
      }
    }

    // [FIX] Revertir la porción a crédito, si la hubo (lanza ValidationError
    // y aborta la transacción si el cliente ya abonó — ver comentario en
    // creditService.cancelCreditSale).
    await creditService.cancelCreditSale(conn, { orderId });

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

const getOrderById = async (orderId, branchId) => {
  // FIX: se agrega el LEFT JOIN a branch_receipts para que la orden traiga
  // su propia config de recibo — igual patrón que branchService.withReceipt.
  // Antes el frontend sacaba esto de BranchContext (selectedBranch.receipt),
  // que podía estar vacío en vista consolidada, o peor: apuntar a OTRA
  // sucursal si el admin la había seleccionado antes en otra pantalla
  // (ej. el POS), imprimiendo el ticket con el logo/RFC equivocado.
  const [orders] = await db.query(
    `SELECT o.*,
            c.first_name as customer_firstname, c.last_name as customer_lastname,
            u.first_name as user_firstname,     u.last_name as user_lastname,
            b.name as branch_name,              cr.name as cash_register_name,
            br.receipt_id, br.store_name, br.address AS receipt_address, br.rfc,
            br.phone AS receipt_phone, br.logo_image, br.footer_text,
            br.is_active AS receipt_is_active
     FROM orders o
     JOIN customers c      ON o.customer_id      = c.customer_id
     JOIN users u          ON o.user_id           = u.user_id
     JOIN branches b       ON o.branch_id         = b.branch_id
     JOIN cash_registers cr ON o.cash_register_id = cr.cash_register_id
     LEFT JOIN branch_receipts br ON br.branch_id = o.branch_id
     WHERE o.order_id = ?`,
    [orderId]
  );
  if (orders.length === 0) throw new NotFoundError('Orden no encontrada');
  // [FIX] Sin esto, cualquier usuario con permiso orders:read podía ver el
  // detalle de una orden de OTRA sucursal adivinando el orderId.
  // Si branchId existe (no es null ni undefined) y es diferente al de la orden, bloquea el acceso
  if (branchId !== null && branchId !== undefined && orders[0].branch_id !== branchId) {
    throw new ForbiddenError('Esta orden pertenece a otra sucursal');
  }


  const {
    receipt_id, store_name, receipt_address, rfc,
    receipt_phone, logo_image, footer_text, receipt_is_active,
    ...orderRow
  } = orders[0];

  const order = {
    ...orderRow,
    receipt: receipt_id
      ? {
        receipt_id, store_name, address: receipt_address, rfc,
        phone: receipt_phone, logo_image, footer_text, is_active: receipt_is_active
      }
      : null,
  };

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

  // Si la venta incluyó una porción a crédito, traer el estado actual de
  // ese crédito y su último abono — para mostrarlo en el detalle de la
  // venta sin que el cajero tenga que ir al módulo de Créditos a buscarlo.
  let credit = null;
  const [creditRows] = await db.query(
    `SELECT credit_sale_id, status, due_date, total_amount, amount_paid, balance
     FROM credit_sales WHERE order_id = ?`,
    [orderId]
  );
  if (creditRows.length > 0) {
    credit = creditRows[0];
    const [lastPayment] = await db.query(
      `SELECT amount, created_at FROM credit_payments
       WHERE credit_sale_id = ? ORDER BY created_at DESC LIMIT 1`,
      [credit.credit_sale_id]
    );
    credit.last_payment = lastPayment[0] ?? null;
  }

  return { order, details, payments, credit };
};

// ─── Filtros compartidos ─────────────────────────────────────────────────────
// FIX: extraído para reusar entre el listado y el cálculo de totales, que
// ahora necesitan builds de WHERE ligeramente distintos (los totales
// siempre son sobre ventas completadas, sin importar el filtro de estado
// de la tabla — ver comentario en getOrdersByBranchAndDateRange).
const buildOrdersFilter = ({ branchId, startDate, endDate, status, search, forceCompleted = false }) => {
  let where = 'WHERE o.created_at BETWEEN ? AND ?';
  const params = [startDate, `${endDate} 23:59:59`];

  // FIX: branchId ahora es opcional — null/undefined = todas las
  // sucursales (vista consolidada para el admin central)
  if (branchId) {
    where += ' AND o.branch_id = ?';
    params.push(branchId);
  }

  if (forceCompleted) {
    where += " AND o.status = 'completed'";
  } else if (status) {
    where += ' AND o.status = ?';
    params.push(status);
  }

  if (search) {
    const asId = parseInt(search);
    const like = `%${search}%`;
    where += ' AND (o.order_id = ? OR c.first_name LIKE ? OR c.last_name LIKE ?)';
    params.push(isNaN(asId) ? 0 : asId, like, like);
  }

  return { where, params };
};

// FIX: totales por método de pago para el rango/sucursal/búsqueda
// filtrados. A propósito IGNORA el dropdown de estado — el filtro de
// estado es para revisar/auditar (incluidas canceladas), pero una
// "Cancelada" ya no representa dinero cobrado, así que contarla en el
// total inflaría la cifra. Los totales siempre son sobre completadas.
// Extraído como helper porque tanto el listado de ventas como la nueva
// pestaña de productos vendidos necesitan el mismo desglose para el
// mismo rango/sucursal (los totales de caja no cambian según qué
// producto o categoría se esté mirando en la tabla).
const getPaymentMethodTotals = async ({ branchId, startDate, endDate, search }) => {
  const { where: totalsWhere, params: totalsParams } = buildOrdersFilter({
    branchId, startDate, endDate, search, forceCompleted: true,
  });

  const [totalsRows] = await db.query(
    `SELECT pm.payment_method_id, pm.name, pm.code,
            COALESCE(SUM(op.amount), 0) AS total
     FROM order_payments op
     JOIN payment_methods pm ON pm.payment_method_id = op.payment_method_id
     JOIN orders o ON op.order_id = o.order_id
     JOIN customers c ON o.customer_id = c.customer_id
     ${totalsWhere}
     GROUP BY pm.payment_method_id
     ORDER BY total DESC`,
    totalsParams
  );

  const byMethod = totalsRows.map(r => ({ ...r, total: Number(r.total) }));
  const grandTotal = +byMethod.reduce((sum, r) => sum + r.total, 0).toFixed(2);

  return { by_method: byMethod, grand_total: grandTotal };
};

const getOrdersByBranchAndDateRange = async ({
  branchId, startDate, endDate, status = null, search, page = 1, limit = 20,
}) => {
  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safePage = Math.max(parseInt(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const { where, params } = buildOrdersFilter({ branchId, startDate, endDate, status, search });

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total
     FROM orders o
     JOIN customers c ON o.customer_id = c.customer_id
     ${where}`,
    params
  );

  // FIX: en vista consolidada (branchId nulo) se agrega el nombre de la
  // sucursal — sin esto, en esa vista es imposible saber de qué sucursal
  // es cada orden
  const [rows] = await db.query(
    `SELECT o.order_id, o.subtotal, o.discount, o.total,
            o.status, o.created_at,
            c.first_name as customer_firstname, c.last_name as customer_lastname,
            u.first_name as user_firstname,     u.last_name as user_lastname,
            cr.name as cash_register_name
            ${branchId ? '' : ', b.name as branch_name'},
            EXISTS (
              SELECT 1 FROM order_payments op
              JOIN payment_methods pm ON pm.payment_method_id = op.payment_method_id
              WHERE op.order_id = o.order_id AND pm.code = 'credit'
            ) AS is_credit
     FROM orders o
     JOIN customers c       ON o.customer_id      = c.customer_id
     JOIN users u           ON o.user_id           = u.user_id
     JOIN cash_registers cr ON o.cash_register_id  = cr.cash_register_id
     ${branchId ? '' : 'JOIN branches b ON o.branch_id = b.branch_id'}
     ${where}
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  const totals = await getPaymentMethodTotals({ branchId, startDate, endDate, search });

  return {
    data: rows,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    },
    totals,
  };
};

// ─── Productos vendidos (agregado) ─────────────────────────────────────────
// A diferencia del listado de ventas (que filtra ÓRDENES), esto agrega por
// PRODUCTO: cuánto se vendió de cada uno en el rango. Un producto de
// "Alimentos" filtrado aquí muestra su propia cantidad/total vendidos, no
// la orden completa que lo contiene (eso es lo que el filtro de categoría
// en el listado de ventas hacía mal).

const buildSoldProductsFilter = ({ branchId, startDate, endDate, categoryId, providerId, search }) => {
  let where = "WHERE o.status = 'completed' AND o.created_at BETWEEN ? AND ?";
  const params = [startDate, `${endDate} 23:59:59`];

  if (branchId) {
    where += ' AND o.branch_id = ?';
    params.push(branchId);
  }
  if (categoryId) {
    where += ' AND p.category_id = ?';
    params.push(categoryId);
  }
  if (providerId) {
    where += ' AND p.provider_id = ?';
    params.push(providerId);
  }
  if (search) {
    where += ' AND (p.name LIKE ? OR p.sku LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like);
  }

  return { where, params };
};

const getSoldProducts = async ({
  branchId, startDate, endDate, categoryId = null, providerId = null, search,
  page = 1, limit = 20,
}) => {
  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safePage = Math.max(parseInt(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const { where, params } = buildSoldProductsFilter({ branchId, startDate, endDate, categoryId, providerId, search });

  // Conteo de productos DISTINTOS que califican (para paginar la tabla
  // agrupada) — no es lo mismo que sumar renglones de order_details.
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM (
       SELECT p.product_id
       FROM order_details od
       JOIN orders o    ON o.order_id     = od.order_id
       JOIN products p  ON p.product_id   = od.product_id
       ${where}
       GROUP BY p.product_id
     ) t`,
    params
  );

  // total_sold = subtotal (unit_price * quantity) neto del descuento del
  // renglón — no es el total de la orden, es lo que ese producto aportó.
  const [rows] = await db.query(
    `SELECT p.product_id, p.name, p.sku, p.uom,
            c.category_id, c.name AS category_name, c.color AS category_color,
            pr.provider_id, pr.name AS provider_name,
            SUM(od.quantity) AS quantity_sold,
            SUM(od.subtotal - od.discount) AS total_sold
     FROM order_details od
     JOIN orders o          ON o.order_id     = od.order_id
     JOIN products p        ON p.product_id   = od.product_id
     LEFT JOIN categories c ON c.category_id  = p.category_id
     LEFT JOIN providers pr ON pr.provider_id = p.provider_id
     ${where}
     GROUP BY p.product_id
     ORDER BY quantity_sold DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  const data = rows.map(r => ({
    ...r,
    quantity_sold: Number(r.quantity_sold),
    total_sold: Number(r.total_sold),
  }));

  // Total de artículos vendidos y monto total — sobre TODO lo que
  // califica con los filtros (categoría/proveedor/búsqueda incluidos),
  // no solo la página actual. A diferencia de los totales por método de
  // pago (que se quitaron de esta pestaña), esto SÍ tiene sentido
  // descompuesto: es la suma de lo que aportó cada producto filtrado,
  // no un corte de caja.
  const [[{ total_items, total_amount }]] = await db.query(
    `SELECT COALESCE(SUM(od.quantity), 0) AS total_items,
            COALESCE(SUM(od.subtotal - od.discount), 0) AS total_amount
     FROM order_details od
     JOIN orders o   ON o.order_id   = od.order_id
     JOIN products p ON p.product_id = od.product_id
     ${where}`,
    params
  );

  return {
    data,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    },
    totals: { total_items: Number(total_items), total_amount: Number(total_amount) },
  };
};
module.exports = { createOrder, cancelOrder, getOrderById, getOrdersByBranchAndDateRange, getSoldProducts };