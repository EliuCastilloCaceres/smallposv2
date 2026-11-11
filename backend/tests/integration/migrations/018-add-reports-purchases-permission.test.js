// tests/integration/migrations/018-add-reports-purchases-permission.test.js
// Permiso reports.purchases (spec 16, T1). Parte de una base sin migrar, con
// un rol creado por el usuario, y la migra.
const mysql = require('mysql2/promise');
const db    = require('../../../src/config/db');
const { TEST_DB, resetDatabase } = require('../../helpers/database');
const { runMigrations }          = require('../../../src/utils/migrations');

const migrate = async () => {
  const conn = await mysql.createConnection({ ...TEST_DB, multipleStatements: true });
  try {
    await runMigrations(conn);
  } finally {
    await conn.end();
  }
};

// Nombres de los roles que tienen reports.purchases, en orden alfabético
const rolesWithPurchases = async () => {
  const [rows] = await db.query(
    `SELECT r.name
       FROM role_permissions rp
       JOIN roles r       ON r.role_id = rp.role_id
       JOIN permissions p ON p.permission_id = rp.permission_id
      WHERE p.module = 'reports' AND p.action = 'purchases'
      ORDER BY r.name`
  );
  return rows.map(r => r.name);
};

beforeAll(async () => {
  await resetDatabase({ migrate: false });
  // Rol creado por el usuario antes de la migración
  await db.query("INSERT INTO roles (name, description) VALUES ('encargado', 'Rol creado por el usuario')");
  await migrate();
});

describe('migration 018-add-reports-purchases-permission', () => {
  it('creates reports.purchases with its description', async () => {
    const [[permission]] = await db.query(
      "SELECT description FROM permissions WHERE module = 'reports' AND action = 'purchases'"
    );

    expect(permission).toEqual({ description: 'Reporte de compras' });
  });

  it('grants reports.purchases to superadmin, admin and supervisor only', async () => {
    // Ni cajero, ni almacenista, ni el rol "encargado" creado por el usuario
    expect(await rolesWithPurchases()).toEqual(['admin', 'superadmin', 'supervisor']);
  });
});
