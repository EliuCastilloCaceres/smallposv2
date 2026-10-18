// tests/setup/globalSetup.js
// Corre una vez antes de los tests de integración: aplica el candado y
// comprueba que la base de pruebas responde, para fallar con un mensaje
// claro en vez de un ECONNREFUSED en cada archivo.
const mysql = require('mysql2/promise');
const { TEST_DB, assertTestDatabase } = require('../helpers/database');

module.exports = async () => {
  assertTestDatabase(TEST_DB.database);

  try {
    const conn = await mysql.createConnection(TEST_DB);
    await conn.end();
  } catch (err) {
    throw new Error(
      `No se pudo conectar a la base de pruebas ${TEST_DB.host}:${TEST_DB.port}/${TEST_DB.database} ` +
      `(${err.message}). Levántala con: docker compose --profile test up -d --wait mysql_test`
    );
  }
};
