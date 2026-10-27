// src/components/Reports/tabs/RotationTab.jsx
// Rotación de inventario: productos con stock que llevan N días o más sin
// venderse en su sucursal, cuánto dinero tienen detenido y una sugerencia
// para moverlos (specs/10-rotacion-de-inventario.md). Los cálculos y las
// sugerencias los hace el backend (GET /reports/rotation); aquí solo se
// filtra y se muestra.
//
// De arriba abajo: filtros (cambian todo lo de abajo), resumen y la lista.
// Las sugerencias son informativas (decisión #28): el traspaso se crea en
// Inventario, y el precio o el costo se cambian con el botón Editar de cada
// fila (requisito 37) o en Productos.
import { useState, useEffect, useMemo } from 'react'
import { useUser } from '../../../context/UserContext'
import api from '../../../services/api'
import { fmtDateTime } from '../../../utils/dateFormatter'
import { fmtRangeLabel } from '../../../utils/dateRanges'
import FilterCard from '../components/FilterCard'
import ButtonGroup from '../components/ButtonGroup'
import SummaryNote from '../components/SummaryNote'
import { SortHeader, SortSelect, nextSort } from '../components/Sorting'
import { EditButton, useProductEdit } from '../components/ProductEdit'

const PAGE_SIZE = 20
const SEARCH_DELAY_MS = 300

// Días sin venta (decisión #23)
const DAYS = [30, 60, 90, 180].map(d => ({ id: d, label: `${d} días` }))

// Columnas ordenables; en móvil, el selector usa `more` y `less`
const SORTS = {
  cost_value: { id: 'cost_value', label: 'Valor al costo', more: 'Mayor valor al costo', less: 'Menor valor al costo' },
  days:       { id: 'days',       label: 'Días sin venta', more: 'Más días sin venta',   less: 'Menos días sin venta' },
}

const EMPTY_SUMMARY = {
  days: 30, products: 0, neverSold: 0, units: [], costValue: 0, saleValue: 0, availableCostValue: 0, share: null,
  noCost: { products: 0, saleValue: 0 },
}

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const fmtNumber = (n) => Number(n).toLocaleString('es-MX', { maximumFractionDigits: 3 })

const fmtPercent = (n) => `${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`

const uomLabel = (uom) => uom ?? 'sin unidad'

const fmtUnits = (units, uom) => `${fmtNumber(units)} ${uomLabel(uom)}`

// [{ uom: 'pza', quantity: 7062 }, { uom: 'par', quantity: 535 }] → "7,062 pza · 535 par"
const fmtUnitList = (units) =>
  units.length === 0 ? '0 unidades' : units.map(u => fmtUnits(u.quantity, u.uom)).join(' · ')

const plural = (n, word) => `${n.toLocaleString('es-MX')} ${word}${n !== 1 ? 's' : ''}`

// El SKU no se repite si es igual al nombre
const showSku = (row) => row.sku && row.sku.trim().toLowerCase() !== row.name.trim().toLowerCase()

// "A", "A y B", "A, B y C"; cada nombre se recorta y se ve completo al pasar el cursor
const NameList = ({ items }) => items.map((p, i) => (
  <span key={p.productId}>
    {i > 0 && (i === items.length - 1 ? ' y ' : ', ')}
    <span className="rpt-rot-name" title={p.name}>{p.name}</span>
  </span>
))

const LastSale = ({ row }) =>
  row.neverSold
    ? <span className="rpt-td-muted">Nunca vendido</span>
    : fmtRangeLabel(row.lastSale, row.lastSale)

// Un producto sin costo muestra "$0.00" en naranja, como en Productos
const CostValue = ({ row }) =>
  row.costPrice === 0
    ? <span className="rpt-no-cost" title="Sin costo">{money(row.costValue)}</span>
    : money(row.costValue)

const NO_DISCOUNT = {
  no_cost:              'Captura el costo para calcular la rebaja',
  price_not_above_cost: 'Sin rebaja: el precio no supera el costo',
}

// Traspaso, rebaja y promoción, en ese orden; si no aplica ninguna, el aviso
// de ubicación (requisitos 22–26)
const Suggestions = ({ row, days }) => {
  const { transfer, discount, promotion } = row.suggestions
  const hasDiscount = discount.reason === null
  return (
    <ul className="rpt-rot-suggestions" aria-label={`Sugerencias para ${row.name}`}>
      {transfer && (
        <li>
          <i className="bi bi-arrow-left-right" aria-hidden="true" />
          <span>Traspasar a <strong>{transfer.name}</strong>: {plural(transfer.sales, 'venta')} en {days} días</span>
        </li>
      )}
      {hasDiscount ? (
        <li>
          <i className="bi bi-tag" aria-hidden="true" />
          <span>
            Rebajar de {money(discount.price)} a <strong>{money(discount.suggestedPrice)}</strong>{' '}
            (−{fmtPercent(discount.percent)}){discount.cappedByCost && ', hasta el costo, sin utilidad'}
          </span>
        </li>
      ) : (
        <li className="rpt-rot-muted">
          <i className="bi bi-tag" aria-hidden="true" />
          <span>{NO_DISCOUNT[discount.reason]}</span>
        </li>
      )}
      {promotion.length > 0 && (
        <li>
          <i className="bi bi-gift" aria-hidden="true" />
          <span>Promoción con: <NameList items={promotion} /></span>
        </li>
      )}
      {!transfer && !hasDiscount && promotion.length === 0 && (
        <li>
          <i className="bi bi-geo-alt" aria-hidden="true" />
          <span>Ubícalo en un lugar más visible o promociónalo</span>
        </li>
      )}
    </ul>
  )
}

const RotationTab = () => {
  const { isCentralAdmin, hasPermission } = useUser()
  const canEditProducts = hasPermission('products', 'update')

  const [rows,       setRows]       = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  const [summary,    setSummary]    = useState(EMPTY_SUMMARY)
  const [loadedAt,   setLoadedAt]   = useState(null)
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)

  const [days,             setDays]             = useState(30)
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [categoryId,       setCategoryId]       = useState('')
  const [excludedIds,      setExcludedIds]      = useState([])
  const [providerId,       setProviderId]       = useState('')
  const [searchInput,      setSearchInput]      = useState('')
  const [search,           setSearch]           = useState('')
  const [sortBy,           setSortBy]           = useState('cost_value')
  const [sortDir,          setSortDir]          = useState('desc')
  const [excludeNoCost,    setExcludeNoCost]    = useState(false)
  const [page,             setPage]             = useState(1)
  // Contador para volver a pedir la rotación con los mismos parámetros
  // después de guardar un producto
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

  const query = useMemo(() => {
    const params = new URLSearchParams({ days, sort_by: sortBy, sort_dir: sortDir, page, limit: PAGE_SIZE })
    if (isCentralAdmin && selectedBranchId) params.set('branch_id', selectedBranchId)
    if (categoryId)             params.set('category_id', categoryId)
    if (excludedIds.length > 0) params.set('exclude_category_ids', excludedIds.join(','))
    if (providerId)             params.set('provider_id', providerId)
    if (search)                 params.set('search', search)
    if (excludeNoCost)          params.set('exclude_no_cost', 'true')
    return params.toString()
  }, [days, sortBy, sortDir, page, isCentralAdmin, selectedBranchId, categoryId, excludedIds,
    providerId, search, excludeNoCost])

  useEffect(() => {
    let ignore = false
    setIsLoading(true)
    setError(null)
    api.get(`reports/rotation?${query}`)
      .then(({ data }) => {
        if (ignore) return
        setRows(data.data)
        setPagination(data.pagination)
        setSummary(data.summary)
        setLoadedAt(new Date())
      })
      .catch((err) => {
        if (!ignore) setError(err.response?.data?.message ?? 'Error al cargar la rotación de inventario')
      })
      .finally(() => { if (!ignore) setIsLoading(false) })
    return () => { ignore = true }
  }, [query, reloadKey])

  const { openEdit, editForm } = useProductEdit({
    categories, providers, onSaved: () => setReloadKey(k => k + 1), onError: setError,
  })

  // Cambiar cualquier filtro o el orden regresa a la página 1
  const withPageReset = (setter) => (value) => { setter(value); setPage(1) }
  const changeDays          = withPageReset(setDays)
  const changeBranch        = withPageReset(setSelectedBranchId)
  const changeProvider      = withPageReset(setProviderId)
  const changeExcludeNoCost = withPageReset(setExcludeNoCost)
  // Excluir categorías solo se usa con "Todas las categorías"
  const changeCategory = (value) => {
    setCategoryId(value)
    if (value) setExcludedIds([])
    setPage(1)
  }
  const addExcluded    = (id) => { if (id) { setExcludedIds(ids => [...ids, id]); setPage(1) } }
  const removeExcluded = (id) => { setExcludedIds(ids => ids.filter(x => x !== id)); setPage(1) }
  const changeSort = (next) => {
    setSortBy(next.sortBy)
    setSortDir(next.sortDir)
    setPage(1)
  }
  const sortByColumn = (id) => changeSort(nextSort({ sortBy, sortDir }, id))

  // La sucursal de cada fila solo hace falta en el consolidado del admin central
  const showBranch   = isCentralAdmin && !selectedBranchId
  const categoryName = (id) => categories.find(c => String(c.category_id) === id)?.name ?? `Categoría ${id}`
  const excludable   = categories.filter(c => !excludedIds.includes(String(c.category_id)))
  const activeFilters = [selectedBranchId, categoryId, providerId, search].filter(Boolean).length
    + excludedIds.length + (excludeNoCost ? 1 : 0)
  // Los textos usan los días de la respuesta, no los del botón mientras carga
  const shownDays = summary.days

  return (
    <div className="rpt-panel rpt-rot">
      {/* ── 1. Filtros: cambian todo lo de abajo ── */}
      <FilterCard
        activeCount={activeFilters}
        top={<ButtonGroup label="Días sin venta" caption="Sin venta en" options={DAYS} value={days} onChange={changeDays} />}
      >
        <div className="rpt-filter-card__row">
          <div className="rpt-search">
            <i className="bi bi-search" aria-hidden="true" />
            <input
              type="search" className="rpt-select" aria-label="Buscar"
              placeholder="Buscar por nombre o SKU"
              value={searchInput} onChange={e => setSearchInput(e.target.value)}
            />
          </div>

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

      {/* ── 2. Resumen ── */}
      <section className="rpt-summary" aria-label="Resumen de la rotación">
        <div className="rpt-summary__main">
          <div className="rpt-stat rpt-stat--hero">
            <span className="rpt-stat__label">Valor detenido al costo</span>
            <span className="rpt-stat__value">{money(summary.costValue)}</span>
            <span className="rpt-stat__sub">
              {plural(summary.products, 'producto')} sin venta en {shownDays} días o más
              {' · '}{summary.neverSold.toLocaleString('es-MX')} nunca vendido{summary.neverSold !== 1 ? 's' : ''}
            </span>
            <span className="rpt-stat__sub">{fmtUnitList(summary.units)}</span>
          </div>
          <div className="rpt-stat">
            <span className="rpt-stat__label">A precio de venta</span>
            <span className="rpt-stat__value">{money(summary.saleValue)}</span>
          </div>
          <div className="rpt-stat">
            <span className="rpt-stat__label">Parte del inventario</span>
            <span className="rpt-stat__value">{summary.share === null ? '—' : fmtPercent(summary.share)}</span>
            <span className="rpt-stat__sub">del inventario al costo ({money(summary.availableCostValue)})</span>
          </div>
        </div>

        {!excludeNoCost && summary.noCost.products > 0 && (
          <SummaryNote actionLabel="Excluirlos" onAction={() => changeExcludeNoCost(true)}>
            {plural(summary.noCost.products, 'producto')} sin costo cuentan $0 en el valor detenido; valen{' '}
            {money(summary.noCost.saleValue)} a precio de venta y no tienen rebaja sugerida.
          </SummaryNote>
        )}
        {excludeNoCost && summary.noCost.products > 0 && (
          <SummaryNote tone="info" actionLabel="Incluirlos" onAction={() => changeExcludeNoCost(false)}>
            No se están contando {plural(summary.noCost.products, 'producto')} sin costo.
          </SummaryNote>
        )}

        <div className="rpt-summary__foot">
          <span className="rpt-summary__asof">
            Existencias y precios al {loadedAt ? fmtDateTime(loadedAt) : '…'}
          </span>
        </div>
      </section>

      {/* ── 3. Lista ── */}
      <section className="rpt-section" aria-label="Productos sin movimiento">
        <div className="rpt-section__head">
          <h2 className="rpt-section-title">Productos sin movimiento</h2>
          <span className="rpt-section__count">{plural(pagination.total, 'producto')}</span>
          <SortSelect sorts={[SORTS.cost_value, SORTS.days]} sortBy={sortBy} sortDir={sortDir} onChange={changeSort} />
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
            <i className="bi bi-box-seam" />
            <span>No hay productos sin venta en {shownDays} días o más con estos filtros</span>
          </div>
        ) : (
          <>
            <div className="rpt-notice" role="note">
              <i className="bi bi-lightbulb" aria-hidden="true" />
              <span>
                Estos productos llevan {shownDays} días o más sin venderse: ubícalos en un lugar más visible o
                promociónalos.
              </span>
            </div>

            {/* ── Tabla (desktop) ── */}
            <div className="rpt-table-wrap">
              <table className="rpt-table rpt-table--static rpt-rot-table" aria-label="Productos sin movimiento">
                <thead>
                  <tr>
                    <th>Producto</th>
                    {showBranch && <th>Sucursal</th>}
                    <th>Última venta</th>
                    <SortHeader sort={SORTS.days} sortBy={sortBy} sortDir={sortDir} onSort={sortByColumn} />
                    <th className="num">Stock</th>
                    <SortHeader sort={SORTS.cost_value} sortBy={sortBy} sortDir={sortDir} onSort={sortByColumn} />
                    <th>Sugerencias</th>
                    {canEditProducts && <th aria-label="Acciones" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={`${r.branchId}-${r.productId}`}>
                      <td>
                        <span className="rpt-folio">{r.name}</span>
                        {showSku(r) && <span className="rpt-td-muted rpt-rot-sku">{r.sku}</span>}
                      </td>
                      {showBranch && <td>{r.branchName}</td>}
                      <td><LastSale row={r} /></td>
                      <td className="num">{r.days.toLocaleString('es-MX')}</td>
                      <td className="num">{fmtUnits(r.units, r.uom)}</td>
                      <td className="num"><CostValue row={r} /></td>
                      <td><Suggestions row={r} days={shownDays} /></td>
                      {canEditProducts && (
                        <td className="num">
                          <EditButton name={r.name} onClick={() => openEdit(r.productId)} />
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
                <div key={`${r.branchId}-${r.productId}`} className="rpt-card rpt-card--static">
                  <div className="rpt-card__top">
                    <span className="rpt-folio">{r.name}</span>
                    {canEditProducts && <EditButton name={r.name} onClick={() => openEdit(r.productId)} />}
                  </div>
                  <div className="rpt-card__meta">
                    {showBranch && (
                      <span className="rpt-muted"><i className="bi bi-shop" />{r.branchName}</span>
                    )}
                    <span className="rpt-muted">
                      <i className="bi bi-clock-history" />
                      {r.days.toLocaleString('es-MX')} días sin venta · Última venta: <LastSale row={r} />
                    </span>
                    <span className="rpt-muted">
                      <i className="bi bi-box" />
                      {fmtUnits(r.units, r.uom)} · Costo <CostValue row={r} />
                    </span>
                  </div>
                  <Suggestions row={r} days={shownDays} />
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

      {editForm}
    </div>
  )
}

export default RotationTab
