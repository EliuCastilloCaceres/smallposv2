// tests/setup/env.js
// Corre antes de cada archivo de tests. Fija las variables que lee el
// backend para que apunten a la base de pruebas; backend/.env no se lee
// porque jest.config.js reemplaza dotenv por tests/setup/dotenvStub.js.
const { TEST_DB, assertTestDatabase } = require('../helpers/database');

assertTestDatabase(TEST_DB.database);

process.env.NODE_ENV    = 'test';
process.env.DB_HOST     = TEST_DB.host;
process.env.DB_PORT     = String(TEST_DB.port);
process.env.DB_NAME     = TEST_DB.database;
process.env.DB_USER     = TEST_DB.user;
process.env.DB_PASSWORD = TEST_DB.password;
process.env.JWT_SECRET  = 'test-jwt-secret';
delete process.env.CORS_ORIGIN;
