// src/utils/periods.js
// Periodos del reporte de Tendencia de ventas (specs/05-tendencia-de-ventas.md):
// días de México, semanas de lunes a domingo y meses calendario, con sus
// límites, sus marcas (parcial, en curso, futuro) y la alineación con el año
// anterior.
//
// Todo trabaja con fechas 'YYYY-MM-DD' "de pared" en México. Por dentro se
// cuentan días desde 1970-01-01 con Date.UTC, solo como calculadora: así no
// influye la zona horaria del servidor ni el horario de verano.

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const GRANULARITIES = ['day', 'week', 'month'];

// Días máximos del rango por granularidad; el de mes es el rango máximo
const GRANULARITY_LIMITS = { day: 92, week: 731, month: 1827 };
const MAX_RANGE_DAYS = GRANULARITY_LIMITS.month;

// Días que se retroceden para comparar por día o por semana: 52 semanas
// exactas, así un jueves cae contra un jueves
const PREVIOUS_YEAR_DAYS = 364;

const pad = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' → número de día, o null si no es una fecha real
const toDayNumber = (dateStr) => {
  const match = DATE_RE.exec(dateStr ?? '');
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const date = new Date(ms);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return ms / DAY_MS;
};

const fromDayNumber = (n) => {
  const date = new Date(n * DAY_MS);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

const isValidDate = (dateStr) => toDayNumber(dateStr) !== null;

const addDays = (dateStr, days) => fromDayNumber(toDayNumber(dateStr) + days);

// Días del rango, contando los dos extremos
const rangeDays = (startDate, endDate) => toDayNumber(endDate) - toDayNumber(startDate) + 1;

// Hasta 31 días → día; hasta 183 → semana; más → mes (decisión #19)
const autoGranularity = (days) => (days <= 31 ? 'day' : days <= 183 ? 'week' : 'month');

const fitsGranularity = (granularity, days) => days <= GRANULARITY_LIMITS[granularity];

// Primer día del periodo que contiene la fecha
const periodStart = (dateStr, granularity) => {
  if (granularity === 'day') return dateStr;
  if (granularity === 'week') {
    const n = toDayNumber(dateStr);
    const weekday = new Date(n * DAY_MS).getUTCDay(); // 0 = domingo
    return fromDayNumber(n - ((weekday + 6) % 7));
  }
  return `${dateStr.slice(0, 7)}-01`;
};

// Último día del periodo que empieza en startDate
const periodEnd = (startDate, granularity) => {
  if (granularity === 'day') return startDate;
  if (granularity === 'week') return addDays(startDate, 6);
  const [y, m] = startDate.split('-').map(Number);
  return fromDayNumber(Date.UTC(y, m, 1) / DAY_MS - 1);
};

// Periodos del rango, en orden. start/end son los límites completos del
// periodo; from/to, la parte que cae dentro del rango. Un periodo es parcial
// si el rango lo corta, futuro si empieza después de hoy y en curso si
// contiene hoy.
const buildPeriods = (startDate, endDate, granularity, today) => {
  const periods = [];
  let start = periodStart(startDate, granularity);
  while (start <= endDate) {
    const end  = periodEnd(start, granularity);
    const from = start < startDate ? startDate : start;
    const to   = end > endDate ? endDate : end;
    periods.push({
      start, end, from, to,
      partial: from !== start || to !== end,
      current: from <= today && today <= to,
      future:  from > today,
    });
    start = addDays(end, 1);
  }
  return periods;
};

// La misma fecha un año antes; el 29 de febrero pasa al 28
const sameDayPreviousYear = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = m === 2 && d === 29 ? 28 : d;
  return `${y - 1}-${pad(m)}-${pad(day)}`;
};

// Fecha equivalente del año anterior: 364 días antes por día o por semana,
// o la misma fecha un año antes por mes (requisitos 17 y 26)
const previousYearDate = (dateStr, granularity) =>
  granularity === 'month' ? sameDayPreviousYear(dateStr) : addDays(dateStr, -PREVIOUS_YEAR_DAYS);

// Rango del año anterior, con el mismo número de periodos. Por mes, un rango
// que termina en fin de mes termina también en fin de mes un año antes (un
// febrero completo de 29 días se compara con el febrero completo de 28).
const previousYearRange = (startDate, endDate, granularity) => {
  const start = previousYearDate(startDate, granularity);
  if (granularity !== 'month') return { start, end: previousYearDate(endDate, granularity) };

  const endsMonth = periodEnd(periodStart(endDate, 'month'), 'month') === endDate;
  const end = endsMonth
    ? periodEnd(periodStart(sameDayPreviousYear(endDate), 'month'), 'month')
    : sameDayPreviousYear(endDate);
  return { start, end };
};

module.exports = {
  GRANULARITIES,
  GRANULARITY_LIMITS,
  MAX_RANGE_DAYS,
  isValidDate,
  addDays,
  rangeDays,
  autoGranularity,
  fitsGranularity,
  periodStart,
  periodEnd,
  buildPeriods,
  previousYearDate,
  previousYearRange,
};
