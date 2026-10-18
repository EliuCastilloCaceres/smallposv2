// tests/helpers/users.js
// Crea usuarios de prueba directo en la BD, sin pasar por el módulo de
// usuarios, para que los tests de permisos no dependan de sus reglas.
const bcrypt = require('bcrypt');
const db     = require('../../src/config/db');

// Costo mínimo de bcrypt: los tests no necesitan un hash lento.
const TEST_SALT_ROUNDS = 4;

let sequence = 0;

// role: nombre del rol (superadmin, admin, supervisor, cajero, almacenista
// o uno creado en el test). Devuelve las credenciales para loginAs.
const createTestUser = async ({
  role     = 'cajero',
  branchId = 1,
  username = `test_${role}_${++sequence}`,
  password = 'Test123!',
} = {}) => {
  const [[roleRow]] = await db.query('SELECT role_id FROM roles WHERE name = ?', [role]);
  if (!roleRow) throw new Error(`createTestUser: no existe el rol "${role}"`);

  const passwordHash = await bcrypt.hash(password, TEST_SALT_ROUNDS);
  const [result] = await db.query(
    `INSERT INTO users (first_name, last_name, username, password_hash, role_id, branch_id, is_active)
     VALUES ('Test', ?, ?, ?, ?, ?, 1)`,
    [role, username, passwordHash, roleRow.role_id, branchId]
  );

  return { userId: result.insertId, username, password, roleId: roleRow.role_id, branchId };
};

module.exports = {
  createTestUser,
};
