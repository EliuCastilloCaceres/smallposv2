// tests/integration/migrations/004-add-reports-trend-permission.test.js
// Permiso reports.trend (spec 05, T1). Parte de una base sin migrar, con un
// rol creado por el usuario, y la migra.
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

// Nombres de los roles que tienen reports.trend, en orden alfabético
const rolesWithTrend = async () => {
  const [rows] = await db.query(
    `SELECT r.name
       FROM role_permissions rp
       JOIN roles r       ON r.role_id = rp.role_id
       JOIN permissions p ON p.permission_id = rp.permission_id
      WHERE p.module = 'reports' AND p.action = 'trend'
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

describe('migration 004-add-reports-trend-permission', () => {
  it('creates reports.trend with its description', async () => {
    const [[permission]] = await db.query(
      "SELECT description FROM permissions WHERE module = 'reports' AND action = 'trend'"
    );

    expect(permission).toEqual({ description: 'Reporte de tendencia de ventas' });
  });

  it('grants reports.trend to superadmin, admin and supervisor only', async () => {
    // Ni cajero, ni almacenista, ni el rol "encargado" creado por el usuario
    expect(await rolesWithTrend()).toEqual(['admin', 'superadmin', 'supervisor']);
  });
});
