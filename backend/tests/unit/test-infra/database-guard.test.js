// tests/unit/test-infra/database-guard.test.js
const { assertTestDatabase } = require('../../helpers/database');

describe('assertTestDatabase', () => {
  it('accepts a database whose name ends in _test', () => {
    expect(() => assertTestDatabase('smallposv2_test')).not.toThrow();
  });

  it.each([
    'smallposv2_prueba1',
    'smallposv2',
    'test_smallposv2',
    'smallposv2_test_backup',
    '',
    undefined,
  ])('rejects %p', (name) => {
    expect(() => assertTestDatabase(name)).toThrow(/se niegan a correr/);
  });

  it('names the rejected database in the message', () => {
    expect(() => assertTestDatabase('smallposv2_prueba1')).toThrow('"smallposv2_prueba1"');
  });
});
