// src/helpers/cashMovements.js
//
// Única fuente de los tipos de movimiento de caja (cash_movements.movement_type)
// que suman o restan al efectivo esperado de una sesión (spec 12,
// requisitos 15 y 16). Antes estas listas estaban escritas a mano en cinco
// lugares (cierre y estado de la sesión en cashRegisterService, las dos
// consultas de Sesiones de caja en reportService y las cajas abiertas del
// Dashboard); un tipo nuevo se podía olvidar en alguno. Cualquier cálculo del
// efectivo esperado importa de aquí.
//
//   Suman:  sale, income, credit_payment, layaway_payment,
//           expense_refund (reingreso de un gasto cancelado),
//           purchase_refund (reingreso de una compra cancelada, spec 14)
//   Restan: withdrawal (retiro manual o del corte),
//           expense (gasto pagado desde caja, ligado a su gasto),
//           purchase (compra pagada desde caja, ligada a su compra, spec 14),
//           legacy_expense (salida de caja anterior a la spec 12),
//           return

const CASH_IN_TYPES  = ['sale', 'income', 'credit_payment', 'layaway_payment', 'expense_refund', 'purchase_refund'];
const CASH_OUT_TYPES = ['withdrawal', 'expense', 'purchase', 'legacy_expense', 'return'];

// Movimientos que el POS registra a mano (POST /cash-registers/:id/movements).
// Los gastos y las compras no: se registran en sus módulos (POST /expenses y
// POST /purchases).
const MANUAL_MOVEMENT_TYPES = ['income', 'withdrawal'];

// Listas para un IN (...) de SQL. Son constantes de este archivo, no datos
// del usuario, así que se pueden interpolar.
const toSqlList = (types) => types.map(t => `'${t}'`).join(', ');
const CASH_IN_SQL  = toSqlList(CASH_IN_TYPES);
const CASH_OUT_SQL = toSqlList(CASH_OUT_TYPES);

// { total_in, total_out } de una lista de movimientos ya leídos
const sumCashMovements = (movements) => movements.reduce((acc, m) => {
  if (CASH_IN_TYPES.includes(m.movement_type))  acc.total_in  += Number(m.amount);
  if (CASH_OUT_TYPES.includes(m.movement_type)) acc.total_out += Number(m.amount);
  return acc;
}, { total_in: 0, total_out: 0 });

module.exports = {
  CASH_IN_TYPES,
  CASH_OUT_TYPES,
  MANUAL_MOVEMENT_TYPES,
  CASH_IN_SQL,
  CASH_OUT_SQL,
  sumCashMovements,
};
