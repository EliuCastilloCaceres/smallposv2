// tests/integration/migrations/008-add-expense-categories.test.js
// Tabla de categorías de gasto con sus categorías iniciales (spec 12, T1).
// La base de cada archivo de integración ya viene migrada.
const db = require('../../../src/config/db');

describe('migration 008-add-expense-categories', () => {
  it('creates the 7 initial categories, active until the 015 deactivates the merchandise one', async () => {
    const [rows] = await db.query(
      'SELECT name, is_active FROM expense_categories ORDER BY expense_category_id'
    );

    expect(rows.map(r => r.name)).toEqual([
      'Renta', 'Servicios', 'Nómina', 'Insumos', 'Mantenimiento', 'Otros', 'Pago a proveedor (mercancía)',
    ]);
    // La 015 (spec 14) desactiva "Pago a proveedor (mercancía)": los pagos de
    // mercancía se registran como compras
    expect(rows.filter(r => r.is_active === 0).map(r => r.name)).toEqual(['Pago a proveedor (mercancía)']);
  });

  it('marks only "Pago a proveedor (mercancía)" as not counting in the net profit', async () => {
    const [rows] = await db.query(
      'SELECT name FROM expense_categories WHERE counts_in_net_profit = 0'
    );

    expect(rows.map(r => r.name)).toEqual(['Pago a proveedor (mercancía)']);
  });

  it('counts a new category in the net profit by default and rejects a repeated name', async () => {
    await db.query("INSERT INTO expense_categories (name) VALUES ('Publicidad')");
    const [[row]] = await db.query(
      "SELECT counts_in_net_profit, is_active FROM expense_categories WHERE name = 'Publicidad'"
    );

    expect(row).toEqual({ counts_in_net_profit: 1, is_active: 1 });
    await expect(db.query("INSERT INTO expense_categories (name) VALUES ('Renta')"))
      .rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });
});
