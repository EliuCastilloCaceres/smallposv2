// tests/helpers/database.js
// Configuración y utilidades de la base de pruebas (mysql_test en
// docker-compose.yml). Las credenciales son las del contenedor de pruebas,
// no secretos reales. Host, puerto y nombre se pueden cambiar con
// TEST_DB_HOST, TEST_DB_PORT y TEST_DB_NAME (p. ej. para correr los tests
// dentro del contenedor del backend, donde el host es "mysql_test").
const fs    = require('fs');
const path  = require('path');
const mysql = require('mysql2/promise');
const { runMigrations } = require('../../src/utils/migrations');

const TEST_DB = {
  host:     process.env.TEST_DB_HOST ?? '127.0.0.1',
  port:     Number(process.env.TEST_DB_PORT ?? 3308),
  database: process.env.TEST_DB_NAME ?? 'smallposv2_test',
  user:     'pos_user',
  password: 'pos_password',
};

// Candado: nada de esto corre contra una base cuyo nombre no termine en
// _test, para no borrar por error la de desarrollo o la de producción.
const assertTestDatabase = (name) => {
  if (typeof name !== 'string' || !name.endsWith('_test')) {
    throw new Error(
      `Los tests se niegan a correr: la base "${name}" no termina en "_test". ` +
      'Revisa TEST_DB_NAME o tests/helpers/database.js.'
    );
  }
};

const SQL_INIT_DIR = path.join(__dirname, '../../sql-init');
let initSql = null;

const readInitSql = () => {
  if (!initSql) {
    initSql = ['01-schema.sql', '02-seeds.sql']
      .map(file => fs.readFileSync(path.join(SQL_INIT_DIR, file), 'utf8'));
  }
  return initSql;
};

// Deja la base exactamente como una instalación nueva: borra todas las
// tablas, vuelve a correr el esquema y los seeds de sql-init y aplica las
// migraciones de backend/migrations, igual que el backend al arrancar. No
// basta con TRUNCATE: el esquema trae valores de AUTO_INCREMENT propios (p. ej.
// permissions empieza en 79) y los seeds dependen de ellos.
const resetDatabase = async () => {
  assertTestDatabase(TEST_DB.database);
  const [schemaSql, seedsSql] = readInitSql();

  const conn = await mysql.createConnection({ ...TEST_DB, multipleStatements: true });
  try {
    const [tables] = await conn.query(
      'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
    );
    if (tables.length) {
      const list = tables.map(t => conn.escapeId(t.name)).join(', ');
      await conn.query(`SET FOREIGN_KEY_CHECKS = 0; DROP TABLE IF EXISTS ${list}; SET FOREIGN_KEY_CHECKS = 1;`);
    }
    await conn.query(schemaSql);
    await conn.query(seedsSql);
    await runMigrations(conn);
  } finally {
    await conn.end();
  }
};

module.exports = {
  TEST_DB,
  assertTestDatabase,
  resetDatabase,
};
