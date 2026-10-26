// src/components/Reports/tabs/InventoryTab.jsx
// Valuación de inventario: artículos, unidades y valor al costo y a precio de
// venta de las existencias del momento, con lo apartado aparte, alertas y una
// tabla agrupable (specs/07-valuacion-de-inventario.md). Los cálculos los
// hace el backend (GET /reports/inventory); aquí solo se filtra y se muestra.
//
// De arriba abajo: filtros (cambian todo lo de abajo), resumen, "Revisar
// captura" y desglose. Cada dato aparece una sola vez (requisito 11).
// Al ver por producto, cada fila se edita con el formulario de Productos
// (requisito 33).
import { useState, useEffect, useMemo, useRef } from 'react'
import { useUser } from '../../../context/UserContext'
import api from '../../../services/api'
import { fmtDateTime } from '../../../utils/dateFormatter'
import ProductModal from '../../Products/modals/ProductModal'
import FilterCard from '../components/FilterCard'
import ButtonGroup from '../components/ButtonGroup'
import SummaryNote from '../components/SummaryNote'
import { SortHeader, SortSelect, nextSort } from '../components/Sorting'
// Estilos del formulario de producto; sus variables viven en .prd-root
import '../../Products/products.css'

const PAGE_SIZE = 20
const SEARCH_DELAY_MS = 300

const GROUPS = [
  { id: 'product',  label: 'Producto',  plural: 'productos',   icon: 'bi-box' },
  { id: 'category', label: 'Categoría', plural: 'categorías',  icon: 'bi-tag' },
  { id: 'provider', label: 'Proveedor', plural: 'proveedores', icon: 'bi-truck' },
  { id: 'branch',   label: 'Sucursal',  plural: 'sucursales',  icon: 'bi-shop' },
]

// Columnas ordenables; en móvil, el selector usa `more` y `less`
const SORTS = [
  { id: 'cost_value', label: 'Valor al costo', more: 'Mayor valor al costo', less: 'Menor valor al costo' },
  { id: 'sale_value', label: 'Valor a venta',  more: 'Mayor valor a venta',  less: 'Menor valor a venta' },
  { id: 'profit',     label: 'Utilidad',       more: 'Mayor utilidad',       less: 'Menor utilidad' },
  { id: 'margin',     label: 'Margen',         more: 'Mayor margen',         less: 'Menor margen' },
]

// Cada acceso de "Revisar captura" y el valor que muestra además del conteo
const ALERTS = [
  { id: 'no_cost',    key: 'noCost',    label: 'Sin costo',             icon: 'bi-currency-dollar',  amount: 'saleValue', amountLabel: 'a precio de venta' },
  { id: 'below_cost', key: 'belowCost', label: 'Precio menor al costo', icon: 'bi-graph-down-arrow', amount: 'costValue', amountLabel: 'al costo' },
  { id: 'inactive',   key: 'inactive',  label: 'Inactivos con stock',   icon: 'bi-eye-slash',        amount: 'costValue', amountLabel: 'al costo' },
]

const EMPTY_TOTALS = { items: 0, units: [], costValue: 0, saleValue: 0, profit: 0, margin: null }
const EMPTY_SUMMARY = {
  available: EMPTY_TOTALS,
  reserved:  EMPTY_TOTALS,
  total:     EMPTY_TOTALS,
  noCost:    { items: 0, saleValue: 0 },
  alerts:    { noCost: EMPTY_TOTALS, belowCost: EMPTY_TOTALS, inactive: EMPTY_TOTALS },
}

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const fmtNumber = (n) => Number(n).toLocaleString('es-MX', { maximumFractionDigits: 3 })

// Margen null = valor a venta 0
const fmtMargin = (margin) =>
  margin === null || margin === undefined
    ? '—'
    : `${Number(margin).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

const uomLabel = (uom) => uom ?? 'sin unidad'

const fmtUnits = (units, uom) => `${fmtNumber(units)} ${uomLabel(uom)}`

// [{ uom: 'pza', quantity: 17989 }, { uom: 'par', quantity: 600 }] → "17,989 pza · 600 par"
const fmtUnitList = (units) =>
  units.length === 0 ? '0 unidades' : units.map(u => fmtUnits(u.quantity, u.uom)).join(' · ')

const fmtItems = (n) => `${n.toLocaleString('es-MX')} artículo${n !== 1 ? 's' : ''}`

// El SKU no se repite si es igual al nombre
const showSku = (row) => row.sku && row.sku.trim().toLowerCase() !== row.name.trim().toLowerCase()

const Profit = ({ value }) => (
  <span className={value < 0 ? 'rpt-diff rpt-diff--neg' : 'rpt-diff'}>{money(value)}</span>
)

const Margin = ({ value }) => (
  <span className={value < 0 ? 'rpt-margin--neg' : undefined}>{fmtMargin(value)}</span>
)

// Al agrupar por producto, un producto sin costo muestra "$0.00" en naranja,
// como en Productos
const CostValue = ({ row, isProduct }) =>
  isProduct && row.noCostItems > 0
    ? <span className="rpt-no-cost" title="Sin costo">{money(row.costValue)}</span>
    : money(row.costValue)

// En las demás agrupaciones, cuántos artículos sin costo incluye la fila
const NoCostFlag = ({ row, isProduct }) => !isProduct && row.noCostItems > 0 && (
  <span className="rpt-flag" title="Artículos sin costo capturado">
    <i className="bi bi-exclamation-triangle" />
    {row.noCostItems} sin costo
  </span>
)

const EditButton = ({ row, onEdit }) => (
  <button
    type="button" className="rpt-btn rpt-btn--ghost rpt-btn--icon rpt-row-edit"
    aria-label={`Editar ${row.name}`} title="Editar producto"
    onClick={() => onEdit(row.groupId)}
  >
    <i className="bi bi-pencil" />
  </button>
)

const InventoryTab = () => {
  const { isCentralAdmin, hasPermission } = useUser()
  const canEditProducts = hasPermission('products', 'update')
  const breakdownRef = useRef(null)

  const [rows,        setRows]        = useState([])
  const [rowsGroupBy, setRowsGroupBy] = useState('product')
  const [pagination,  setPagination]  = useState({ total: 0, page: 1, totalPages: 1 })
  const [summary,     setSummary]     = useState(EMPTY_SUMMARY)
  const [loadedAt,    setLoadedAt]    = useState(null)
  const [isLoading,   setIsLoading]   = useState(true)
  const [error,       setError]       = useState(null)

  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [categoryId,       setCategoryId]       = useState('')
  const [excludedIds,      setExcludedIds]      = useState([])
  const [providerId,       setProviderId]       = useState('')
  const [searchInput,      setSearchInput]      = useState('')
  const [search,           setSearch]           = useState('')
  const [groupBy,          setGroupBy]          = useState('product')
  const [alertView,        setAlertView]        = useState(null)
  const [sortBy,           setSortBy]           = useState('cost_value')
  const [sortDir,          setSortDir]          = useState('desc')
  const [excludeNoCost,    setExcludeNoCost]    = useState(false)
  const [page,             setPage]             = useState(1)
  // Producto abierto en el formulario, y un contador para volver a pedir la
  // valuación con los mismos parámetros después de guardarlo
  const [editing,          setEditing]          = useState(null)
  const [reloadKey,        setReloadKey]        = useState(0)

  const [branches,   setBranches]   = useState([])
  const [categories, setCategories] = useState([])
  const [providers,  setProviders]  = useState([])

  useEffect(() => {
    if (!isCentralAdmin) return
    api.get('branches?is_active=true').then(({ data }) => setBranches(data.data)).catch(() => {})
  }, [isCentralAdmin])

  useEffect(() => {
    api.get('categories?is_active=true&limit=all').then(({ data }) => setCategories(data.data)).catch(() => {})
    api.get('providers?is_active=true&limit=all').then(({ data }) => setProviders(data.data ?? data)).catch(() => {})
  }, [])

  // La búsqueda se manda cuando se deja de escribir
  useEffect(() => {
    const value = searchInput.trim()
    if (value === search) return
    const timer = setTimeout(() => { setSearch(value); setPage(1) }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [searchInput, search])

  // Agrupar por sucursal solo tiene sentido en el consolidado del admin central
  const canGroupByBranch = isCentralAdmin && !selectedBranchId
  const groups = GROUPS.filter(g => g.id !== 'branch' || canGroupByBranch)
  // La tabla se dibuja con la agrupación de las filas que ya llegaron: al
  // cambiarla, las filas viejas siguen en pantalla hasta que llega la respuesta
  const group  = GROUPS.find(g => g.id === rowsGroupBy)

  const query = useMemo(() => {
    const params = new URLSearchParams({
      group_by: groupBy, sort_by: sortBy, sort_dir: sortDir, page, limit: PAGE_SIZE,
    })
    if (isCentralAdmin && selectedBranchId) params.set('branch_id', selectedBranchId)
    if (categoryId)             params.set('category_id', categoryId)
    if (excludedIds.length > 0) params.set('exclude_category_ids', excludedIds.join(','))
    if (providerId)             params.set('provider_id', providerId)
    if (search)                 params.set('search', search)
    if (excludeNoCost)          params.set('exclude_no_cost', 'true')
    if (alertView)              params.set('alert', alertView)
    return params.toString()
  }, [groupBy, sortBy, sortDir, page, isCentralAdmin, selectedBranchId, categoryId, excludedIds,
    providerId, search, excludeNoCost, alertView])

  useEffect(() => {
    let ignore = false
    setIsLoading(true)
    setError(null)
    api.get(`reports/inventory?${query}`)
      .then(({ data }) => {
        if (ignore) return
        setRows(data.data)
        setRowsGroupBy(new URLSearchParams(query).get('group_by'))
        setPagination(data.pagination)
        setSummary(data.summary)
        setLoadedAt(new Date())
      })
      .catch((err) => {
        if (!ignore) setError(err.response?.data?.message ?? 'Error al cargar la valuación de inventario')
      })
      .finally(() => { if (!ignore) setIsLoading(false) })
    return () => { ignore = true }
  }, [query, reloadKey])

  // El formulario necesita el producto completo, como al editar desde Productos
  const openEdit = (productId) => {
    api.get(`products/${productId}`)
      .then(({ data }) => setEditing(data.data))
      .catch((err) => setError(err.response?.data?.message ?? 'No se pudo abrir el producto'))
  }
  const handleProductSaved = () => {
    setEditing(null)
    setReloadKey(k => k + 1)
  }

  // Cambiar cualquier filtro regresa a la página 1
  const withPageReset = (setter) => (value) => { setter(value); setPage(1) }
  const changeProvider      = withPageReset(setProviderId)
  const changeExcludeNoCost = withPageReset(setExcludeNoCost)
  const changeBranch = (value) => {
    setSelectedBranchId(value)
    if (value && groupBy === 'branch') setGroupBy('product')
    setPage(1)
  }
  // Excluir categorías solo se usa con "Todas las categorías"
  const changeCategory = (value) => {
    setCategoryId(value)
    if (value) setExcludedIds([])
    setPage(1)
  }
  const addExcluded    = (id) => { if (id) { setExcludedIds(ids => [...ids, id]); setPage(1) } }
  const removeExcluded = (id) => { setExcludedIds(ids => ids.filter(x => x !== id)); setPage(1) }
  // La vista de una alerta es por producto
  const changeGroupBy = (value) => {
    setGroupBy(value)
    if (value !== 'product') setAlertView(null)
    setPage(1)
  }
  const changeSort = (next) => {
    setSortBy(next.sortBy)
    setSortDir(next.sortDir)
    setPage(1)
  }
  const sortByColumn = (id) => changeSort(nextSort({ sortBy, sortDir }, id))
  // Ver los artículos sin costo con su exclusión encendida la apaga
  const selectAlert = (id) => {
    if (alertView === id) { setAlertView(null); setPage(1); return }
    setAlertView(id)
    setGroupBy('product')
    if (id === 'no_cost') setExcludeNoCost(false)
    setPage(1)
    breakdownRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }
  const clearAlert = () => { setAlertView(null); setPage(1) }

  const isProduct    = rowsGroupBy === 'product'
  const showEdit     = isProduct && canEditProducts
  const activeAlert  = ALERTS.find(a => a.id === alertView)
  const categoryName = (id) => categories.find(c => String(c.category_id) === id)?.name ?? `Categoría ${id}`
  const excludable   = categories.filter(c => !excludedIds.includes(String(c.category_id)))
  const activeFilters = [selectedBranchId, categoryId, providerId].filter(Boolean).length
    + excludedIds.length + (excludeNoCost ? 1 : 0)
  const { available, reserved, total, alerts } = summary

  return (
    <div className="rpt-panel">
      {/* ── 1. Filtros: cambian todo lo de abajo ── */}
      <FilterCard
        activeCount={activeFilters}
        top={(
          <div className="rpt-search">
            <i className="bi bi-search" aria-hidden="true" />
            <input
              type="search" className="rpt-select" aria-label="Buscar"
              placeholder="Buscar por nombre o SKU"
              value={searchInput} onChange={e => setSearchInput(e.target.value)}
            />
          </div>
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

          <select
            className="rpt-select" aria-label="Proveedor"
            value={providerId} onChange={e => changeProvider(e.target.value)}
          >
            <option value="">Todos los proveedores</option>
            {providers.map(p => (
              <option key={p.provider_id} value={p.provider_id}>{p.name}</option>
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
            Productos sin costo
          </button>
          <select
            className="rpt-select rpt-select--sm" aria-label="Excluir categoría"
            value="" disabled={Boolean(categoryId)}
            title={categoryId ? 'Para excluir categorías elige "Todas las categorías"' : undefined}
            onChange={e => addExcluded(e.target.value)}
          >
            <option value="">+ Categoría…</option>
            {excludable.map(c => (
              <option key={c.category_id} value={c.category_id}>{c.name}</option>
            ))}
          </select>
          {excludedIds.map(id => (
            <button
              key={id} type="button" className="rpt-chip"
              aria-label={`Quitar exclusión de ${categoryName(id)}`}
              onClick={() => removeExcluded(id)}
            >
              {categoryName(id)} <i className="bi bi-x" />
            </button>
          ))}
        </div>
      </FilterCard>

      {/* ── 2. Resumen del disponible ── */}
      <section className="rpt-summary" aria-label="Resumen del inventario">
        <div className="rpt-summary__main">
          <div className="rpt-stat rpt-stat--hero">
            <span className="rpt-stat__label">Valor del inventario al costo</span>
            <span className="rpt-stat__value">{money(available.costValue)}</span>
            <span className="rpt-stat__sub">
              <span title="Cada variante cuenta como un artículo">{fmtItems(available.items)}</span>
              {' · '}{fmtUnitList(available.units)}
            </span>
          </div>
          <div className="rpt-stat">
            <span className="rpt-stat__label">A precio de venta</span>
            <span className="rpt-stat__value">{money(available.saleValue)}</span>
          </div>
          <div className="rpt-stat">
            <span className="rpt-stat__label">Utilidad estimada</span>
            <span className="rpt-stat__value"><Profit value={available.profit} /></span>
            <span className="rpt-stat__sub">Margen {fmtMargin(available.margin)}</span>
          </div>
        </div>

        {!excludeNoCost && summary.noCost.items > 0 && (
          <SummaryNote actionLabel="Excluirlos" onAction={() => changeExcludeNoCost(true)}>
            La utilidad incluye {fmtItems(summary.noCost.items)} sin costo, que valen{' '}
            {money(summary.noCost.saleValue)} a precio de venta y cuentan como ganancia completa.
          </SummaryNote>
        )}
        {excludeNoCost && alerts.noCost.items > 0 && (
          <SummaryNote tone="info" actionLabel="Incluirlos" onAction={() => changeExcludeNoCost(false)}>
            No se están contando {fmtItems(alerts.noCost.items)} sin costo.
          </SummaryNote>
        )}

        <div className="rpt-summary__foot">
          <div className="rpt-summary__lines">
            {reserved.items === 0 ? (
              <span><i className="bi bi-bag" aria-hidden="true" /> Sin apartados activos</span>
            ) : (
              <>
                <span>
                  <strong>Apartado</strong>
                  {fmtItems(reserved.items)} · {fmtUnitList(reserved.units)} · {money(reserved.costValue)} al
                  costo · {money(reserved.saleValue)} a venta
                </span>
                <span>
                  <strong>Total en tienda</strong>
                  {fmtItems(total.items)} · {fmtUnitList(total.units)} · {money(total.costValue)} al
                  costo · {money(total.saleValue)} a venta
                </span>
              </>
            )}
          </div>
          <span className="rpt-summary__asof">
            Existencias y precios al {loadedAt ? fmtDateTime(loadedAt) : '…'}
          </span>
        </div>
      </section>

      {/* ── 3. Revisar captura ── */}
      <section className="rpt-inv-review" aria-label="Revisar captura">
        <h2 className="rpt-section-title">Revisar captura</h2>
        <div className="rpt-inv-review__list">
          {ALERTS.map(a => {
            const data = alerts[a.key]
            return (
              <button
                key={a.id}
                type="button"
                className={`rpt-inv-issue ${alertView === a.id ? 'rpt-inv-issue--active' : ''}`}
                aria-pressed={alertView === a.id}
                disabled={data.items === 0}
                onClick={() => selectAlert(a.id)}
              >
                <span className="rpt-inv-issue__icon"><i className={`bi ${a.icon}`} aria-hidden="true" /></span>
                <span className="rpt-inv-issue__text">
                  <span className="rpt-inv-issue__label">{a.label}</span>
                  <strong>{fmtItems(data.items)}</strong>
                  <small>{money(data[a.amount])} {a.amountLabel}</small>
                </span>
                <i className="bi bi-chevron-right" aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </section>

      {/* ── 4. Desglose ── */}
      <section className="rpt-section" aria-label="Desglose" ref={breakdownRef}>
        <div className="rpt-section__head">
          <h2 className="rpt-section-title">Desglose</h2>
          <ButtonGroup label="Ver por" options={groups} value={groupBy} onChange={changeGroupBy} />
          <span className="rpt-section__count">
            {pagination.total.toLocaleString('es-MX')} {pagination.total === 1 ? group.label.toLowerCase() : group.plural}
          </span>
          <SortSelect sorts={SORTS} sortBy={sortBy} sortDir={sortDir} onChange={changeSort} />
        </div>

        {activeAlert && (
          <div className="rpt-inv-viewing" role="status">
            <i className={`bi ${activeAlert.icon}`} aria-hidden="true" />
            <span>
              Mostrando solo: <strong>{activeAlert.label}</strong>. El resumen de arriba no cambia.
            </span>
            <button type="button" onClick={clearAlert}>Ver todos</button>
          </div>
        )}

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
            <i className="bi bi-box-seam" />
            <span>No hay artículos con stock con estos filtros</span>
          </div>
        ) : (
          <>
            {/* ── Tabla (desktop) ── */}
            <div className="rpt-table-wrap">
              <table className="rpt-table rpt-table--static" aria-label="Valuación por grupo">
                <thead>
                  <tr>
                    <th>{group.label}</th>
                    <th className="num">{isProduct ? 'Unidades' : 'Artículos'}</th>
                    {SORTS.map(s => (
                      <SortHeader key={s.id} sort={s} sortBy={sortBy} sortDir={sortDir} onSort={sortByColumn} />
                    ))}
                    {showEdit && <th aria-label="Acciones" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.groupId ?? 'none'}>
                      <td>
                        <div className="rpt-group-name">
                          <span className="rpt-folio">{r.name}</span>
                          <NoCostFlag row={r} isProduct={isProduct} />
                        </div>
                        {isProduct && showSku(r) && <span className="rpt-td-muted">{r.sku}</span>}
                      </td>
                      <td className="num">{isProduct ? fmtUnits(r.units, r.uom) : r.items.toLocaleString('es-MX')}</td>
                      <td className="num"><CostValue row={r} isProduct={isProduct} /></td>
                      <td className="num">{money(r.saleValue)}</td>
                      <td className="num"><Profit value={r.profit} /></td>
                      <td className="num"><Margin value={r.margin} /></td>
                      {showEdit && (
                        <td className="num">
                          <EditButton row={r} onEdit={openEdit} />
                        </td>
                      )}
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
                    <NoCostFlag row={r} isProduct={isProduct} />
                    {showEdit && <EditButton row={r} onEdit={openEdit} />}
                  </div>
                  <div className="rpt-card__meta">
                    <span className="rpt-muted">
                      <i className={`bi ${group.icon}`} />
                      {isProduct ? fmtUnits(r.units, r.uom) : fmtItems(r.items)}
                    </span>
                    <span className="rpt-muted">
                      Costo <CostValue row={r} isProduct={isProduct} /> · Venta {money(r.saleValue)}
                    </span>
                  </div>
                  <div className="rpt-card__total">
                    <span className="rpt-muted">Utilidad · <Margin value={r.margin} /></span>
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
      </section>

      {editing && (
        <div className="prd-root">
          <ProductModal
            product={editing}
            categories={categories}
            providers={providers}
            onSaved={handleProductSaved}
            onClose={() => setEditing(null)}
          />
        </div>
      )}
    </div>
  )
}

export default InventoryTab
