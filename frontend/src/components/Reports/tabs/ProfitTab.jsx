// src/components/Reports/tabs/ProfitTab.jsx
// Ventas y utilidad: ventas netas, costo de lo vendido, utilidad bruta y
// margen, agrupados por producto, categoría, sucursal o proveedor
// (specs/04-reporte-ventas-y-utilidad.md). Los cálculos los hace el backend
// (GET /reports/profit); aquí solo se filtra y se muestra.
//
// De arriba abajo (specs/08-rediseno-ventas-y-tendencia.md): filtros (cambian
// todo lo de abajo), resumen como una cuenta (ventas − costo = utilidad) y
// desglose con sus controles encima.
//
// Utilidad neta (specs/13-reporte-de-gastos-y-utilidad-neta.md): si la API
// manda summary.net, la cuenta sigue (utilidad bruta − gastos = utilidad
// neta), y al ver por sucursal cada fila trae sus gastos (row.net). La API
// solo la manda con reports.expenses y sin filtro de categoría.
import { useState, useEffect, useMemo } from 'react'
import { useUser } from '../../../context/UserContext'
import api from '../../../services/api'
import { DATE_PRESETS, getPresetRange, today, fmtRangeLabel } from '../../../utils/dateRanges'
import FilterCard from '../components/FilterCard'
import ButtonGroup from '../components/ButtonGroup'
import SummaryNote from '../components/SummaryNote'
import { SortHeader, SortSelect, nextSort } from '../components/Sorting'

const PAGE_SIZE = 20

const GROUPS = [
  { id: 'product',  label: 'Producto',  plural: 'productos',   icon: 'bi-box' },
  { id: 'category', label: 'Categoría', plural: 'categorías',  icon: 'bi-tag' },
  { id: 'branch',   label: 'Sucursal',  plural: 'sucursales',  icon: 'bi-shop' },
  { id: 'provider', label: 'Proveedor', plural: 'proveedores', icon: 'bi-truck' },
]

// Columnas ordenables; el costo no, porque el endpoint no ordena por costo
const SORTS = [
  { id: 'net_sales', label: 'Venta neta', more: 'Mayor venta neta', less: 'Menor venta neta' },
  { id: 'profit',    label: 'Utilidad',   more: 'Mayor utilidad',   less: 'Menor utilidad' },
  { id: 'margin',    label: 'Margen',     more: 'Mayor margen',     less: 'Menor margen' },
]
const sortColumn = (id) => SORTS.find(s => s.id === id)

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

const fmtLines = (n) => `${n} línea${n !== 1 ? 's' : ''}`

// 'YYYY-MM-DD' → "27 oct 2026"
const fmtDay = (iso) => fmtRangeLabel(iso, iso)

// El SKU no se repite si es igual al nombre
const showSku = (row) => row.sku && row.sku.trim().toLowerCase() !== row.name.trim().toLowerCase()

const Profit = ({ value }) => (
  <span className={value < 0 ? 'rpt-diff rpt-diff--neg' : 'rpt-diff'}>{money(value)}</span>
)

// Una fila con líneas sin costo muestra su costo en naranja, como Productos
// y Valuación, en lugar de una pastilla junto al nombre
const CostValue = ({ row }) =>
  row.noCost.lines > 0
    ? (
      <span
        className="rpt-no-cost"
        title={`Incluye ${fmtLines(row.noCost.lines)} sin costo (${money(row.noCost.netSales)} de venta neta)`}
      >
        {money(row.cost)}
      </span>
    )
    : money(row.cost)

const ProfitTab = () => {
  const { isCentralAdmin, hasPermission } = useUser()
  const canSeeExpenses = hasPermission('reports', 'expenses')

  const [rows,        setRows]        = useState([])
  const [rowsGroupBy, setRowsGroupBy] = useState('product')
  const [pagination,  setPagination]  = useState({ total: 0, page: 1, totalPages: 1 })
  const [summary,     setSummary]     = useState(EMPTY_SUMMARY)
  const [isLoading,   setIsLoading]   = useState(true)
  const [error,       setError]       = useState(null)

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
  // La tabla se dibuja con la agrupación de las filas que ya llegaron: al
  // cambiarla, las filas viejas siguen en pantalla hasta que llega la respuesta
  const group  = GROUPS.find(g => g.id === rowsGroupBy)

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
        setRowsGroupBy(new URLSearchParams(query).get('group_by'))
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
  const changePreset        = withPageReset(setPreset)
  const changeCategory      = withPageReset(setCategoryId)
  const changeGroupBy       = withPageReset(setGroupBy)
  const changeCustom        = withPageReset(setCustomRange)
  const changeExcludeNoCost = withPageReset(setExcludeNoCost)
  const changeBranch = (value) => {
    setSelectedBranchId(value)
    if (value && groupBy === 'branch') setGroupBy('product')
    setPage(1)
  }
  const changeSort = (next) => {
    setSortBy(next.sortBy)
    setSortDir(next.sortDir)
    setPage(1)
  }
  const sortByColumn = (id) => changeSort(nextSort({ sortBy, sortDir }, id))

  const isProduct     = rowsGroupBy === 'product'
  const net           = summary.net
  const rowsWithNet   = rows.some(r => r.net)
  const activeFilters = [selectedBranchId, categoryId].filter(Boolean).length + (excludeNoCost ? 1 : 0)
  const sortProps     = { sortBy, sortDir, onSort: sortByColumn }

  return (
    <div className="rpt-panel">
      {/* ── 1. Filtros: cambian todo lo de abajo ── */}
      <FilterCard
        activeCount={activeFilters}
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
        <div className="rpt-filter-card__row">
          {isCentralAdmin && (
            <select
              className="rpt-select" aria-label="Sucursal"
              value={selectedBranchId} onChange={e => changeBranch(e.target.value)}
            >
              <option value="">Todas las sucursales</option>
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
        </div>

        <div className="rpt-filter-card__exclude" role="group" aria-label="Excluir del cálculo">
          <span className="rpt-filter-card__label">Excluir del cálculo:</span>
          <button
            type="button"
            aria-pressed={excludeNoCost}
            className={`rpt-toggle rpt-toggle--sm ${excludeNoCost ? 'rpt-toggle--active' : ''}`}
            onClick={() => changeExcludeNoCost(!excludeNoCost)}
          >
            <i className={`bi ${excludeNoCost ? 'bi-check-square-fill' : 'bi-square'}`} aria-hidden="true" />
            Ventas sin costo
          </button>
        </div>
      </FilterCard>

      {/* ── 2. Resumen: ventas − costo = utilidad ── */}
      <section className="rpt-summary" aria-label="Resumen de ventas y utilidad">
        <div className="rpt-summary__equation">
          <div className="rpt-stat">
            <span className="rpt-stat__label">Ventas netas</span>
            <span className="rpt-stat__value">{money(summary.netSales)}</span>
          </div>
          <span className="rpt-summary__op" aria-hidden="true">−</span>
          <div className="rpt-stat">
            <span className="rpt-stat__label">Costo de lo vendido</span>
            <span className="rpt-stat__value">{money(summary.cost)}</span>
          </div>
          <span className="rpt-summary__op" aria-hidden="true">=</span>
          <div className={`rpt-stat ${net ? '' : 'rpt-stat--hero'}`}>
            <span className="rpt-stat__label">Utilidad bruta</span>
            <span className="rpt-stat__value"><Profit value={summary.profit} /></span>
            <span className="rpt-stat__sub">Margen {fmtMargin(summary.margin)}</span>
          </div>
          {net && (
            <>
              <span className="rpt-summary__op" aria-hidden="true">−</span>
              <div className="rpt-stat">
                <span className="rpt-stat__label">Gastos</span>
                <span className="rpt-stat__value">{money(net.expenses)}</span>
              </div>
              <span className="rpt-summary__op" aria-hidden="true">=</span>
              <div className="rpt-stat rpt-stat--hero">
                <span className="rpt-stat__label">Utilidad neta</span>
                <span className="rpt-stat__value"><Profit value={net.netProfit} /></span>
                <span className="rpt-stat__sub">Margen neto {fmtMargin(net.netMargin)}</span>
              </div>
            </>
          )}
        </div>

        {!excludeNoCost && summary.noCost.lines > 0 && (
          <SummaryNote actionLabel="Excluirlas" onAction={() => changeExcludeNoCost(true)}>
            {fmtLines(summary.noCost.lines)} de venta sin costo
            suma{summary.noCost.lines !== 1 ? 'n' : ''} {money(summary.noCost.netSales)} de venta neta.
            Como no tienen costo capturado, su utilidad cuenta completa.
          </SummaryNote>
        )}
        {excludeNoCost && (
          <SummaryNote tone="info" actionLabel="Incluirlas" onAction={() => changeExcludeNoCost(false)}>
            No se están contando las ventas sin costo.
          </SummaryNote>
        )}
        {canSeeExpenses && categoryId && (
          <SummaryNote tone="info" actionLabel="Quitar el filtro" onAction={() => changeCategory('')}>
            La utilidad neta se calcula con todas las categorías. Quita el filtro de categoría para verla.
          </SummaryNote>
        )}
        {net && net.firstExpenseDate === null && (
          <SummaryNote tone="info">
            Todavía no hay gastos registrados, así que la utilidad neta es igual a la bruta.
          </SummaryNote>
        )}
        {net && net.firstExpenseDate !== null && start < net.firstExpenseDate && (
          <SummaryNote tone="info">
            El primer gasto registrado es del {fmtDay(net.firstExpenseDate)}; antes de esa fecha la utilidad
            neta no incluye gastos.
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
            {pagination.total === 1 ? group.label.toLowerCase() : group.plural}
            {/* Con utilidad neta, por sucursal entran también las que solo tienen gastos */}
            {rowsWithNet ? ' con ventas o gastos' : ' con ventas'}
          </span>
          <SortSelect sorts={SORTS} sortBy={sortBy} sortDir={sortDir} onChange={changeSort} />
        </div>

        {error && (
          <div className="rpt-alert">
            <i className="bi bi-exclamation-circle" />
            <span>{error}</span>
            <button onClick={() => setError(null)}><i className="bi bi-x" /></button>
          </div>
        )}

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
              <table className="rpt-table rpt-table--static" aria-label="Ventas y utilidad por grupo">
                <thead>
                  <tr>
                    <th>{group.label}</th>
                    <th className="num">{isProduct ? 'Unidades' : 'Productos'}</th>
                    <SortHeader sort={sortColumn('net_sales')} {...sortProps} />
                    <th className="num">Costo</th>
                    <SortHeader sort={sortColumn('profit')} {...sortProps} />
                    <SortHeader sort={sortColumn('margin')} {...sortProps} />
                    {rowsWithNet && <th className="num">Gastos</th>}
                    {rowsWithNet && <th className="num">Utilidad neta</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.groupId ?? 'none'}>
                      <td>
                        <span className="rpt-folio">{r.name}</span>
                        {isProduct && showSku(r) && <span className="rpt-td-muted d-block">{r.sku}</span>}
                      </td>
                      <td className="num">{isProduct ? fmtUnits(r.units, r.uom) : r.productCount}</td>
                      <td className="num">{money(r.netSales)}</td>
                      <td className="num"><CostValue row={r} /></td>
                      <td className="num"><Profit value={r.profit} /></td>
                      <td className="num">{fmtMargin(r.margin)}</td>
                      {rowsWithNet && <td className="num">{money(r.net.expenses)}</td>}
                      {rowsWithNet && <td className="num"><Profit value={r.net.netProfit} /></td>}
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
                    <span className="rpt-muted">
                      <i className={`bi ${group.icon}`} />
                      {isProduct ? fmtUnits(r.units, r.uom) : fmtProductCount(r.productCount)}
                    </span>
                    <span className="rpt-muted">
                      Venta neta {money(r.netSales)} · Costo <CostValue row={r} />
                    </span>
                  </div>
                  <div className="rpt-card__total">
                    <span className="rpt-muted">Utilidad · {fmtMargin(r.margin)}</span>
                    <strong><Profit value={r.profit} /></strong>
                  </div>
                  {r.net && (
                    <div className="rpt-card__total">
                      <span className="rpt-muted">Gastos {money(r.net.expenses)} · Utilidad neta</span>
                      <strong><Profit value={r.net.netProfit} /></strong>
                    </div>
                  )}
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

export default ProfitTab
