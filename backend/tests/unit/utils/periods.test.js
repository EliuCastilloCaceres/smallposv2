// tests/unit/utils/periods.test.js
// Periodos de la Tendencia de ventas (spec 05, T2).
const {
  isValidDate, rangeDays, autoGranularity, fitsGranularity,
  buildPeriods, previousYearDate, previousYearRange,
} = require('../../../src/utils/periods');

describe('isValidDate', () => {
  it('accepts real dates and rejects impossible or malformed ones', () => {
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2027-02-29')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2026-3-1')).toBe(false);
    expect(isValidDate(undefined)).toBe(false);
  });
});

describe('granularity', () => {
  it('picks day up to 31 days, week up to 183 and month above', () => {
    expect(autoGranularity(31)).toBe('day');
    expect(autoGranularity(32)).toBe('week');
    expect(autoGranularity(183)).toBe('week');
    expect(autoGranularity(184)).toBe('month');
  });

  it('limits day to 92 days, week to 731 and month to 1827', () => {
    expect([fitsGranularity('day', 92), fitsGranularity('day', 93)]).toEqual([true, false]);
    expect([fitsGranularity('week', 731), fitsGranularity('week', 732)]).toEqual([true, false]);
    expect([fitsGranularity('month', 1827), fitsGranularity('month', 1828)]).toEqual([true, false]);
  });

  it('counts both ends of the range', () => {
    expect(rangeDays('2026-03-01', '2026-03-31')).toBe(31);
    expect(rangeDays('2026-03-12', '2026-03-12')).toBe(1);
  });
});

describe('buildPeriods', () => {
  it('builds Monday to Sunday weeks and marks the cut ones at both ends as partial', () => {
    // 1 ago 2026 es sábado y 31 oct 2026 también
    const weeks = buildPeriods('2026-08-01', '2026-10-31', 'week', '2026-10-21');

    expect(weeks[0]).toEqual({
      start: '2026-07-27', end: '2026-08-02', from: '2026-08-01', to: '2026-08-02',
      partial: true, current: false, future: false,
    });
    expect(weeks[1]).toMatchObject({ start: '2026-08-03', end: '2026-08-09', partial: false });
    expect(weeks.at(-1)).toMatchObject({
      start: '2026-10-26', end: '2026-11-01', from: '2026-10-26', to: '2026-10-31', partial: true,
    });
    expect(weeks).toHaveLength(14);
  });

  it('marks the period that contains today as current and the later ones as future', () => {
    const days = buildPeriods('2026-03-10', '2026-03-14', 'day', '2026-03-12');

    expect(days.map(d => [d.start, d.current, d.future])).toEqual([
      ['2026-03-10', false, false],
      ['2026-03-11', false, false],
      ['2026-03-12', true,  false],
      ['2026-03-13', false, true],
      ['2026-03-14', false, true],
    ]);
  });

  it('builds calendar months, including a leap February', () => {
    const months = buildPeriods('2028-01-15', '2028-03-31', 'month', '2028-02-29');

    expect(months.map(m => [m.start, m.end, m.from, m.partial, m.current])).toEqual([
      ['2028-01-01', '2028-01-31', '2028-01-15', true,  false],
      ['2028-02-01', '2028-02-29', '2028-02-01', false, true],
      ['2028-03-01', '2028-03-31', '2028-03-01', false, false],
    ]);
  });
});

describe('previous year', () => {
  it('goes back 364 days by day and by week, so a Thursday meets a Thursday', () => {
    expect(previousYearDate('2026-03-05', 'day')).toBe('2025-03-06');
    expect(new Date('2025-03-06T12:00:00Z').getUTCDay()).toBe(4);
    expect(previousYearRange('2026-03-02', '2026-03-29', 'week')).toEqual({ start: '2025-03-03', end: '2025-03-30' });
  });

  it('goes back one calendar year by month, with February 29 as 28', () => {
    expect(previousYearDate('2026-03-12', 'month')).toBe('2025-03-12');
    expect(previousYearDate('2028-02-29', 'month')).toBe('2027-02-28');
  });

  it('keeps a range that ends on a month end ending on a month end', () => {
    expect(previousYearRange('2028-02-01', '2028-02-29', 'month')).toEqual({ start: '2027-02-01', end: '2027-02-28' });
    expect(previousYearRange('2029-02-01', '2029-02-28', 'month')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(previousYearRange('2025-04-01', '2026-03-15', 'month')).toEqual({ start: '2024-04-01', end: '2025-03-15' });
  });
});
