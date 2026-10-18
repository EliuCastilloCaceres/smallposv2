// tests/unit/utils/timezone.test.js
// todayInMexico no consulta la BD, pero timezone.js importa db.js al
// cargarse; se reemplaza por un objeto vacío para no abrir un pool real.
jest.mock('../../../src/config/db', () => ({}));

const { todayInMexico } = require('../../../src/utils/timezone');

describe('todayInMexico', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const at = (isoUtc) => jest.useFakeTimers({ now: new Date(isoUtc) });

  it('returns the Mexico day, not the UTC day, shortly after UTC midnight', () => {
    at('2026-03-15T00:30:00Z'); // 2026-03-14 18:30 en México
    expect(todayInMexico()).toBe('2026-03-14');
  });

  it('keeps the previous Mexico day until 06:00 UTC', () => {
    at('2026-03-15T05:59:59Z'); // 2026-03-14 23:59:59 en México
    expect(todayInMexico()).toBe('2026-03-14');
  });

  it('switches to the next Mexico day at 06:00 UTC', () => {
    at('2026-03-15T06:00:00Z'); // 2026-03-15 00:00:00 en México
    expect(todayInMexico()).toBe('2026-03-15');
  });

  it('handles the year change in Mexico time', () => {
    at('2027-01-01T02:00:00Z'); // 2026-12-31 20:00 en México
    expect(todayInMexico()).toBe('2026-12-31');
  });
});
