// tests/integration/migrations/001-add-date-indexes.test.js
// Índices de fecha (spec 03, T2). resetDatabase ya aplicó las migraciones.
const db = require('../../../src/config/db');

const TABLES = ['orders', 'inventory_movements', 'returns'];

// { tabla: { índice: [columnas en orden] } }
const indexesOf = async () => {
  const [rows] = await db.query(
    `SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName, COLUMN_NAME AS columnName
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)
     ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
    [TABLES]
  );
  const result = {};
  for (const { tableName, indexName, columnName } of rows) {
    ((result[tableName] ??= {})[indexName] ??= []).push(columnName);
  }
  return result;
};

describe('migration 001-add-date-indexes', () => {
  it('adds the date indexes with their columns in order', async () => {
    const indexes = await indexesOf();

    expect(indexes.orders).toMatchObject({
      idx_orders_created:          ['created_at'],
      idx_orders_branch_created:   ['branch_id', 'created_at'],
      idx_orders_register_created: ['cash_register_id', 'created_at'],
    });
    expect(indexes.inventory_movements).toMatchObject({
      idx_invmov_branch_created:         ['branch_id', 'created_at'],
      idx_invmov_branch_product_created: ['branch_id', 'product_id', 'created_at'],
    });
    expect(indexes.returns).toMatchObject({
      idx_returns_created:        ['created_at'],
      idx_returns_branch_created: ['branch_id', 'created_at'],
    });
  });

  it('keeps every index the tables already had', async () => {
    const indexes = await indexesOf();

    expect(Object.keys(indexes.orders)).toEqual(expect.arrayContaining([
      'PRIMARY', 'fk_order_branch', 'fk_order_register', 'fk_order_customer', 'fk_order_user', 'fk_order_layaway',
    ]));
    expect(Object.keys(indexes.inventory_movements)).toEqual(expect.arrayContaining([
      'PRIMARY', 'fk_invmov_branch', 'fk_invmov_product', 'fk_invmov_variant', 'fk_invmov_user',
    ]));
    expect(Object.keys(indexes.returns)).toEqual(expect.arrayContaining([
      'PRIMARY', 'fk_ret_order', 'fk_ret_branch', 'fk_ret_customer', 'fk_ret_user', 'fk_ret_method',
    ]));
  });
});
