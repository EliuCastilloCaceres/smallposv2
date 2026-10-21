// src/components/Reports/tabs/ProfitTab.jsx
// Ventas y utilidad: ventas netas, costo de lo vendido, utilidad bruta y
// margen, agrupados por producto, categoría, sucursal o proveedor
// (specs/04-reporte-ventas-y-utilidad.md). Los cálculos los hace el backend
// (GET /reports/profit); aquí solo se filtra y se muestra.
import { useState, useEffect, useMemo } from 'react'
import { useUser } from '../../../context/UserContext'
import api from '../../../services/api'
import { DATE_PRESETS, getPresetRange, today } from '../../../utils/dateRanges'

const PAGE_SIZE = 20

const GROUPS = [
  { id: 'product',  label: 'Producto',  plural: 'productos',   icon: 'bi-box' },
  { id: 'category', label: 'Categoría', plural: 'categorías',  icon: 'bi-tag' },
  { id: 'branch',   label: 'Sucursal',  plural: 'sucursales',  icon: 'bi-shop' },
  { id: 'provider', label: 'Proveedor', plural: 'proveedores', icon: 'bi-truck' },
]

const SORTS = [
  { id: 'profit',    label: 'Utilidad' },
  { id: 'net_sales', label: 'Venta neta' },
  { id: 'margin',    label: 'Margen' },
]

const EMPTY_SUMMARY = { netSales: 0, cost: 0, profit: 0, margin: null, noCost: { lines: 0, netSales: 0 } }

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

// Margen null = venta neta 0
const fmtMargin = (margin) =>
  margin === null || margin === undefined
    ? '—'
    : `${Number(margin).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

const fmtUnits = (units, uom) =>
  `${Number(units).toLocaleString('es-MX', { maximumFractionDigits: 3 })} ${uom ?? ''}`.trim()

const fmtProductCount = (n) => `${n} producto${n !== 1 ? 's' : ''}`

const Profit = ({ value }) => (
  <span className={value < 0 ? 'rpt-diff rpt-diff--neg' : 'rpt-diff'}>{money(value)}</span>
)

const NoCostFlag = ({ row }) => row.noCost.lines > 0 && (
  <span
    className="rpt-flag"
    title={`Incluye ${row.noCost.lines} línea${row.noCost.lines !== 1 ? 's' : ''} sin costo (${money(row.noCost.netSales)})`}
  >
    <i className="bi bi-exclamation-triangle" />
    Sin costo
  </span>
)

const ProfitTab = () => {
  const { isCentralAdmin } = useUser()

  const [rows,       setRows]       = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  const [summary,    setSummary]    = useState(EMPTY_SUMMARY)
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)

  // Filtros — rango por defecto: este mes
  const [preset,           setPreset]           = useState('month')
  const [customRange,      setCustomRange]      = useState({ start: today(), end: today() })
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [categoryId,       setCategoryId]       = useState('')
  const [groupBy,          setGroupBy]          = useState('product')
  const [sortBy,           setSortBy]           = useState('profit')
  const [sortDir,          setSortDir]          = useState('desc')
  const [excludeNoCost,    setExcludeNoCost]    = useState(false)
  const [page,             setPage]             = useState(1)

  const [branches,   setBranches]   = useState([])
  const [categories, setCategories] = useState([])

  useEffect(() => {
    if (!isCentralAdmin) return
    api.get('branches?is_active=true').then(({ data }) => setBranches(data.data)).catch(() => {})
  }, [isCentralAdmin])

  useEffect(() => {
    api.get('categories?is_active=true&limit=all').then(({ data }) => setCategories(data.data)).catch(() => {})
  }, [])

  // Agrupar por sucursal solo tiene sentido en el consolidado del admin central
  const canGroupByBranch = isCentralAdmin && !selectedBranchId
  const groups = GROUPS.filter(g => g.id !== 'branch' || canGroupByBranch)
  const group  = GROUPS.find(g => g.id === groupBy)

  const { start, end } = useMemo(() => getPresetRange(preset, customRange), [preset, customRange])

  const query = useMemo(() => {
    const params = new URLSearchParams({
      start_date: start, end_date: end,
      group_by: groupBy, sort_by: sortBy, sort_dir: sortDir,
      page, limit: PAGE_SIZE,
    })
    if (isCentralAdmin && selectedBranchId) params.set('branch_id', selectedBranchId)
    if (categoryId)    params.set('category_id', categoryId)
    if (excludeNoCost) params.set('exclude_no_cost', 'true')
    return params.toString()
  }, [start, end, groupBy, sortBy, sortDir, page, isCentralAdmin, selectedBranchId, categoryId, excludeNoCost])

  useEffect(() => {
    let ignore = false
    setIsLoading(true)
    setError(null)
    api.get(`reports/profit?${query}`)
      .then(({ data }) => {
        if (ignore) return
        setRows(data.data)
        setPagination(data.pagination)
        setSummary(data.summary)
      })
      .catch((err) => {
        if (!ignore) setError(err.response?.data?.message ?? 'Error al cargar el reporte de utilidad')
      })
      .finally(() => { if (!ignore) setIsLoading(false) })
    return () => { ignore = true }
  }, [query])

  // Cambiar cualquier filtro regresa a la página 1
  const withPageReset = (setter) => (value) => { setter(value); setPage(1) }
  const changePreset     = withPageReset(setPreset)
  const changeCategory   = withPageReset(setCategoryId)
  const changeGroupBy    = withPageReset(setGroupBy)
  const changeSortBy     = withPageReset(setSortBy)
  const changeCustom     = withPageReset(setCustomRange)
  const toggleSortDir    = () => { setSortDir(d => (d === 'desc' ? 'asc' : 'desc')); setPage(1) }
  const toggleExclude    = () => { setExcludeNoCost(v => !v); setPage(1) }
  const changeBranch = (value) => {
    setSelectedBranchId(value)
    if (value && groupBy === 'branch') setGroupBy('product')
    setPage(1)
  }

  const isProduct = groupBy === 'product'

  return (
    <div className="rpt-panel">
      {/* ── KPIs ── */}
      <div className="rpt-kpis">
        <div className="rpt-kpi">
          <span className="rpt-kpi__label">Ventas netas</span>
          <span className="rpt-kpi__value">{money(summary.netSales)}</span>
        </div>
        <div className="rpt-kpi">
          <span className="rpt-kpi__label">Costo de lo vendido</span>
          <span className="rpt-kpi__value">{money(summary.cost)}</span>
        </div>
        <div className={`rpt-kpi ${summary.profit < 0 ? 'rpt-kpi--alert' : ''}`}>
          <span className="rpt-kpi__label">Utilidad bruta</span>
          <span className="rpt-kpi__value">{money(summary.profit)}</span>
        </div>
        <div className="rpt-kpi">
          <span className="rpt-kpi__label">Margen</span>
          <span className="rpt-kpi__value">{fmtMargin(summary.margin)}</span>
        </div>
      </div>

      {/* ── Aviso de ventas sin costo ── */}
      {summary.noCost.lines > 0 && (
        <div className="rpt-notice" role="status">
          <i className="bi bi-exclamation-triangle" />
          <span>
            {summary.noCost.lines} línea{summary.noCost.lines !== 1 ? 's' : ''} de venta sin costo
            suma{summary.noCost.lines !== 1 ? 'n' : ''} {money(summary.noCost.netSales)} de venta neta.
            Como no tienen costo capturado, su utilidad aparece completa. Puedes excluirlas con
            "Excluir ventas sin costo".
          </span>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="rpt-filters">
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

        {isCentralAdmin && (
          <select
            className="rpt-select" aria-label="Sucursal"
            value={selectedBranchId} onChange={e => changeBranch(e.target.value)}
          >
            <option value="">Consolidado (todas)</option>
            {branches.map(b => (
              <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
            ))}
          </select>
        )}

        <select
          className="rpt-select" aria-label="Categoría"
          value={categoryId} onChange={e => changeCategory(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {categories.map(c => (
            <option key={c.category_id} value={c.category_id}>{c.name}</option>
          ))}
        </select>

        <select
          className="rpt-select" aria-label="Agrupar por"
          value={groupBy} onChange={e => changeGroupBy(e.target.value)}
        >
          {groups.map(g => (
            <option key={g.id} value={g.id}>Por {g.label.toLowerCase()}</option>
          ))}
        </select>

        <select
          className="rpt-select" aria-label="Ordenar por"
          value={sortBy} onChange={e => changeSortBy(e.target.value)}
        >
          {SORTS.map(s => (
            <option key={s.id} value={s.id}>Ordenar: {s.label.toLowerCase()}</option>
          ))}
        </select>

        <button
          type="button"
          className="rpt-btn rpt-btn--ghost rpt-btn--icon"
          onClick={toggleSortDir}
          aria-label={sortDir === 'desc' ? 'Orden de mayor a menor' : 'Orden de menor a mayor'}
          title={sortDir === 'desc' ? 'De mayor a menor' : 'De menor a mayor'}
        >
          <i className={`bi ${sortDir === 'desc' ? 'bi-sort-down' : 'bi-sort-up'}`} />
        </button>

        <button
          type="button"
          aria-pressed={excludeNoCost}
          className={`rpt-toggle ${excludeNoCost ? 'rpt-toggle--active' : ''}`}
          onClick={toggleExclude}
        >
          <i className="bi bi-funnel" />
          Excluir ventas sin costo
        </button>
      </div>

      <span className="rpt-panel__count">
        {pagination.total} {pagination.total === 1 ? group.label.toLowerCase() : group.plural} con ventas
      </span>

      {/* ── Error ── */}
      {error && (
        <div className="rpt-alert">
          <i className="bi bi-exclamation-circle" />
          <span>{error}</span>
          <button onClick={() => setError(null)}><i className="bi bi-x" /></button>
        </div>
      )}

      {/* ── Contenido ── */}
      {isLoading ? (
        <div className="rpt-skeleton">
          {[...Array(5)].map((_, i) => <div key={i} className="rpt-skeleton__row" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="rpt-empty">
          <i className="bi bi-graph-up" />
          <span>No hay ventas en este rango</span>
        </div>
      ) : (
        <>
          {/* ── Tabla (desktop) ── */}
          <div className="rpt-table-wrap">
            <table className="rpt-table rpt-table--static">
              <thead>
                <tr>
                  <th>{group.label}</th>
                  <th className="num">{isProduct ? 'Unidades' : 'Productos'}</th>
                  <th className="num">Venta neta</th>
                  <th className="num">Costo</th>
                  <th className="num">Utilidad</th>
                  <th className="num">Margen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.groupId ?? 'none'}>
                    <td>
                      <div className="rpt-group-name">
                        <span className="rpt-folio">{r.name}</span>
                        <NoCostFlag row={r} />
                      </div>
                      {isProduct && r.sku && <span className="rpt-td-muted">{r.sku}</span>}
                    </td>
                    <td className="num">{isProduct ? fmtUnits(r.units, r.uom) : r.productCount}</td>
                    <td className="num">{money(r.netSales)}</td>
                    <td className="num">{money(r.cost)}</td>
                    <td className="num"><Profit value={r.profit} /></td>
                    <td className="num">{fmtMargin(r.margin)}</td>
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
                  <NoCostFlag row={r} />
                </div>
                <div className="rpt-card__meta">
                  <span className="rpt-muted">
                    <i className={`bi ${group.icon}`} />
                    {isProduct ? fmtUnits(r.units, r.uom) : fmtProductCount(r.productCount)}
                  </span>
                  <span className="rpt-muted">Venta neta {money(r.netSales)} · Costo {money(r.cost)}</span>
                </div>
                <div className="rpt-card__total">
                  <span className="rpt-muted">Utilidad · {fmtMargin(r.margin)}</span>
                  <strong><Profit value={r.profit} /></strong>
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
    </div>
  )
}

export default ProfitTab
