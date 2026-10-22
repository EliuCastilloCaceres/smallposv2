// src/components/Reports/tabs/trendData.js
// Funciones puras de la pestaña Tendencia de ventas
// (specs/05-tendencia-de-ventas.md): etiquetas de los periodos, filas de la
// gráfica, % de cambio y formatos. Los cálculos de cada periodo los hace el
// backend (GET /reports/trend).
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export const METRICS = [
  { id: 'netSales',  label: 'Monto vendido',    kind: 'money' },
  { id: 'orders',    label: 'Número de ventas', kind: 'count' },
  { id: 'profit',    label: 'Utilidad bruta',   kind: 'money' },
  { id: 'avgTicket', label: 'Ticket promedio',  kind: 'money' },
]

export const GRANULARITIES = [
  { id: 'day',   label: 'Día',    noun: 'día',    limitLabel: 'Por día' },
  { id: 'week',  label: 'Semana', noun: 'semana', limitLabel: 'Por semana' },
  { id: 'month', label: 'Mes',    noun: 'mes',    limitLabel: 'Por mes' },
]

export const COMPARES = [
  { id: 'none',          label: 'Ninguna' },
  { id: 'previous_year', label: 'Año anterior' },
  { id: 'branch',        label: 'Por sucursal' },
]

const date = (iso) => parseISO(`${iso}T12:00:00`)
const fmt  = (iso, pattern) => format(date(iso), pattern, { locale: es }).replace(/\./g, '')

// Etiqueta corta del eje X: "15 oct", "sem 12 oct" u "oct 2026"
export const axisLabel = (period, granularity) => {
  if (granularity === 'day')  return fmt(period.start, 'd MMM')
  if (granularity === 'week') return `sem ${fmt(period.start, 'd MMM')}`
  return fmt(period.start, 'MMM yyyy')
}

// Periodo completo del tooltip: "jue 15 oct 2026", "Semana del 12 al 18 oct
// 2026" (o "del 27 jul al 2 ago 2026" si cruza de mes) u "octubre 2026"
export const longLabel = (period, granularity) => {
  if (granularity === 'day') return fmt(period.start, 'EEE d MMM yyyy')
  if (granularity === 'week') {
    const sameMonth = period.start.slice(0, 7) === period.end.slice(0, 7)
    const from = sameMonth ? fmt(period.start, 'd') : fmt(period.start, 'd MMM')
    return `Semana del ${from} al ${fmt(period.end, 'd MMM yyyy')}`
  }
  return fmt(period.start, 'MMMM yyyy')
}

// Días de un periodo parcial: "1–2 ago" o "30 jul – 2 ago"
export const partialDays = (period) => {
  if (period.from.slice(0, 7) === period.to.slice(0, 7)) {
    return period.from === period.to
      ? fmt(period.from, 'd MMM')
      : `${fmt(period.from, 'd')}–${fmt(period.to, 'd MMM')}`
  }
  return `${fmt(period.from, 'd MMM')} – ${fmt(period.to, 'd MMM')}`
}

// Filas de la gráfica: una por periodo, con la serie actual (current), la
// del año anterior (previous) o una por sucursal (branch_<id>). Los periodos
// futuros y el ticket sin ventas ya llegan sin valor (null) del backend.
export const buildChartData = (data, metric, compare) => data.periods.map((period, i) => {
  const row = {
    key:   period.start,
    label: axisLabel(period, data.granularity),
    period,
    current: period[metric],
  }
  if (compare === 'previous_year' && data.previousYear) {
    row.previousPeriod = data.previousYear.periods[i]
    row.previous = row.previousPeriod?.[metric] ?? null
  }
  if (compare === 'branch' && data.branches) {
    for (const branch of data.branches) row[`branch_${branch.branchId}`] = branch.periods[i][metric]
  }
  return row
})

// % de cambio contra el año anterior; null ("—") si el anterior es 0
export const pctChange = (current, previous) => {
  if (current === null || current === undefined || !previous) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

export const fmtMoney = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

export const fmtCount = (n) => Number(n ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })

// Valor con el formato de la métrica; sin valor → "—"
export const fmtMetric = (metric, value) => {
  if (value === null || value === undefined) return '—'
  return METRICS.find(m => m.id === metric)?.kind === 'count' ? fmtCount(value) : fmtMoney(value)
}

// Eje Y: pesos compactos ("$12.5 k") o enteros
export const fmtAxis = (metric) => (value) => {
  if (METRICS.find(m => m.id === metric)?.kind === 'count') return fmtCount(value)
  return Math.abs(value) < 1000
    ? `$${Math.round(value)}`
    : `$${Number(value / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })}k`
}

export const fmtPct = (pct) => {
  if (pct === null) return '—'
  const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : ''
  return `${arrow} ${Math.abs(pct).toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`.trim()
}
