// tests/setup/integration.js
// Corre en cada archivo de integración: antes de sus tests deja la base en
// el estado de los seeds, y al final cierra el pool que abrió el backend.
const { resetDatabase } = require('../helpers/database');

beforeAll(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await require('../../src/config/db').end();
});
