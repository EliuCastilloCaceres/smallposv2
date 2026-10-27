// tests/unit/helpers/cashMovements.test.js
// Tipos de movimiento que suman y restan al efectivo esperado (spec 12, T2).
const {
  CASH_IN_TYPES, CASH_OUT_TYPES, MANUAL_MOVEMENT_TYPES, CASH_IN_SQL, CASH_OUT_SQL, sumCashMovements,
} = require('../../../src/helpers/cashMovements');

describe('cash movement types', () => {
  it('adds sales, payments, manual incomes and expense refunds', () => {
    expect(CASH_IN_TYPES).toEqual(['sale', 'income', 'credit_payment', 'layaway_payment', 'expense_refund']);
    expect(CASH_IN_SQL).toBe("'sale', 'income', 'credit_payment', 'layaway_payment', 'expense_refund'");
  });

  it('subtracts withdrawals, expenses, legacy expenses and returns', () => {
    expect(CASH_OUT_TYPES).toEqual(['withdrawal', 'expense', 'legacy_expense', 'return']);
    expect(CASH_OUT_SQL).toBe("'withdrawal', 'expense', 'legacy_expense', 'return'");
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
    ]);

    expect(totals).toEqual({ total_in: 120.5, total_out: 55.5 });
  });

  it('ignores an unknown movement type', () => {
    expect(sumCashMovements([{ movement_type: 'other', amount: 10 }])).toEqual({ total_in: 0, total_out: 0 });
  });
});
