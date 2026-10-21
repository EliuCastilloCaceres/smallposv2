// tests/integration/migrations/003-add-reports-profit-permission.test.js
// Permiso reports.profit y eliminación de reports.advanced (spec 04, T1).
// Primero revisa la base que dejó resetDatabase, ya migrada; después parte de
// una base sin migrar, con un rol creado por el usuario, y la migra.
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

const findPermission = async (module, action) => {
  const [[permission]] = await db.query(
    'SELECT permission_id, description FROM permissions WHERE module = ? AND action = ?',
    [module, action]
  );
  return permission;
};

// Nombres de los roles que tienen el permiso, en orden alfabético
const rolesWith = async (module, action) => {
  const [rows] = await db.query(
    `SELECT r.name
       FROM role_permissions rp
       JOIN roles r       ON r.role_id = rp.role_id
       JOIN permissions p ON p.permission_id = rp.permission_id
      WHERE p.module = ? AND p.action = ?
      ORDER BY r.name`,
    [module, action]
  );
  return rows.map(r => r.name);
};

// Permisos del rol como 'modulo.accion'
const permissionsOf = async (roleId) => {
  const [rows] = await db.query(
    `SELECT CONCAT(p.module, '.', p.action) AS code
       FROM role_permissions rp
       JOIN permissions p ON p.permission_id = rp.permission_id
      WHERE rp.role_id = ?`,
    [roleId]
  );
  return rows.map(r => r.code);
};

describe('migration 003-add-reports-profit-permission', () => {
  describe('on a migrated database', () => {
    it('creates reports.profit with its description', async () => {
      const permission = await findPermission('reports', 'profit');

      expect(permission).toMatchObject({ description: 'Reporte de ventas y utilidad' });
    });

    it('grants reports.profit to superadmin, admin and supervisor, but not to cajero or almacenista', async () => {
      expect(await rolesWith('reports', 'profit')).toEqual(['admin', 'superadmin', 'supervisor']);
    });

    it('removes reports.advanced', async () => {
      expect(await findPermission('reports', 'advanced')).toBeUndefined();
    });
  });

  describe('on a database without the migration', () => {
    let advancedId;
    let customRoleId;

    beforeAll(async () => {
      await resetDatabase({ migrate: false });

      ({ permission_id: advancedId } = await findPermission('reports', 'advanced'));

      // Rol creado por el usuario, con reports.advanced y reports.basic
      const [result] = await db.query(
        "INSERT INTO roles (name, description) VALUES ('encargado', 'Rol creado por el usuario')"
      );
      customRoleId = result.insertId;
      await db.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT ?, permission_id FROM permissions
          WHERE module = 'reports' AND action IN ('basic', 'advanced')`,
        [customRoleId]
      );

      await migrate();
    });

    it('removes every assignment of reports.advanced', async () => {
      const [[{ total }]] = await db.query(
        'SELECT COUNT(*) AS total FROM role_permissions WHERE permission_id = ?',
        [advancedId]
      );

      expect(await findPermission('reports', 'advanced')).toBeUndefined();
      expect(total).toBe(0);
    });

    it('takes reports.advanced from a user-created role without granting reports.profit', async () => {
      expect(await permissionsOf(customRoleId)).toEqual(['reports.basic']);
    });

    it('takes reports.advanced from supervisor and grants reports.profit', async () => {
      const [[supervisor]] = await db.query("SELECT role_id FROM roles WHERE name = 'supervisor'");
      const permissions = await permissionsOf(supervisor.role_id);

      expect(permissions).toContain('reports.profit');
      expect(permissions).not.toContain('reports.advanced');
    });
  });
});
