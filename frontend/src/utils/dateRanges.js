// src/utils/dateRanges.js
// Presets de rango de fechas (Hoy, Esta semana, Este mes, Personalizado),
// compartidos por el Dashboard y Reportes → Ventas y utilidad, para que los
// dos calculen el mismo rango. Extraído de Dashboard.jsx
// (specs/04-reporte-ventas-y-utilidad.md, requisito 18).
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'

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
