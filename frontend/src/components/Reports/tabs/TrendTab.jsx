// src/components/Reports/tabs/TrendTab.jsx
// Tendencia de ventas: monto, número de ventas, utilidad o ticket por día,
// semana o mes, con comparación contra el año anterior o por sucursal
// (specs/05-tendencia-de-ventas.md). Los periodos y los KPIs los calcula el
// backend (GET /reports/trend); aquí se filtra, se grafica y se muestra.
//
// De arriba abajo (specs/08-rediseno-ventas-y-tendencia.md): filtros
// (periodo y sucursal) y la tarjeta de la gráfica, con sus controles
// (métrica, granularidad y comparación) arriba del título, los KPIs y la
// gráfica.
import { useState, useEffect, useMemo } from 'react'
import { addDays, format, parseISO, subDays } from 'date-fns'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { useUser } from '../../../context/UserContext'
import api from '../../../services/api'
import {
  TREND_PRESETS, DEFAULT_TREND_PRESET, MAX_RANGE_DAYS, GRANULARITY_LIMITS,
  getTrendPresetRange, todayInAppTimezone, rangeDays, autoGranularity, fitsGranularity, fmtRangeLabel,
} from '../../../utils/dateRanges'
import FilterCard from '../components/FilterCard'
import ButtonGroup from '../components/ButtonGroup'
import { CHART_COLORS, chartColor } from '../../../utils/chartColors'
import {
  METRICS, GRANULARITIES, COMPARES,
  buildChartData, longLabel, partialDays, pctChange,
  fmtMetric, fmtMoney, fmtAxis, fmtPct,
} from './trendData'

const shiftDate = (iso, days) => format((days >= 0 ? addDays : subDays)(parseISO(iso), Math.abs(days)), 'yyyy-MM-dd')

// Valor de una serie en el tooltip: futuro → "—"; ticket sin ventas → "sin ventas"
const seriesValue = (metric, value, period) => {
  if (value !== null && value !== undefined) return fmtMetric(metric, value)
  if (period && !period.future && metric === 'avgTicket') return 'sin ventas'
  return '—'
}

export const TrendTooltip = ({ active, payload, metric, granularity, compare, branches = [] }) => {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const { period, previousPeriod } = row

  return (
    <div className="rpt-chart-tip">
      <strong className="rpt-chart-tip__title">{longLabel(period, granularity)}</strong>
      {(period.current || period.partial) && (
        <div className="rpt-chart-tip__marks">
          {period.current && <span className="rpt-flag rpt-flag--info">en curso</span>}
          {period.partial && <span className="rpt-flag rpt-flag--info">parcial: {partialDays(period)}</span>}
        </div>
      )}

      {compare === 'branch' ? (
        branches.map((b, i) => (
          <div key={b.branchId} className="rpt-chart-tip__row">
            <span><i className="rpt-chart-tip__dot" style={{ background: chartColor(i) }} />{b.name}</span>
            <strong>{seriesValue(metric, row[`branch_${b.branchId}`], period)}</strong>
          </div>
        ))
      ) : (
        <div className="rpt-chart-tip__row">
          <span><i className="rpt-chart-tip__dot" style={{ background: CHART_COLORS[0] }} />Periodo actual</span>
          <strong>{seriesValue(metric, row.current, period)}</strong>
        </div>
      )}

      {compare === 'previous_year' && previousPeriod && (
        <div className="rpt-chart-tip__row rpt-chart-tip__row--previous">
          <span>
            <i className="rpt-chart-tip__dot rpt-chart-tip__dot--dashed" />
            {longLabel(previousPeriod, granularity)}
          </span>
          <strong>{seriesValue(metric, row.previous, previousPeriod)}</strong>
        </div>
      )}
    </div>
  )
}

// Línea de comparación de una tarjeta: "vs $73,300.00 · ↑ 12.4%"
const Comparison = ({ metric, current, previous, label = 'vs' }) => {
  const pct = pctChange(current, previous)
  const cls = pct === null ? '' : pct >= 0 ? 'rpt-diff--pos' : 'rpt-diff--neg'
  return (
    <span className="rpt-kpi__sub">
      {label} {fmtMetric(metric, previous ?? 0)} · <span className={`rpt-diff ${cls}`}>{fmtPct(pct)}</span>
    </span>
  )
}

const TrendKpis = ({ data, metric, compare }) => {
  const noun   = GRANULARITIES.find(g => g.id === data.granularity).noun
  const totals = data.summary.totals
  const best   = data.summary.best[metric]
  const withPrevious = compare === 'previous_year' && data.previousSummary
  const prevTotals   = data.previousSummary?.totals
  const bestPeriod   = best && data.periods[best.index]

  return (
    <div className={`rpt-kpis ${metric === 'avgTicket' ? 'rpt-kpis--two' : 'rpt-kpis--three'}`}>
      <div className="rpt-kpi">
        <span className="rpt-kpi__label">{metric === 'avgTicket' ? 'Ticket del rango' : 'Total'}</span>
        <span className="rpt-kpi__value">{fmtMetric(metric, totals[metric])}</span>
        {withPrevious && <Comparison metric={metric} current={totals[metric]} previous={prevTotals[metric]} />}
      </div>

      {metric !== 'avgTicket' && (
        <div className="rpt-kpi">
          <span className="rpt-kpi__label">Promedio por {noun}</span>
          <span className="rpt-kpi__value">{fmtMetric(metric, data.summary.averages?.[metric] ?? null)}</span>
          {withPrevious && (
            <Comparison
              metric={metric}
              current={data.summary.averages?.[metric] ?? null}
              previous={data.previousSummary.averages?.[metric] ?? 0}
            />
          )}
        </div>
      )}

      <div className="rpt-kpi">
        <span className="rpt-kpi__label">Mejor {noun}</span>
        <span className="rpt-kpi__value">{best ? fmtMetric(metric, best.value) : '—'}</span>
        {bestPeriod && <span className="rpt-kpi__sub">{longLabel(bestPeriod, data.granularity)}</span>}
        {withPrevious && best && (
          <Comparison
            metric={metric}
            current={best.value}
            previous={best.previousValue}
            label={longLabel(data.previousYear.periods[best.index], data.granularity)}
          />
        )}
      </div>
    </div>
  )
}

const TrendTab = () => {
  const { isCentralAdmin } = useUser()

  const [data,      setData]      = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState(null)

  const [preset,           setPreset]           = useState(DEFAULT_TREND_PRESET)
  const [customRange,      setCustomRange]      = useState(() => ({ start: todayInAppTimezone(), end: todayInAppTimezone() }))
  const [chosenGranularity, setChosenGranularity] = useState(null) // null = automática
  const [metric,           setMetric]           = useState('netSales')
  const [compare,          setCompare]          = useState('none')
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [branches,         setBranches]         = useState([])

  useEffect(() => {
    if (!isCentralAdmin) return
    api.get('branches?is_active=true').then(({ data }) => setBranches(data.data)).catch(() => {})
  }, [isCentralAdmin])

  const { start, end } = useMemo(() => getTrendPresetRange(preset, customRange), [preset, customRange])
  const days = rangeDays(start, end)
  const granularity = chosenGranularity && fitsGranularity(chosenGranularity, days)
    ? chosenGranularity
    : autoGranularity(days)

  // Por sucursal solo en el consolidado del admin central
  const canCompareBranches = isCentralAdmin && !selectedBranchId
  const compares = COMPARES.filter(c => c.id !== 'branch' || canCompareBranches)

  const query = useMemo(() => {
    const params = new URLSearchParams({ start_date: start, end_date: end, granularity, compare })
    if (isCentralAdmin && selectedBranchId) params.set('branch_id', selectedBranchId)
    return params.toString()
  }, [start, end, granularity, compare, isCentralAdmin, selectedBranchId])

  useEffect(() => {
    let ignore = false
    setIsLoading(true)
    setError(null)
    api.get(`reports/trend?${query}`)
      .then(({ data }) => { if (!ignore) setData(data.data) })
      .catch((err) => {
        if (!ignore) setError(err.response?.data?.message ?? 'Error al cargar la tendencia de ventas')
      })
      .finally(() => { if (!ignore) setIsLoading(false) })
    return () => { ignore = true }
  }, [query])

  // Cambiar el rango vuelve a la granularidad automática
  const changePreset = (id) => { setPreset(id); setChosenGranularity(null) }
  const changeCustom = (range) => { setCustomRange(range); setChosenGranularity(null) }
  const changeBranch = (value) => {
    setSelectedBranchId(value)
    if (value && compare === 'branch') setCompare('none')
  }

  // El chart solo se arma con la respuesta del rango que se está mostrando
  const chartRows = useMemo(() => (data ? buildChartData(data, metric, compare) : []), [data, metric, compare])
  const shownCompare  = data?.branches ? 'branch' : data?.previousYear ? 'previous_year' : 'none'
  const metricLabel   = METRICS.find(m => m.id === metric).label

  const lines = shownCompare === 'branch'
    ? data.branches.map((b, i) => (
      <Line
        key={b.branchId} type="monotone" dataKey={`branch_${b.branchId}`} name={b.name}
        stroke={chartColor(i)} strokeWidth={2} dot={false} isAnimationActive={false}
      />
    ))
    : [
      <Line
        key="current" type="monotone" dataKey="current" name="Periodo actual"
        stroke={CHART_COLORS[0]} strokeWidth={2} dot={chartRows.length <= 31} isAnimationActive={false}
      />,
      shownCompare === 'previous_year' && (
        <Line
          key="previous" type="monotone" dataKey="previous" name="Año anterior"
          stroke={CHART_COLORS[0]} strokeOpacity={0.55} strokeWidth={2} strokeDasharray="6 4"
          dot={false} isAnimationActive={false}
        />
      ),
    ]

  const granularityOptions = GRANULARITIES.map(g => {
    const allowed = fitsGranularity(g.id, days)
    return {
      id: g.id, label: g.label, disabled: !allowed,
      title: allowed ? undefined : `${g.limitLabel}: hasta ${GRANULARITY_LIMITS[g.id]} días`,
    }
  })
  const shownNoun = data ? GRANULARITIES.find(g => g.id === data.granularity).noun : null

  return (
    <div className="rpt-panel">
      {/* ── 1. Filtros: periodo y sucursal ── */}
      <FilterCard
        activeCount={selectedBranchId ? 1 : 0}
        top={(
          <>
            <div className="rpt-presets" role="tablist" aria-label="Rango de fechas">
              {TREND_PRESETS.map(p => (
                <button
                  key={p.id} type="button" role="tab" aria-selected={preset === p.id}
                  className={`rpt-preset ${preset === p.id ? 'rpt-preset--active' : ''}`}
                  onClick={() => changePreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {preset === 'custom' && (
              <>
                <input
                  type="date" className="rpt-select" aria-label="Fecha inicial"
                  value={customRange.start} max={customRange.end}
                  min={shiftDate(customRange.end, -(MAX_RANGE_DAYS - 1))}
                  onChange={e => e.target.value && changeCustom({ ...customRange, start: e.target.value })}
                />
                <input
                  type="date" className="rpt-select" aria-label="Fecha final"
                  value={customRange.end} min={customRange.start}
                  max={shiftDate(customRange.start, MAX_RANGE_DAYS - 1)}
                  onChange={e => e.target.value && changeCustom({ ...customRange, end: e.target.value })}
                />
              </>
            )}

            <span className="rpt-period-label">
              <i className="bi bi-calendar3" aria-hidden="true" />
              {fmtRangeLabel(start, end)}
            </span>
          </>
        )}
      >
        {isCentralAdmin && (
          <div className="rpt-filter-card__row">
            <select
              className="rpt-select" aria-label="Sucursal"
              value={selectedBranchId} onChange={e => changeBranch(e.target.value)}
            >
              <option value="">Todas las sucursales</option>
              {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.name}</option>)}
            </select>
          </div>
        )}
      </FilterCard>

      {/* ── Error ── */}
      {error && (
        <div className="rpt-alert">
          <i className="bi bi-exclamation-circle" />
          <span>{error}</span>
          <button onClick={() => setError(null)}><i className="bi bi-x" /></button>
        </div>
      )}

      {/* ── 2. Gráfica: sus controles arriba ── */}
      <section className="rpt-chart-card" aria-label="Gráfica de tendencia">
        <ButtonGroup label="Métrica" options={METRICS} value={metric} onChange={setMetric} />
        <div className="rpt-chart-card__controls">
          <ButtonGroup
            label="Granularidad" caption="Por"
            options={granularityOptions} value={granularity} onChange={setChosenGranularity}
          />
          <ButtonGroup
            label="Comparación" caption="Comparar"
            options={compares} value={compare} onChange={setCompare}
          />
        </div>

        {isLoading && !data ? (
          <div className="rpt-skeleton">
            {[...Array(3)].map((_, i) => <div key={i} className="rpt-skeleton__row" />)}
          </div>
        ) : data && (
          <>
            <h2 className="rpt-chart-card__title">
              {metricLabel} por {shownNoun} <span>· {fmtRangeLabel(start, end)}</span>
            </h2>

            {/* ── KPIs ── */}
            <TrendKpis data={data} metric={metric} compare={shownCompare} />

            {/* ── Aviso de ventas sin costo ── */}
            {metric === 'profit' && data.noCost.lines > 0 && (
              <div className="rpt-notice" role="status">
                <i className="bi bi-exclamation-triangle" />
                <span>
                  {data.noCost.lines} línea{data.noCost.lines !== 1 ? 's' : ''} de venta sin costo
                  suma{data.noCost.lines !== 1 ? 'n' : ''} {fmtMoney(data.noCost.netSales)} de venta neta en
                  este rango. Como no tienen costo capturado, su utilidad aparece completa; puedes revisarlas y
                  excluirlas en Ventas y utilidad.
                </span>
              </div>
            )}

            {/* ── Gráfica ── */}
            <div className={`rpt-chart ${isLoading ? 'rpt-chart--loading' : ''}`} aria-label={`Gráfica de ${metricLabel.toLowerCase()}`}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartRows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={12} />
                  <YAxis
                    tick={{ fontSize: 11 }} width={56}
                    tickFormatter={fmtAxis(metric)} allowDecimals={metric !== 'orders'}
                  />
                  <Tooltip
                    content={(
                      <TrendTooltip
                        metric={metric} granularity={data.granularity}
                        compare={shownCompare} branches={data.branches ?? []}
                      />
                    )}
                  />
                  {shownCompare !== 'none' && <Legend wrapperStyle={{ fontSize: 12 }} />}
                  {lines}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

export default TrendTab
