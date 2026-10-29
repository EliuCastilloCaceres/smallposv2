// src/components/Purchases/Purchases.jsx
// Módulo Compras (specs/14-modulo-de-compras.md, requisitos 29–34): filtros
// arriba, el total de las compras activas del filtro, la lista paginada
// (tabla en desktop y tarjetas en móvil), el formulario de nueva compra y el
// detalle con la cancelación. El reporte por proveedor va en la spec 15.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useUser } from '../../context/UserContext'
import api from '../../services/api'
import { DATE_PRESETS, getPresetRange, today, fmtRangeLabel } from '../../utils/dateRanges'
import { money, fmtPurchaseDate } from './purchaseForm'
import PurchaseFormModal from './modals/PurchaseFormModal'
import PurchaseDetailModal from './modals/PurchaseDetailModal'
import './purchases.css'

const PAGE_SIZE = 20

const STATUSES = [
  { id: 'active',    label: 'Activas' },
  { id: 'cancelled', label: 'Canceladas' },
  { id: 'all',       label: 'Todas' },
]

const EMPTY_OPTIONS = { payment_methods: [], providers: [], registers: [], branches: [] }

const fmtCount = (n) => `${n.toLocaleString('es-MX')} compra${n !== 1 ? 's' : ''} activa${n !== 1 ? 's' : ''}`
const fmtItems = (n) => `${n} producto${n !== 1 ? 's' : ''}`

// Método de pago, con la marca "Desde caja"
const MethodCell = ({ purchase }) => (
  <>
    {purchase.payment_method_name}
    {purchase.paid_from_register && (
      <>{' '}<span className="pur-tag pur-tag--register"><i className="bi bi-cash-stack" />Desde caja</span></>
    )}
  </>
)

const Purchases = () => {
  const { isCentralAdmin, hasPermission } = useUser()
  const canCreate = hasPermission('purchases', 'create')
  const canCancel = hasPermission('purchases', 'cancel')

  const [purchases,  setPurchases]  = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  const [summary,    setSummary]    = useState({ count: 0, total_amount: 0 })
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)
  const [options,    setOptions]    = useState(EMPTY_OPTIONS)

  // Filtros — rango por defecto: este mes
  const [preset,          setPreset]          = useState('month')
  const [customRange,     setCustomRange]     = useState({ start: today(), end: today() })
  const [branchId,        setBranchId]        = useState('')
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [providerId,      setProviderId]      = useState('')
  const [status,          setStatus]          = useState('active')
  const [searchInput,     setSearchInput]     = useState('')
  const [search,          setSearch]          = useState('')
  const [page,            setPage]            = useState(1)
  const [filtersOpen,     setFiltersOpen]     = useState(false)
  const [reloadKey,       setReloadKey]       = useState(0)

  const [showForm, setShowForm] = useState(false)
  const [detailId, setDetailId] = useState(null)

  const searchTimer = useRef(null)
  useEffect(() => () => clearTimeout(searchTimer.current), [])

  useEffect(() => {
    api.get('purchases/options')
      .then(({ data }) => setOptions({ ...EMPTY_OPTIONS, ...data.data }))
      .catch(() => {})
  }, [])

  const { start, end } = useMemo(() => getPresetRange(preset, customRange), [preset, customRange])

  const query = useMemo(() => {
    const params = new URLSearchParams({ start_date: start, end_date: end, status, page, limit: PAGE_SIZE })
    if (isCentralAdmin && branchId) params.set('branch_id', branchId)
    if (paymentMethodId) params.set('payment_method_id', paymentMethodId)
    if (providerId)      params.set('provider_id', providerId)
    if (search)          params.set('search', search)
    return params.toString()
  }, [start, end, status, page, isCentralAdmin, branchId, paymentMethodId, providerId, search])

  useEffect(() => {
    let ignore = false
    setIsLoading(true)
    setError(null)
    api.get(`purchases?${query}`)
      .then(({ data }) => {
        if (ignore) return
        setPurchases(data.data)
        setPagination(data.pagination)
        setSummary(data.summary)
      })
      .catch(err => { if (!ignore) setError(err.response?.data?.message ?? 'Error al cargar las compras') })
      .finally(() => { if (!ignore) setIsLoading(false) })
    return () => { ignore = true }
  }, [query, reloadKey])

  // Cambiar cualquier filtro regresa a la página 1
  const withPageReset = (setter) => (value) => { setter(value); setPage(1) }
  const changePreset   = withPageReset(setPreset)
  const changeCustom   = withPageReset(setCustomRange)
  const changeBranch   = withPageReset(setBranchId)
  const changeMethod   = withPageReset(setPaymentMethodId)
  const changeProvider = withPageReset(setProviderId)
  const changeStatus   = withPageReset(setStatus)

  const changeSearch = (value) => {
    setSearchInput(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setSearch(value.trim()); setPage(1) }, 400)
  }

  const reload = () => setReloadKey(k => k + 1)

  const handleSaved = () => {
    setShowForm(false)
    setPage(1)
    reload()
  }

  const isConsolidated = isCentralAdmin && !branchId
  const activeFilters = [branchId, paymentMethodId, providerId, search].filter(Boolean).length
    + (status !== 'active' ? 1 : 0)

  return (
    <div className="pur-root">
      {/* ── Header ── */}
      <div className="pur-header">
        <div>
          <h1 className="pur-header__title">Compras</h1>
          <span className="pur-header__sub">Lo que se compra a cada proveedor, con su costo</span>
        </div>
        {canCreate && (
          <button type="button" className="pur-btn pur-btn--primary" onClick={() => setShowForm(true)}>
            <i className="bi bi-plus-lg" /> Nueva compra
          </button>
        )}
      </div>

      {/* ── Filtros ── */}
      <section className="pur-filter-card" aria-label="Filtros">
        <div className="pur-filter-card__top">
          <div className="pur-presets" role="tablist" aria-label="Periodo">
            {DATE_PRESETS.map(p => (
              <button key={p.id} type="button" role="tab" aria-selected={preset === p.id}
                className={`pur-preset ${preset === p.id ? 'pur-preset--active' : ''}`}
                onClick={() => changePreset(p.id)}>
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <>
              <input type="date" className="pur-select" aria-label="Fecha inicial"
                value={customRange.start} max={customRange.end}
                onChange={e => changeCustom({ ...customRange, start: e.target.value })} />
              <input type="date" className="pur-select" aria-label="Fecha final"
                value={customRange.end} min={customRange.start} max={today()}
                onChange={e => changeCustom({ ...customRange, end: e.target.value })} />
            </>
          )}

          <span className="pur-period-label">
            <i className="bi bi-calendar3" aria-hidden="true" />
            {fmtRangeLabel(start, end)}
          </span>

          <button type="button" className="pur-toggle pur-only-mobile"
            aria-expanded={filtersOpen} onClick={() => setFiltersOpen(v => !v)}>
            <i className="bi bi-sliders" /> Filtros
            {activeFilters > 0 && <span className="pur-badge" aria-label={`${activeFilters} activos`}>{activeFilters}</span>}
          </button>
        </div>

        <div className={`pur-filter-card__body ${filtersOpen ? 'pur-filter-card__body--open' : ''}`}>
          <div className="pur-search">
            <i className="bi bi-search" />
            <input type="search" className="pur-select" aria-label="Buscar por folio, notas o producto"
              placeholder="Buscar por folio, notas o producto..."
              value={searchInput} onChange={e => changeSearch(e.target.value)} />
          </div>

          {isCentralAdmin && (
            <select className="pur-select" aria-label="Sucursal" value={branchId} onChange={e => changeBranch(e.target.value)}>
              <option value="">Todas las sucursales</option>
              {options.branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.name}</option>)}
            </select>
          )}

          <select className="pur-select" aria-label="Proveedor" value={providerId} onChange={e => changeProvider(e.target.value)}>
            <option value="">Todos los proveedores</option>
            {options.providers.map(p => <option key={p.provider_id} value={p.provider_id}>{p.name}</option>)}
          </select>

          <select className="pur-select" aria-label="Método de pago" value={paymentMethodId} onChange={e => changeMethod(e.target.value)}>
            <option value="">Todos los métodos</option>
            {options.payment_methods.map(m => (
              <option key={m.payment_method_id} value={m.payment_method_id}>{m.name}</option>
            ))}
          </select>

          <select className="pur-select" aria-label="Estado" value={status} onChange={e => changeStatus(e.target.value)}>
            {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </section>

      {/* ── Total de las activas del filtro ── */}
      <section className="pur-summary" aria-label="Total de compras">
        <div>
          <span className="pur-summary__label">Total de compras activas</span>
          <span className="pur-summary__value">{money(summary.total_amount)}</span>
        </div>
        <span className="pur-summary__count">{fmtCount(summary.count)}</span>
      </section>

      {error && (
        <div className="pur-alert" role="alert">
          <i className="bi bi-exclamation-circle" />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Cerrar aviso"><i className="bi bi-x" /></button>
        </div>
      )}

      {/* ── Lista ── */}
      {isLoading ? (
        <div className="pur-skeleton">
          {[...Array(5)].map((_, i) => <div key={i} className="pur-skeleton__row" />)}
        </div>
      ) : purchases.length === 0 ? (
        <div className="pur-empty">
          <i className="bi bi-cart-check" />
          <span>No hay compras con estos filtros</span>
        </div>
      ) : (
        <>
          <div className="pur-table-wrap">
            <table className="pur-table" aria-label="Compras">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Productos</th>
                  <th>Método</th>
                  {isConsolidated && <th>Sucursal</th>}
                  <th className="num">Total</th>
                  <th aria-label="Comprobante" />
                </tr>
              </thead>
              <tbody>
                {purchases.map(p => (
                  <tr key={p.purchase_id} onClick={() => setDetailId(p.purchase_id)}
                    className={p.status === 'cancelled' ? 'pur-row--cancelled' : ''}>
                    <td className="pur-td-muted">{fmtPurchaseDate(p.purchase_date)}</td>
                    <td>
                      <span className="pur-desc">{p.provider_name}</span>
                      {p.status === 'cancelled' && <>{' '}<span className="pur-tag pur-tag--cancelled">Cancelada</span></>}
                      {p.folio && <span className="pur-folio">Folio {p.folio}</span>}
                    </td>
                    <td className="pur-td-muted">{fmtItems(p.item_count)}</td>
                    <td className="pur-td-muted"><MethodCell purchase={p} /></td>
                    {isConsolidated && <td className="pur-td-muted">{p.branch_name}</td>}
                    <td className="num"><span className="pur-amount">{money(p.total)}</span></td>
                    <td>
                      {p.has_receipt && <i className="bi bi-paperclip pur-receipt-icon" title="Con comprobante" aria-label="Con comprobante" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pur-cards">
            {purchases.map(p => (
              <button key={p.purchase_id} type="button" onClick={() => setDetailId(p.purchase_id)}
                className={`pur-card ${p.status === 'cancelled' ? 'pur-row--cancelled' : ''}`}>
                <div className="pur-card__top">
                  <span className="pur-desc">{p.provider_name}</span>
                  {p.status === 'cancelled' && <span className="pur-tag pur-tag--cancelled">Cancelada</span>}
                </div>
                <div className="pur-card__meta">
                  <span>{fmtPurchaseDate(p.purchase_date)}</span>
                  <span>{fmtItems(p.item_count)}</span>
                  {p.folio && <span>Folio {p.folio}</span>}
                  {isConsolidated && <span>{p.branch_name}</span>}
                  {p.has_receipt && <i className="bi bi-paperclip" aria-label="Con comprobante" />}
                </div>
                <div className="pur-card__total">
                  <span className="pur-td-muted"><MethodCell purchase={p} /></span>
                  <strong className="pur-amount">{money(p.total)}</strong>
                </div>
              </button>
            ))}
          </div>

          {pagination.totalPages > 1 && (
            <div className="pur-pagination">
              <button type="button" className="pur-btn pur-btn--ghost pur-btn--icon" aria-label="Página anterior"
                onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                <i className="bi bi-chevron-left" />
              </button>
              <span className="pur-pagination__info">
                Página <strong>{page}</strong> de <strong>{pagination.totalPages}</strong>
              </span>
              <button type="button" className="pur-btn pur-btn--ghost pur-btn--icon" aria-label="Página siguiente"
                onClick={() => setPage(p => p + 1)} disabled={page === pagination.totalPages}>
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          )}
        </>
      )}

      {showForm && (
        <PurchaseFormModal
          options={options}
          isCentralAdmin={isCentralAdmin}
          onSaved={handleSaved}
          onClose={() => setShowForm(false)}
        />
      )}

      {detailId && (
        <PurchaseDetailModal
          purchaseId={detailId}
          canCancel={canCancel}
          canAttach={canCreate}
          onCancelled={reload}
          onReceiptSaved={reload}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  )
}

export default Purchases
