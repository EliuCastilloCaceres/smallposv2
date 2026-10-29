// src/components/Expenses/Expenses.jsx
// Módulo Gastos (specs/12-modulo-de-gastos.md, requisitos 22–27): filtros
// arriba, el total de los gastos activos del filtro, la lista paginada (tabla
// en desktop y tarjetas en móvil), el formulario de nuevo gasto y el detalle
// con la cancelación. El desglose por categoría y la tendencia van en el
// reporte de gastos (spec 13).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useUser } from '../../context/UserContext'
import api from '../../services/api'
import { DATE_PRESETS, getPresetRange, today, fmtRangeLabel } from '../../utils/dateRanges'
import { money, fmtExpenseDate } from './expenseForm'
import ExpenseFormModal from './modals/ExpenseFormModal'
import ExpenseDetailModal from './modals/ExpenseDetailModal'
import './expenses.css'

const PAGE_SIZE = 20

const STATUSES = [
  { id: 'active',    label: 'Activos' },
  { id: 'cancelled', label: 'Cancelados' },
  { id: 'all',       label: 'Todos' },
]

const EMPTY_OPTIONS = { categories: [], payment_methods: [], providers: [], registers: [], branches: [] }

const fmtCount = (n) => `${n.toLocaleString('es-MX')} gasto${n !== 1 ? 's' : ''} activo${n !== 1 ? 's' : ''}`

// Método de pago, con la marca "Desde caja"
const MethodCell = ({ expense }) => (
  <>
    {expense.payment_method_name}
    {expense.paid_from_register && (
      <>{' '}<span className="exp-tag exp-tag--register"><i className="bi bi-cash-stack" />Desde caja</span></>
    )}
  </>
)

const Expenses = () => {
  const { isCentralAdmin, hasPermission } = useUser()
  const canCreate = hasPermission('expenses', 'create')
  const canCancel = hasPermission('expenses', 'cancel')

  const [expenses,   setExpenses]   = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  const [summary,    setSummary]    = useState({ count: 0, total_amount: 0 })
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)
  const [options,    setOptions]    = useState(EMPTY_OPTIONS)

  // Filtros — rango por defecto: este mes
  const [preset,          setPreset]          = useState('month')
  const [customRange,     setCustomRange]     = useState({ start: today(), end: today() })
  const [branchId,        setBranchId]        = useState('')
  const [categoryId,      setCategoryId]      = useState('')
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
    api.get('expenses/options')
      .then(({ data }) => setOptions({ ...EMPTY_OPTIONS, ...data.data }))
      .catch(() => {})
  }, [])

  const { start, end } = useMemo(() => getPresetRange(preset, customRange), [preset, customRange])

  const query = useMemo(() => {
    const params = new URLSearchParams({ start_date: start, end_date: end, status, page, limit: PAGE_SIZE })
    if (isCentralAdmin && branchId) params.set('branch_id', branchId)
    if (categoryId)      params.set('category_id', categoryId)
    if (paymentMethodId) params.set('payment_method_id', paymentMethodId)
    if (providerId)      params.set('provider_id', providerId)
    if (search)          params.set('search', search)
    return params.toString()
  }, [start, end, status, page, isCentralAdmin, branchId, categoryId, paymentMethodId, providerId, search])

  useEffect(() => {
    let ignore = false
    setIsLoading(true)
    setError(null)
    api.get(`expenses?${query}`)
      .then(({ data }) => {
        if (ignore) return
        setExpenses(data.data)
        setPagination(data.pagination)
        setSummary(data.summary)
      })
      .catch(err => { if (!ignore) setError(err.response?.data?.message ?? 'Error al cargar los gastos') })
      .finally(() => { if (!ignore) setIsLoading(false) })
    return () => { ignore = true }
  }, [query, reloadKey])

  // Cambiar cualquier filtro regresa a la página 1
  const withPageReset = (setter) => (value) => { setter(value); setPage(1) }
  const changePreset   = withPageReset(setPreset)
  const changeCustom   = withPageReset(setCustomRange)
  const changeBranch   = withPageReset(setBranchId)
  const changeCategory = withPageReset(setCategoryId)
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
  const activeFilters = [branchId, categoryId, paymentMethodId, providerId, search].filter(Boolean).length
    + (status !== 'active' ? 1 : 0)

  return (
    <div className="exp-root">
      {/* ── Header ── */}
      <div className="exp-header">
        <div>
          <h1 className="exp-header__title">Gastos</h1>
          <span className="exp-header__sub">En qué y cuánto gasta el negocio</span>
        </div>
        {canCreate && (
          <button type="button" className="exp-btn exp-btn--primary" onClick={() => setShowForm(true)}>
            <i className="bi bi-plus-lg" /> Nuevo gasto
          </button>
        )}
      </div>

      {/* ── Filtros ── */}
      <section className="exp-filter-card" aria-label="Filtros">
        <div className="exp-filter-card__top">
          <div className="exp-presets" role="tablist" aria-label="Periodo">
            {DATE_PRESETS.map(p => (
              <button key={p.id} type="button" role="tab" aria-selected={preset === p.id}
                className={`exp-preset ${preset === p.id ? 'exp-preset--active' : ''}`}
                onClick={() => changePreset(p.id)}>
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <>
              <input type="date" className="exp-select" aria-label="Fecha inicial"
                value={customRange.start} max={customRange.end}
                onChange={e => changeCustom({ ...customRange, start: e.target.value })} />
              <input type="date" className="exp-select" aria-label="Fecha final"
                value={customRange.end} min={customRange.start} max={today()}
                onChange={e => changeCustom({ ...customRange, end: e.target.value })} />
            </>
          )}

          <span className="exp-period-label">
            <i className="bi bi-calendar3" aria-hidden="true" />
            {fmtRangeLabel(start, end)}
          </span>

          <button type="button" className="exp-toggle exp-only-mobile"
            aria-expanded={filtersOpen} onClick={() => setFiltersOpen(v => !v)}>
            <i className="bi bi-sliders" /> Filtros
            {activeFilters > 0 && <span className="exp-badge" aria-label={`${activeFilters} activos`}>{activeFilters}</span>}
          </button>
        </div>

        <div className={`exp-filter-card__body ${filtersOpen ? 'exp-filter-card__body--open' : ''}`}>
          <div className="exp-search">
            <i className="bi bi-search" />
            <input type="search" className="exp-select" aria-label="Buscar por descripción o folio"
              placeholder="Buscar por descripción o folio..."
              value={searchInput} onChange={e => changeSearch(e.target.value)} />
          </div>

          {isCentralAdmin && (
            <select className="exp-select" aria-label="Sucursal" value={branchId} onChange={e => changeBranch(e.target.value)}>
              <option value="">Todas las sucursales</option>
              {options.branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.name}</option>)}
            </select>
          )}

          <select className="exp-select" aria-label="Categoría" value={categoryId} onChange={e => changeCategory(e.target.value)}>
            <option value="">Todas las categorías</option>
            {options.categories.map(c => (
              <option key={c.expense_category_id} value={c.expense_category_id}>{c.name}</option>
            ))}
          </select>

          <select className="exp-select" aria-label="Método de pago" value={paymentMethodId} onChange={e => changeMethod(e.target.value)}>
            <option value="">Todos los métodos</option>
            {options.payment_methods.map(m => (
              <option key={m.payment_method_id} value={m.payment_method_id}>{m.name}</option>
            ))}
          </select>

          <select className="exp-select" aria-label="Proveedor" value={providerId} onChange={e => changeProvider(e.target.value)}>
            <option value="">Todos los proveedores</option>
            {options.providers.map(p => <option key={p.provider_id} value={p.provider_id}>{p.name}</option>)}
          </select>

          <select className="exp-select" aria-label="Estado" value={status} onChange={e => changeStatus(e.target.value)}>
            {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </section>

      {/* ── Total de los activos del filtro ── */}
      <section className="exp-summary" aria-label="Total de gastos">
        <div>
          <span className="exp-summary__label">Total de gastos activos</span>
          <span className="exp-summary__value">{money(summary.total_amount)}</span>
        </div>
        <span className="exp-summary__count">{fmtCount(summary.count)}</span>
      </section>

      {error && (
        <div className="exp-alert" role="alert">
          <i className="bi bi-exclamation-circle" />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Cerrar aviso"><i className="bi bi-x" /></button>
        </div>
      )}

      {/* ── Lista ── */}
      {isLoading ? (
        <div className="exp-skeleton">
          {[...Array(5)].map((_, i) => <div key={i} className="exp-skeleton__row" />)}
        </div>
      ) : expenses.length === 0 ? (
        <div className="exp-empty">
          <i className="bi bi-wallet2" />
          <span>No hay gastos con estos filtros</span>
        </div>
      ) : (
        <>
          <div className="exp-table-wrap">
            <table className="exp-table" aria-label="Gastos">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Categoría</th>
                  <th>Descripción</th>
                  <th>Proveedor</th>
                  <th>Método</th>
                  {isConsolidated && <th>Sucursal</th>}
                  <th className="num">Monto</th>
                  <th aria-label="Comprobante" />
                </tr>
              </thead>
              <tbody>
                {expenses.map(e => (
                  <tr key={e.expense_id} onClick={() => setDetailId(e.expense_id)}
                    className={e.status === 'cancelled' ? 'exp-row--cancelled' : ''}>
                    <td className="exp-td-muted">{fmtExpenseDate(e.expense_date)}</td>
                    <td>{e.category_name}</td>
                    <td>
                      <span className="exp-desc">{e.description}</span>
                      {e.status === 'cancelled' && <>{' '}<span className="exp-tag exp-tag--cancelled">Cancelado</span></>}
                      {e.folio && <span className="exp-folio">Folio {e.folio}</span>}
                    </td>
                    <td className="exp-td-muted">{e.provider_name ?? '—'}</td>
                    <td className="exp-td-muted"><MethodCell expense={e} /></td>
                    {isConsolidated && <td className="exp-td-muted">{e.branch_name}</td>}
                    <td className="num"><span className="exp-amount">{money(e.amount)}</span></td>
                    <td>
                      {e.has_receipt && <i className="bi bi-paperclip exp-receipt-icon" title="Con comprobante" aria-label="Con comprobante" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="exp-cards">
            {expenses.map(e => (
              <button key={e.expense_id} type="button" onClick={() => setDetailId(e.expense_id)}
                className={`exp-card ${e.status === 'cancelled' ? 'exp-row--cancelled' : ''}`}>
                <div className="exp-card__top">
                  <span className="exp-desc">{e.description}</span>
                  {e.status === 'cancelled' && <span className="exp-tag exp-tag--cancelled">Cancelado</span>}
                </div>
                <div className="exp-card__meta">
                  <span>{fmtExpenseDate(e.expense_date)}</span>
                  <span>{e.category_name}</span>
                  {e.provider_name && <span>{e.provider_name}</span>}
                  {e.folio && <span>Folio {e.folio}</span>}
                  {isConsolidated && <span>{e.branch_name}</span>}
                  {e.has_receipt && <i className="bi bi-paperclip" aria-label="Con comprobante" />}
                </div>
                <div className="exp-card__total">
                  <span className="exp-td-muted"><MethodCell expense={e} /></span>
                  <strong className="exp-amount">{money(e.amount)}</strong>
                </div>
              </button>
            ))}
          </div>

          {pagination.totalPages > 1 && (
            <div className="exp-pagination">
              <button type="button" className="exp-btn exp-btn--ghost exp-btn--icon" aria-label="Página anterior"
                onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                <i className="bi bi-chevron-left" />
              </button>
              <span className="exp-pagination__info">
                Página <strong>{page}</strong> de <strong>{pagination.totalPages}</strong>
              </span>
              <button type="button" className="exp-btn exp-btn--ghost exp-btn--icon" aria-label="Página siguiente"
                onClick={() => setPage(p => p + 1)} disabled={page === pagination.totalPages}>
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          )}
        </>
      )}

      {showForm && (
        <ExpenseFormModal
          options={options}
          isCentralAdmin={isCentralAdmin}
          onSaved={handleSaved}
          onClose={() => setShowForm(false)}
        />
      )}

      {detailId && (
        <ExpenseDetailModal
          expenseId={detailId}
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

export default Expenses
