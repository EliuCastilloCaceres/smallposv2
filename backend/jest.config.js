// jest.config.js
// Los tests viven en tests/ (unit/ e integration/, ver docs/tests.md).
// Limitar roots evita que Jest recorra public/ y el resto del proyecto.

module.exports = {
  testEnvironment: 'node',
  roots:           ['<rootDir>/tests'],
  testMatch:       ['**/*.test.js'],
};
