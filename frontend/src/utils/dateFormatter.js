// src/utils/dateFormatter.js

const APP_TIMEZONE = import.meta.env?.VITE_TIMEZONE || 'America/Mexico_City';

/**
 * Formatea una fecha respetando la zona horaria de la aplicación.
 * @param {string|Date|number} d - La fecha a formatear.
 * @param {string} [fallback='-'] - Valor a mostrar si la fecha es nula o inválida.
 */
export const fmtDateTime = (d, fallback = '-') => {
  // 1. Manejo de nulos, undefined, cadenas vacías o 0
  if (!d) return fallback;

  const date = new Date(d);

  // 2. Validación de fechas no válidas (ej. "texto-aleatorio", {}, etc.)
  if (isNaN(date.getTime())) {
    console.warn(`[fmtDateTime] Se recibió un valor de fecha inválido:`, d);
    return fallback;
  }

  // 3. Formateo seguro
  return date.toLocaleString('es-MX', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Formatea una fecha mostrando Día, Mes y Año respetando la zona horaria.
 * @param {string|Date|number} d - La fecha a formatear.
 * @param {string} [fallback='—'] - Valor a mostrar si la fecha es nula o inválida.
 */
export const fmtDate = (d, fallback = '—') => {
  if (!d) return fallback;

  const date = new Date(d);

  if (isNaN(date.getTime())) {
    console.warn(`[fmtDate] Se recibió un valor de fecha inválido:`, d);
    return fallback;
  }

  return date.toLocaleDateString('es-MX', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

/**
 * Formatea una fecha mostrando únicamente la hora y minutos (ej. 03:03 a.m.) respetando la zona horaria.
 * @param {string|Date|number} d - La fecha a formatear.
 * @param {string} [fallback='-'] - Valor a mostrar si la fecha es nula o inválida.
 */
export const fmtTime = (d, fallback = '-') => {
  if (!d) return fallback;

  const date = new Date(d);

  if (isNaN(date.getTime())) {
    console.warn(`[fmtTime] Se recibió un valor de fecha inválido:`, d);
    return fallback;
  }

  return date.toLocaleTimeString('es-MX', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
};