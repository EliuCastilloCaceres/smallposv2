// tests/unit/helpers/cashMovements.test.js
// Tipos de movimiento que suman y restan al efectivo esperado (spec 12, T2, y
// spec 14, T3).
const {
  CASH_IN_TYPES, CASH_OUT_TYPES, MANUAL_MOVEMENT_TYPES, CASH_IN_SQL, CASH_OUT_SQL, sumCashMovements,
} = require('../../../src/helpers/cashMovements');

describe('cash movement types', () => {
  it('adds sales, payments, manual incomes and expense and purchase refunds', () => {
    expect(CASH_IN_TYPES).toEqual([
      'sale', 'income', 'credit_payment', 'layaway_payment', 'expense_refund', 'purchase_refund',
    ]);
    expect(CASH_IN_SQL).toBe(
      "'sale', 'income', 'credit_payment', 'layaway_payment', 'expense_refund', 'purchase_refund'"
    );
  });

  it('subtracts withdrawals, expenses, purchases, legacy expenses and returns', () => {
    expect(CASH_OUT_TYPES).toEqual(['withdrawal', 'expense', 'purchase', 'legacy_expense', 'return']);
    expect(CASH_OUT_SQL).toBe("'withdrawal', 'expense', 'purchase', 'legacy_expense', 'return'");
  });

  it('lets the POS register only incomes and withdrawals by hand', () => {
    expect(MANUAL_MOVEMENT_TYPES).toEqual(['income', 'withdrawal']);
  });
});

describe('sumCashMovements', () => {
  it('sums each movement in its direction', () => {
    const totals = sumCashMovements([
      { movement_type: 'sale',           amount: 100 },
      { movement_type: 'expense_refund', amount: '20.50' },
      { movement_type: 'withdrawal',     amount: 30 },
      { movement_type: 'expense',        amount: 20.5 },
      { movement_type: 'legacy_expense', amount: 5 },
      { movement_type: 'purchase',        amount: 40 },
      { movement_type: 'purchase_refund', amount: 15 },
    ]);

    expect(totals).toEqual({ total_in: 135.5, total_out: 95.5 });
  });

  it('ignores an unknown movement type', () => {
    expect(sumCashMovements([{ movement_type: 'other', amount: 10 }])).toEqual({ total_in: 0, total_out: 0 });
  });
});
