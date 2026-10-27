// tests/integration/migrations/011-add-expenses-permissions.test.js
// Permisos del módulo de gastos (spec 12, T3). Parte de una base sin migrar,
// con un rol creado por el usuario, y la migra.
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

// Nombres de los roles que tienen expenses.<action>, en orden alfabético
const rolesWith = async (action) => {
  const [rows] = await db.query(
    `SELECT r.name
       FROM role_permissions rp
       JOIN roles r       ON r.role_id = rp.role_id
       JOIN permissions p ON p.permission_id = rp.permission_id
      WHERE p.module = 'expenses' AND p.action = ?
      ORDER BY r.name`,
    [action]
  );
  return rows.map(r => r.name);
};

beforeAll(async () => {
  await resetDatabase({ migrate: false });
  // Rol creado por el usuario antes de la migración
  await db.query("INSERT INTO roles (name, description) VALUES ('encargado', 'Rol creado por el usuario')");
  await migrate();
});

describe('migration 011-add-expenses-permissions', () => {
  it('creates the 4 expenses permissions with their descriptions', async () => {
    const [rows] = await db.query(
      "SELECT action, description FROM permissions WHERE module = 'expenses' ORDER BY permission_id"
    );

    expect(rows).toEqual([
      { action: 'read',       description: 'Ver gastos' },
      { action: 'create',     description: 'Registrar gastos' },
      { action: 'cancel',     description: 'Cancelar gastos' },
      { action: 'categories', description: 'Administrar las categorías de gasto' },
    ]);
  });

  it('grants each permission to the roles of the table and to no role created by the user', async () => {
    expect(await rolesWith('read')).toEqual(['admin', 'superadmin', 'supervisor']);
    expect(await rolesWith('create')).toEqual(['admin', 'cajero', 'superadmin', 'supervisor']);
    expect(await rolesWith('cancel')).toEqual(['admin', 'superadmin', 'supervisor']);
    expect(await rolesWith('categories')).toEqual(['admin', 'superadmin']);
  });
});
