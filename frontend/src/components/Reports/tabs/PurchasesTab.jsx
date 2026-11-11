// src/components/Reports/tabs/PurchasesTab.jsx
// Compras: a quién le compro más (specs/16-reporte-de-compras.md). Solo
// cuenta compras; los gastos por proveedor están en la pestaña Gastos
// (requisito 24). Los cálculos los hace el backend (GET /reports/purchases).
// La lista de cada compra está en el módulo Compras, así que tocar una fila
// no abre nada.
//
// De arriba abajo, como Gastos: filtros, resumen y desglose.
import { useState, useEffect, useMemo } from 'react'
import { useUser } from '../../../context/UserContext'
import api from '../../../services/api'
import { DATE_PRESETS, getPresetRange, today, fmtRangeLabel } from '../../../utils/dateRanges'
import FilterCard from '../components/FilterCard'
import ButtonGroup from '../components/ButtonGroup'
import SummaryNote from '../components/SummaryNote'

const PAGE_SIZE = 20

const GROUPS = [
  { id: 'provider', label: 'Proveedor', plural: 'proveedores', icon: 'bi-truck' },
  { id: 'product',  label: 'Producto',  plural: 'productos',   icon: 'bi-box-seam' },
  { id: 'branch',   label: 'Sucursal',  plural: 'sucursales',  icon: 'bi-shop' },
]

const EMPTY_SUMMARY = { total: 0, count: 0, average: null, providers: 0 }

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const fmtShare = (share) =>
  share === null || share === undefined
    ? '—'
    : `${Number(share).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

const fmtPurchases = (n) => `${n.toLocaleString('es-MX')} compra${n !== 1 ? 's' : ''}`

const fmtUnits = (units, uom) =>
  `${Number(units).toLocaleString('es-MX', { maximumFractionDigits: 3 })} ${uom ?? ''}`.trim()

// 'YYYY-MM-DD' → "27 oct 2026"
const fmtDay = (iso) => fmtRangeLabel(iso, iso)

const showSku = (row) => row.sku && row.sku.trim().toLowerCase() !== row.name.trim().toLowerCase()

const InactiveFlag = () => (
  <span className="rpt-flag"><i className="bi bi-eye-slash" aria-hidden="true" /> Inactivo</span>
)

// Columnas numéricas de la tabla y renglones de la tarjeta móvil de cada
// desglose
const VIEWS = {
  provider: {
    columns: [
      { label: 'Compras',         cell: r => r.count.toLocaleString('es-MX') },
      { label: 'Total',           cell: r => money(r.total) },
      { label: '% del total',     cell: r => fmtShare(r.share) },
      { label: 'Compra promedio', cell: r => money(r.average) },
      { label: 'Última compra',   cell: r => fmtDay(r.lastPurchaseDate) },
    ],
    meta: r => [fmtPurchases(r.count), `Promedio ${money(r.average)}`, `Última compra: ${fmtDay(r.lastPurchaseDate)}`],
  },
  product: {
    columns: [
      { label: 'Cantidad',       cell: r => fmtUnits(r.quantity, r.uom) },
      { label: 'Compras',        cell: r => r.count.toLocaleString('es-MX') },
      { label: 'Total',          cell: r => money(r.total) },
      { label: '% del total',    cell: r => fmtShare(r.share) },
      { label: 'Costo promedio', cell: r => (r.averageCost === null ? '—' : money(r.averageCost)) },
    ],
    meta: r => [
      `${fmtUnits(r.quantity, r.uom)} en ${fmtPurchases(r.count)}`,
      `Costo promedio ${r.averageCost === null ? '—' : money(r.averageCost)}`,
    ],
  },
  branch: {
    columns: [
      { label: 'Compras',         cell: r => r.count.toLocaleString('es-MX') },
      { label: 'Total',           cell: r => money(r.total) },
      { label: '% del total',     cell: r => fmtShare(r.share) },
      { label: 'Compra promedio', cell: r => money(r.average) },
    ],
    meta: r => [fmtPurchases(r.count), `Promedio ${money(r.average)}`],
  },
}

const PurchasesTab = () => {
  const { isCentralAdmin } = useUser()

  const [rows,       setRows]       = useState([])
  const [rowsView,   setRowsView]   = useState('provider')
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  const [summary,    setSummary]    = useState(EMPTY_SUMMARY)
  const [firstDate,  setFirstDate]  = useState(null)
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)

  // Filtros — rango por defecto: este mes
  const [preset,           setPreset]           = useState('month')
  const [customRange,      setCustomRange]      = useState({ start: today(), end: today() })
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [groupBy,          setGroupBy]          = useState('provider')
  const [page,             setPage]             = useState(1)

  const [branches, setBranches] = useState([])

  useEffect(() => {
    if (!isCentralAdmin) return
    api.get('branches?is_active=true').then(({ data }) => setBranches(data.data)).catch(() => {})
  }, [isCentralAdmin])

  // Ver por sucursal solo tiene sentido en el consolidado del admin central
  const groups    = GROUPS.filter(g => g.id !== 'branch' || (isCentralAdmin && !selectedBranchId))
  const rowsGroup = GROUPS.find(g => g.id === rowsView)

  const { start, end } = useMemo(() => getPresetRange(preset, customRange), [preset, customRange])

  // Aviso de la primera compra cerrado. Vuelve a salir al cambiar un filtro y
  // al abrir de nuevo la pestaña (requisito 23); "Ver por" y la página no
  // cambian el resumen, así que no lo vuelven a mostrar
  const [noteClosed, setNoteClosed] = useState(false)
  useEffect(() => { setNoteClosed(false) }, [start, end, selectedBranchId])

  const query = useMemo(() => {
    const params = new URLSearchParams({ start_date: start, end_date: end, group_by: groupBy, page, limit: PAGE_SIZE })
    if (isCentralAdmin && selectedBranchId) params.set('branch_id', selectedBranchId)
    return params.toString()
  }, [start, end, groupBy, page, isCentralAdmin, selectedBranchId])

  useEffect(() => {
    let ignore = false
    setIsLoading(true)
    setError(null)
    api.get(`reports/purchases?${query}`)
      .then(({ data }) => {
        if (ignore) return
        setRows(data.data)
        setRowsView(new URLSearchParams(query).get('group_by'))
        setPagination(data.pagination)
        setSummary(data.summary)
        setFirstDate(data.firstPurchaseDate)
      })
      .catch((err) => {
        if (!ignore) setError(err.response?.data?.message ?? 'Error al cargar el reporte de compras')
      })
      .finally(() => { if (!ignore) setIsLoading(false) })
    return () => { ignore = true }
  }, [query])

  // Cambiar cualquier filtro regresa a la página 1
  const withPageReset = (setter) => (value) => { setter(value); setPage(1) }
  const changePreset  = withPageReset(setPreset)
  const changeCustom  = withPageReset(setCustomRange)
  const changeGroupBy = withPageReset(setGroupBy)
  const changeBranch = (value) => {
    setSelectedBranchId(value)
    if (value && groupBy === 'branch') setGroupBy('provider')
    setPage(1)
  }

  const view              = VIEWS[rowsView]
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
      <section className="rpt-summary" aria-label="Resumen de compras">
        <div className="rpt-summary__main">
          <div className="rpt-stat rpt-stat--hero">
            <span className="rpt-stat__label">Total comprado</span>
            <span className="rpt-stat__value">{money(summary.total)}</span>
            <span className="rpt-stat__sub">{fmtPurchases(summary.count)}</span>
          </div>
          <div className="rpt-stat">
            <span className="rpt-stat__label">Compra promedio</span>
            <span className="rpt-stat__value">{summary.average === null ? '—' : money(summary.average)}</span>
          </div>
          <div className="rpt-stat">
            <span className="rpt-stat__label">Proveedores</span>
            <span className="rpt-stat__value">{summary.providers.toLocaleString('es-MX')}</span>
          </div>
        </div>

        {startsBeforeFirst && !noteClosed && (
          <SummaryNote tone="info" onDismiss={() => setNoteClosed(true)}>
            La primera compra registrada es del {fmtDay(firstDate)}. Las entradas de mercancía anteriores no tienen
            costo ni proveedor, así que no están en este reporte.
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
            {pagination.total === 1 ? rowsGroup.label.toLowerCase() : rowsGroup.plural} con compras
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
            <i className="bi bi-cart" />
            <span>No hay compras en este periodo</span>
          </div>
        ) : (
          <>
            {/* ── Tabla (desktop) ── */}
            <div className="rpt-table-wrap">
              <table className="rpt-table rpt-table--static" aria-label="Compras por grupo">
                <thead>
                  <tr>
                    <th>{rowsGroup.label}</th>
                    {view.columns.map(c => <th key={c.label} className="num">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.groupId}>
                      <td>
                        <span className="rpt-group-name">
                          <span className="rpt-folio">{r.name}</span>
                          {r.isActive === false && <InactiveFlag />}
                        </span>
                        {showSku(r) && <span className="rpt-td-muted d-block">{r.sku}</span>}
                      </td>
                      {view.columns.map(c => <td key={c.label} className="num">{c.cell(r)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Cards (móvil) ── */}
            <div className="rpt-cards">
              {rows.map(r => (
                <div key={r.groupId} className="rpt-card rpt-card--static">
                  <div className="rpt-card__top">
                    <span className="rpt-group-name">
                      <span className="rpt-folio">{r.name}</span>
                      {r.isActive === false && <InactiveFlag />}
                    </span>
                  </div>
                  <div className="rpt-card__meta">
                    {showSku(r) && <span className="rpt-muted">{r.sku}</span>}
                    {view.meta(r).map((line, i) => (
                      <span key={i} className="rpt-muted">
                        {i === 0 && <i className={`bi ${rowsGroup.icon}`} />} {line}
                      </span>
                    ))}
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

export default PurchasesTab
