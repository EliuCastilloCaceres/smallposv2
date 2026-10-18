// tests/setup/dotenvStub.js
// Sustituye a dotenv durante los tests (ver moduleNameMapper en
// jest.config.js): la configuración la pone tests/setup/env.js.
module.exports = {
  config: () => ({ parsed: {} }),
};
