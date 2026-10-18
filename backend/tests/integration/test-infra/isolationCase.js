// tests/integration/test-infra/isolationCase.js
// Caso compartido por isolation-a e isolation-b: cada archivo comprueba que
// no ve el registro que creó el otro y luego lo crea. Si el reinicio entre
// archivos fallara, el que corra segundo fallaría sin importar el orden.
const db = require('../../../src/config/db');

const MARKER = 'isolation-marker';

const countMarkers = async () => {
  const [[row]] = await db.query('SELECT COUNT(*) AS n FROM categories WHERE name = ?', [MARKER]);
  return row.n;
};

module.exports = (fileLabel) => {
  describe(`database isolation (${fileLabel})`, () => {
    it('starts without records created by other test files', async () => {
      expect(await countMarkers()).toBe(0);
    });

    it('sees the record it creates', async () => {
      await db.query('INSERT INTO categories (name) VALUES (?)', [MARKER]);
      expect(await countMarkers()).toBe(1);
    });
  });
};
