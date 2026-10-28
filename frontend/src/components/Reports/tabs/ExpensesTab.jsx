// src/components/Reports/tabs/ExpensesTab.jsx
// Gastos: cuánto se gastó en un periodo y en qué, por categoría, sucursal,
// proveedor o método de pago (specs/13-reporte-de-gastos-y-utilidad-neta.md).
// Los cálculos los hace el backend (GET /reports/expenses). La lista de cada
// gasto está en el módulo Gastos.
//
// De arriba abajo, como Ventas y utilidad: filtros, resumen y desglose.
import { useState, useEffect, useMemo } from 'react'
import { useUser } from '../../../context/UserContext'
import api from '../../../services/api'
import { DATE_PRESETS, getPresetRange, today, fmtRangeLabel } from '../../../utils/dateRanges'
import FilterCard from '../components/FilterCard'
import ButtonGroup from '../components/ButtonGroup'
import SummaryNote from '../components/SummaryNote'

const PAGE_SIZE = 20

const GROUPS = [
  { id: 'category',       label: 'Categoría',      plural: 'categorías',        icon: 'bi-tag' },
  { id: 'branch',         label: 'Sucursal',       plural: 'sucursales',        icon: 'bi-shop' },
  { id: 'provider',       label: 'Proveedor',      plural: 'proveedores',       icon: 'bi-truck' },
  { id: 'payment_method', label: 'Método de pago', plural: 'métodos de pago',   icon: 'bi-credit-card' },
]

const EMPTY_SUMMARY = { total: 0, count: 0, average: null, inNetProfit: 0, outOfNetProfit: 0 }

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const fmtShare = (share) =>
  share === null || share === undefined
    ? '—'
    : `${Number(share).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

const fmtCount = (n) => `${n.toLocaleString('es-MX')} gasto${n !== 1 ? 's' : ''}`

// 'YYYY-MM-DD' → "27 oct 2026"
const fmtDay = (iso) => fmtRangeLabel(iso, iso)

const NotCountedFlag = () => (
  <span className="rpt-flag" title="Su costo ya cuenta al vender, así que no resta de la utilidad neta">
    <i className="bi bi-dash-circle" aria-hidden="true" /> No cuenta en la utilidad neta
  </span>
)

const ExpensesTab = () => {
  const { isCentralAdmin } = useUser()

  const [rows,        setRows]        = useState([])
  const [rowsGroupBy, setRowsGroupBy] = useState('category')
  const [pagination,  setPagination]  = useState({ total: 0, page: 1, totalPages: 1 })
  const [summary,     setSummary]     = useState(EMPTY_SUMMARY)
  const [firstDate,   setFirstDate]   = useState(null)
  const [isLoading,   setIsLoading]   = useState(true)
  const [error,       setError]       = useState(null)

  // Filtros — rango por defecto: este mes
  const [preset,           setPreset]           = useState('month')
  const [customRange,      setCustomRange]      = useState({ start: today(), end: today() })
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [groupBy,          setGroupBy]          = useState('category')
  const [page,             setPage]             = useState(1)

  const [branches, setBranches] = useState([])

  useEffect(() => {
    if (!isCentralAdmin) return
    api.get('branches?is_active=true').then(({ data }) => setBranches(data.data)).catch(() => {})
  }, [isCentralAdmin])

  // Ver por sucursal solo tiene sentido en el consolidado del admin central
  const groups = GROUPS.filter(g => g.id !== 'branch' || (isCentralAdmin && !selectedBranchId))
  const group  = GROUPS.find(g => g.id === rowsGroupBy)

  const { start, end } = useMemo(() => getPresetRange(preset, customRange), [preset, customRange])

  const query = useMemo(() => {
    const params = new URLSearchParams({ start_date: start, end_date: end, group_by: groupBy, page, limit: PAGE_SIZE })
    if (isCentralAdmin && selectedBranchId) params.set('branch_id', selectedBranchId)
    return params.toString()
  }, [start, end, groupBy, page, isCentralAdmin, selectedBranchId])

  useEffect(() => {
    let ignore = false
    setIsLoading(true)
    setError(null)
    api.get(`reports/expenses?${query}`)
      .then(({ data }) => {
        if (ignore) return
        setRows(data.data)
        setRowsGroupBy(new URLSearchParams(query).get('group_by'))
        setPagination(data.pagination)
        setSummary(data.summary)
        setFirstDate(data.firstExpenseDate)
      })
      .catch((err) => {
        if (!ignore) setError(err.response?.data?.message ?? 'Error al cargar el reporte de gastos')
      })
      .finally(() => { if (!ignore) setIsLoading(false) })
    return () => { ignore = true }
  }, [query])

  // Cambiar cualquier filtro regresa a la página 1
  const withPageReset = (setter) => (value) => { setter(value); setPage(1) }
  const changePreset  = withPageReset(setPreset)
  const changeCustom  = withPageReset(setCustomRange)
  const changeGroupBy = withPageReset(setGroupBy)
  const changeBranch  = (value) => {
    setSelectedBranchId(value)
    if (value && groupBy === 'branch') setGroupBy('category')
    setPage(1)
  }

  const isCategory = rowsGroupBy === 'category'
  const startsBeforeFirst = firstDate !== null && start < firstDate

  return (
    <div className="rpt-panel">
      {/* ── 1. Filtros: cambian todo lo de abajo ── */}
      <FilterCard
        activeCount={selectedBranchId ? 1 : 0}
        top={(
          <>
            <div className="rpt-presets" role="tablist" aria-label="Rango de fechas">
              {DATE_PRESETS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={preset === p.id}
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
                  onChange={e => changeCustom({ ...customRange, start: e.target.value })}
                />
                <input
                  type="date" className="rpt-select" aria-label="Fecha final"
                  value={customRange.end} min={customRange.start} max={today()}
                  onChange={e => changeCustom({ ...customRange, end: e.target.value })}
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
              {branches.map(b => (
                <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}
      </FilterCard>

      {/* ── 2. Resumen ── */}
      <section className="rpt-summary" aria-label="Resumen de gastos">
        <div className="rpt-summary__main">
          <div className="rpt-stat rpt-stat--hero">
            <span className="rpt-stat__label">Total gastado</span>
            <span className="rpt-stat__value">{money(summary.total)}</span>
            <span className="rpt-stat__sub">{fmtCount(summary.count)}</span>
          </div>
          <div className="rpt-stat">
            <span className="rpt-stat__label">Gasto promedio</span>
            <span className="rpt-stat__value">{summary.average === null ? '—' : money(summary.average)}</span>
          </div>
          <div className="rpt-stat">
            <span className="rpt-stat__label">Cuenta en la utilidad neta</span>
            <span className="rpt-stat__value">{money(summary.inNetProfit)}</span>
            <span className="rpt-stat__sub">No cuenta: {money(summary.outOfNetProfit)}</span>
          </div>
        </div>

        {startsBeforeFirst && (
          <SummaryNote tone="info">
            El primer gasto registrado es del {fmtDay(firstDate)}; antes de esa fecha la utilidad neta no incluye gastos.
          </SummaryNote>
        )}
      </section>

      {/* ── 3. Desglose ── */}
      <section className="rpt-section" aria-label="Desglose">
        <div className="rpt-section__head">
          <h2 className="rpt-section-title">Desglose</h2>
          <ButtonGroup label="Ver por" options={groups} value={groupBy} onChange={changeGroupBy} />
          <span className="rpt-section__count">
            {pagination.total.toLocaleString('es-MX')}{' '}
            {pagination.total === 1 ? group.label.toLowerCase() : group.plural} con gastos
          </span>
        </div>

        {error && (
          <div className="rpt-alert">
            <i className="bi bi-exclamation-circle" />
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Cerrar aviso"><i className="bi bi-x" /></button>
          </div>
        )}

        {isLoading ? (
          <div className="rpt-skeleton">
            {[...Array(4)].map((_, i) => <div key={i} className="rpt-skeleton__row" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="rpt-empty">
            <i className="bi bi-wallet2" />
            <span>No hay gastos en este periodo</span>
          </div>
        ) : (
          <>
            {/* ── Tabla (desktop) ── */}
            <div className="rpt-table-wrap">
              <table className="rpt-table rpt-table--static" aria-label="Gastos por grupo">
                <thead>
                  <tr>
                    <th>{group.label}</th>
                    <th className="num">Gastos</th>
                    <th className="num">Total</th>
                    <th className="num">% del total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.groupId ?? 'none'}>
                      <td>
                        <span className="rpt-group-name">
                          <span className="rpt-folio">{r.name}</span>
                          {isCategory && !r.countsInNetProfit && <NotCountedFlag />}
                        </span>
                      </td>
                      <td className="num">{r.count.toLocaleString('es-MX')}</td>
                      <td className="num">{money(r.total)}</td>
                      <td className="num">{fmtShare(r.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Cards (móvil) ── */}
            <div className="rpt-cards">
              {rows.map(r => (
                <div key={r.groupId ?? 'none'} className="rpt-card rpt-card--static">
                  <div className="rpt-card__top">
                    <span className="rpt-folio">{r.name}</span>
                  </div>
                  <div className="rpt-card__meta">
                    <span className="rpt-muted"><i className={`bi ${group.icon}`} /> {fmtCount(r.count)}</span>
                    {isCategory && !r.countsInNetProfit && <NotCountedFlag />}
                  </div>
                  <div className="rpt-card__total">
                    <span className="rpt-muted">{fmtShare(r.share)} del total</span>
                    <strong>{money(r.total)}</strong>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Paginación ── */}
            {pagination.totalPages > 1 && (
              <div className="rpt-pagination">
                <button className="rpt-btn rpt-btn--ghost rpt-btn--icon" aria-label="Página anterior"
                  onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                  <i className="bi bi-chevron-left" />
                </button>
                <span className="rpt-pagination__info">
                  Página <strong>{page}</strong> de <strong>{pagination.totalPages}</strong>
                </span>
                <button className="rpt-btn rpt-btn--ghost rpt-btn--icon" aria-label="Página siguiente"
                  onClick={() => setPage(p => p + 1)} disabled={page === pagination.totalPages}>
                  <i className="bi bi-chevron-right" />
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

export default ExpensesTab
