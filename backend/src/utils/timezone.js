// src/utils/timezone.js
//
// created_at NO se guarda en UTC ni en la zona de México: se confirmó
// contra la BD real que guarda la hora LOCAL DEL SERVIDOR MySQL (vía
// NOW()), y ese servidor resultó estar en UTC-4 (verificado comparando
// NOW() vs UTC_TIMESTAMP() en producción). En vez de fijar ese offset
// como una constante adivinada -que además puede cambiar si el hosting
// reconfigura o migra el servidor- se calcula EN VIVO contra la propia
// base de datos en cada request: TIMESTAMPDIFF(SECOND, NOW(), UTC_TIMESTAMP())
// siempre da la diferencia real entre lo que created_at contiene y UTC
// verdadero, sea cual sea la zona del servidor, hoy o en el futuro.
//
// Extraído de dashboardService.js a un módulo compartido: orderService.js
// tenía su propio filtro de fechas que comparaba el rango directo contra
// created_at sin este ajuste, lo que causaba que una venta de las 10pm
// (hora México) del día anterior apareciera en "hoy" -el servidor la
// guarda 2h adelantada, ya en el día siguiente-. Cualquier service nuevo
// que filtre o agrupe por created_at debe usar este módulo, no reimplementar
// el cálculo, para que todos coincidan siempre en el mismo criterio.

const db = require('../config/db');

const MEXICO_UTC_OFFSET_SECONDS = -6 * 3600; // México continental, sin horario de verano

let cachedServerToUtcSeconds = null;
let cachedAt = 0;
const OFFSET_CACHE_MS = 5 * 60 * 1000; // 5 minutos — el offset del servidor no cambia en caliente

const getServerToUtcSeconds = async () => {
  const now = Date.now();
  if (cachedServerToUtcSeconds !== null && (now - cachedAt) < OFFSET_CACHE_MS) {
    return cachedServerToUtcSeconds;
  }
  const [[row]] = await db.query('SELECT TIMESTAMPDIFF(SECOND, NOW(), UTC_TIMESTAMP()) AS diff_seconds');
  cachedServerToUtcSeconds = row.diff_seconds;
  cachedAt = now;
  return cachedServerToUtcSeconds;
};

// Fragmento SQL reutilizable: created_at (hora del servidor) -> hora local
// de México. TIMESTAMPDIFF(...) se recalcula en cada query directamente en
// MySQL (no depende del valor cacheado en JS), así que siempre está fresco.
// `column` permite usarlo con distintos alias de tabla (o.created_at,
// oh.created_at, etc).
const createdAtMx = (column = 'o.created_at') =>
  `DATE_ADD(${column}, INTERVAL (TIMESTAMPDIFF(SECOND, NOW(), UTC_TIMESTAMP()) + (${MEXICO_UTC_OFFSET_SECONDS})) SECOND)`;

// Convierte UN límite de fecha/hora "de pared" en México a su equivalente
// en hora del servidor. Es el bloque base que usan tanto toServerRange
// (para BETWEEN de un día completo) como toServerDayStart/toServerDayEnd
// (para filtros que necesitan cada límite por separado, ej. reportService,
// donde dateFrom y dateTo no siempre se usan como par BETWEEN).
const toServerBoundary = async (localDateTimeStr) => {
  const serverToUtcSeconds = await getServerToUtcSeconds();
  const shiftSeconds = serverToUtcSeconds + MEXICO_UTC_OFFSET_SECONDS; // hora_mexico = created_at + shiftSeconds

  const [datePart, timePart] = localDateTimeStr.split(' ');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi, s] = timePart.split(':').map(Number);
  // Usamos Date.UTC solo como calculadora de números de reloj — no
  // representa un instante UTC real, es la hora "de pared" de México.
  const mexicoWallClock = Date.UTC(y, mo - 1, d, h, mi, s);
  const serverBoundary = new Date(mexicoWallClock - shiftSeconds * 1000);
  return serverBoundary.toISOString().slice(0, 19).replace('T', ' ');
};

// Convierte el rango de fechas "de pared" en México (lo que manda el
// frontend, ej. "2026-08-30" a "2026-08-30") al equivalente en hora-del-
// servidor, para poder seguir comparando created_at BETWEEN ? AND ? directo
// contra la columna cruda (sin envolverla en una función) y así conservar
// el uso del índice.
const toServerRange = async (startDate, endDate) => {
  return [
    await toServerBoundary(`${startDate} 00:00:00`),
    await toServerBoundary(`${endDate} 23:59:59`),
  ];
};

// Variantes de un solo límite — para filtros donde el inicio y el fin del
// rango de México no siempre viajan juntos como un BETWEEN (ej.
// reportService.getCashSessions, donde dateFrom se usa contra dos columnas
// distintas y dateTo contra una sola, cada uno de forma independiente).
const toServerDayStart = (dateStr) => toServerBoundary(`${dateStr} 00:00:00`);
const toServerDayEnd   = (dateStr) => toServerBoundary(`${dateStr} 23:59:59`);

// Fecha de "hoy" en México, calculada a partir del reloj real (Date.now(),
// que si corre en el propio servidor Node debería estar sincronizado a UTC
// real vía NTP — a diferencia del reloj de MySQL, que se confirmó
// desincronizado). NO usar new Date().toISOString().slice(0,10) para esto:
// toISOString() da la fecha en UTC, y cerca de medianoche en México
// (UTC-6) eso puede devolver el día siguiente en vez de "hoy".
const todayInMexico = () => {
  const mxNow = new Date(Date.now() + MEXICO_UTC_OFFSET_SECONDS * 1000);
  return mxNow.toISOString().slice(0, 10);
};

module.exports = {
  getServerToUtcSeconds,
  createdAtMx,
  toServerRange,
  toServerDayStart,
  toServerDayEnd,
  todayInMexico,
  MEXICO_UTC_OFFSET_SECONDS,
};