// src/utils/dateRanges.js
// Presets de rango de fechas (Hoy, Esta semana, Este mes, Personalizado),
// compartidos por el Dashboard y Reportes → Ventas y utilidad, para que los
// dos calculen el mismo rango. Extraído de Dashboard.jsx
// (specs/04-reporte-ventas-y-utilidad.md, requisito 18).
//
// También los presets, la granularidad automática y los límites de la
// Tendencia de ventas (specs/05-tendencia-de-ventas.md, requisitos 6–8).
import {
  format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths,
  differenceInCalendarDays,
} from 'date-fns'

const APP_TIMEZONE = import.meta.env?.VITE_TIMEZONE || 'America/Mexico_City'

export const DATE_PRESETS = [
  { id: 'today',  label: 'Hoy' },
  { id: 'week',   label: 'Esta semana' },
  { id: 'month',  label: 'Este mes' },
  { id: 'custom', label: 'Personalizado' },
]

export const toISO = (d) => format(d, 'yyyy-MM-dd')
export const today = () => toISO(new Date())

// { start, end } en 'YYYY-MM-DD'. La semana empieza en lunes. custom:
// { start, end } del rango personalizado; now solo se pasa en los tests.
export const getPresetRange = (preset, custom, now = new Date()) => {
  switch (preset) {
    case 'week':
      return {
        start: toISO(startOfWeek(now, { weekStartsOn: 1 })),
        end: toISO(endOfWeek(now, { weekStartsOn: 1 })),
      }
    case 'month':
      return { start: toISO(startOfMonth(now)), end: toISO(endOfMonth(now)) }
    case 'custom':
      return { start: custom.start || toISO(now), end: custom.end || toISO(now) }
    case 'today':
    default:
      return { start: toISO(now), end: toISO(now) }
  }
}

// ── Tendencia de ventas ─────────────────────────────────────────────────────

// Presets alineados al calendario: un mes o una semana a medias en los
// extremos haría ver caído el primer o el último punto
export const TREND_PRESETS = [
  { id: 'month',        label: 'Este mes' },
  { id: 'last3months',  label: 'Últimos 3 meses' },
  { id: 'year',         label: 'Este año' },
  { id: 'last12months', label: 'Últimos 12 meses' },
  { id: 'custom',       label: 'Personalizado' },
]
export const DEFAULT_TREND_PRESET = 'last12months'

// Días máximos del rango por granularidad; el de mes es el rango máximo.
// Deben coincidir con backend/src/utils/periods.js.
export const GRANULARITY_LIMITS = { day: 92, week: 731, month: 1827 }
export const MAX_RANGE_DAYS = GRANULARITY_LIMITS.month

// 'YYYY-MM-DD' de hoy en la zona de la app (México), sin importar la zona
// del navegador
export const todayInAppTimezone = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)

// { start, end } del preset de tendencia. now solo se pasa en los tests.
export const getTrendPresetRange = (preset, custom = {}, now = new Date()) => {
  const todayStr = todayInAppTimezone(now)
  // Mediodía de hoy en México, solo como calculadora de fechas
  const base = parseISO(`${todayStr}T12:00:00`)
  switch (preset) {
    case 'month':
      return { start: toISO(startOfMonth(base)), end: toISO(endOfMonth(base)) }
    case 'last3months':
      return { start: toISO(startOfMonth(subMonths(base, 2))), end: toISO(endOfMonth(base)) }
    case 'year':
      return { start: `${todayStr.slice(0, 4)}-01-01`, end: `${todayStr.slice(0, 4)}-12-31` }
    case 'custom':
      return { start: custom.start || todayStr, end: custom.end || todayStr }
    case 'last12months':
    default:
      return { start: toISO(startOfMonth(subMonths(base, 11))), end: toISO(endOfMonth(base)) }
  }
}

// Días del rango, contando los dos extremos
export const rangeDays = (start, end) =>
  differenceInCalendarDays(parseISO(end), parseISO(start)) + 1

// Hasta 31 días → día; hasta 183 → semana; más → mes
export const autoGranularity = (days) => (days <= 31 ? 'day' : days <= 183 ? 'week' : 'month')

export const fitsGranularity = (granularity, days) => days <= GRANULARITY_LIMITS[granularity]
