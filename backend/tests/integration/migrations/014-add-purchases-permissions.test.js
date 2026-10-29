// tests/integration/migrations/014-add-purchases-permissions.test.js
// Permisos del módulo de compras (spec 14, T2). Parte de una base sin migrar,
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

// Nombres de los roles que tienen purchases.<action>, en orden alfabético
const rolesWith = async (action) => {
  const [rows] = await db.query(
    `SELECT r.name
       FROM role_permissions rp
       JOIN roles r       ON r.role_id = rp.role_id
       JOIN permissions p ON p.permission_id = rp.permission_id
      WHERE p.module = 'purchases' AND p.action = ?
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

describe('migration 014-add-purchases-permissions', () => {
  it('creates the 3 purchases permissions with their descriptions', async () => {
    const [rows] = await db.query(
      "SELECT action, description FROM permissions WHERE module = 'purchases' ORDER BY permission_id"
    );

    expect(rows).toEqual([
      { action: 'read',   description: 'Ver compras' },
      { action: 'create', description: 'Registrar compras' },
      { action: 'cancel', description: 'Cancelar compras' },
    ]);
  });

  it('grants each permission to the roles of the table and to no role created by the user', async () => {
    expect(await rolesWith('read')).toEqual(['admin', 'almacenista', 'superadmin', 'supervisor']);
    expect(await rolesWith('create')).toEqual(['admin', 'almacenista', 'cajero', 'superadmin', 'supervisor']);
    expect(await rolesWith('cancel')).toEqual(['admin', 'superadmin', 'supervisor']);
  });
});
