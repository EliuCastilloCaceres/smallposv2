// jest.config.js
// Dos proyectos (ver docs/tests.md):
// - unit: no usa la BD.
// - integration: usa la base de pruebas (mysql_test), que se reinicia al
//   estado de los seeds antes de cada archivo.

const shared = {
  testEnvironment: 'node',
  testMatch:       ['**/*.test.js'],
  setupFiles:      ['<rootDir>/tests/setup/env.js'],
  // Los tests no leen backend/.env: dotenv se reemplaza por un stub.
  moduleNameMapper: { '^dotenv$': '<rootDir>/tests/setup/dotenvStub.js' },
};

module.exports = {
  // En serie: todos los archivos de integración comparten la misma base.
  maxWorkers: 1,
  projects: [
    {
      ...shared,
      displayName: 'unit',
      roots:       ['<rootDir>/tests/unit'],
    },
    {
      ...shared,
      displayName:        'integration',
      roots:              ['<rootDir>/tests/integration'],
      globalSetup:        '<rootDir>/tests/setup/globalSetup.js',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/integration.js'],
    },
  ],
};
