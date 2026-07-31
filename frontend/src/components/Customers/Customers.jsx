// src/components/Customers/Customers.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useUser } from '../../Context/UserContext'
import api from '../../services/api'
import CustomerModal      from './modals/CustomerModal'
import CustomerDetailModal from './modals/CustomerDetailModal'
import ConfirmDialog      from '../Common/ConfirmDialog'
import './customers.css'

const PAGE_SIZE = 20

// ── Barra de crédito ──────────────────────────────────────────────────────────
export const CreditBar = ({ limit, balance }) => {
  if (!limit || limit === 0) return <span className="cst-credit-none">Sin crédito</span>

  const pct     = Math.min((balance / limit) * 100, 100)
  const level   = pct >= 100 ? 'full' : pct >= 70 ? 'warn' : 'ok'
  const fmtMXN  = (v) => `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

  return (
    <div className="cst-credit">
      <div className="cst-credit__bar-wrap">
        <div className={`cst-credit__bar cst-credit__bar--${level}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`cst-credit__label cst-credit__label--${level}`}>
        {fmtMXN(balance)} / {fmtMXN(limit)}
      </span>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
const Customers = () => {
  const { hasPermission } = useUser()
  const canCreate = hasPermission('customers', 'create')
  const canEdit   = hasPermission('customers', 'update')

  const [customers,     setCustomers]     = useState([])
  const [pagination,    setPagination]    = useState({ total: 0, page: 1, totalPages: 1 })
  const [isLoading,     setIsLoading]     = useState(true)
  const [error,         setError]         = useState(null)

  // Filtros
  const [search,        setSearch]        = useState('')
  const [filterStatus,  setFilterStatus]  = useState('')
  const [page,          setPage]          = useState(1)

  // Modales
  const [modal,         setModal]         = useState({ open: false, customer: null })
  const [detailId,      setDetailId]      = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [toggling,      setToggling]      = useState(null)

  const searchTimer = useRef(null)
  const searchRef   = useRef('')
  const statusRef   = useRef('')

  // ── Fetch ──
  const fetchCustomers = useCallback(async (currentPage = 1) => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: currentPage, limit: PAGE_SIZE })
      if (searchRef.current) params.set('search',    searchRef.current)
      if (statusRef.current) params.set('is_active', statusRef.current)

      const { data } = await api.get(`customers?${params}`)
      setCustomers(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar clientes')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchCustomers(page) }, [page, fetchCustomers])

  // ── Búsqueda con debounce ──
  const handleSearch = (val) => {
    searchRef.current = val
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(prev => { if (prev === 1) { fetchCustomers(1); return 1 } return 1 })
    }, 400)
  }

  const handleFilterStatus = (e) => {
    statusRef.current = e.target.value
    setFilterStatus(e.target.value)
    setPage(prev => { if (prev === 1) { fetchCustomers(1); return 1 } return 1 })
  }

  // ── Toggle status ──
  const handleToggle = (customer) => {
    if (customer.is_active) { setConfirmTarget(customer); return }
    performToggle(customer)
  }

  const performToggle = async (customer) => {
    setToggling(customer.customer_id)
    try {
      const { data } = await api.patch(`customers/${customer.customer_id}/status`, {
        is_active: !customer.is_active,
      })
      setCustomers(prev => prev.map(c =>
        c.customer_id === customer.customer_id ? data.data : c
      ))
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cambiar estado')
    } finally {
      setToggling(null)
    }
  }

  // ── Guardar ──
  const handleSaved = (saved) => {
    setCustomers(prev => {
      const exists = prev.find(c => c.customer_id === saved.customer_id)
      return exists
        ? prev.map(c => c.customer_id === saved.customer_id ? saved : c)
        : [saved, ...prev]
    })
    setModal({ open: false, customer: null })
  }

  const isGeneric = (c) => c.customer_id === 1

  return (
    <div className="cst-root">
      {/* ── Header ── */}
      <div className="cst-header">
        <div>
          <h1 className="cst-header__title">Clientes</h1>
          <span className="cst-header__sub">
            {pagination.total} cliente{pagination.total !== 1 ? 's' : ''} encontrado{pagination.total !== 1 ? 's' : ''}
          </span>
        </div>
        {canCreate && (
          <button className="cst-btn cst-btn--primary" onClick={() => setModal({ open: true, customer: null })}>
            <i className="bi bi-person-plus" />
            <span>Nuevo cliente</span>
          </button>
        )}
      </div>

      {/* ── Filtros ── */}
      <div className="cst-filters">
        <div className="cst-search">
          <i className="bi bi-search cst-search__icon" />
          <input
            type="text"
            className="cst-search__input"
            placeholder="Buscar por nombre, teléfono, email o RFC..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
          {search && (
            <button className="cst-search__clear" onClick={() => handleSearch('')}>
              <i className="bi bi-x" />
            </button>
          )}
        </div>
        <select className="cst-select" value={filterStatus} onChange={handleFilterStatus}>
          <option value="">Todos los estados</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="cst-alert">
          <i className="bi bi-exclamation-circle" />
          <span>{error}</span>
          <button onClick={() => setError(null)}><i className="bi bi-x" /></button>
        </div>
      )}

      {/* ── Contenido ── */}
      {isLoading ? (
        <div className="cst-skeleton">
          {[...Array(5)].map((_, i) => <div key={i} className="cst-skeleton__row" />)}
        </div>
      ) : customers.length === 0 ? (
        <div className="cst-empty">
          <i className="bi bi-people" />
          <span>No se encontraron clientes</span>
        </div>
      ) : (
        <>
          {/* ── Tabla (desktop) ── */}
          <div className="cst-table-wrap">
            <table className="cst-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contacto</th>
                  <th>Crédito</th>
                  <th>Estado</th>
                  {canEdit && <th></th>}
                </tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.customer_id} className={!c.is_active ? 'cst-row--inactive' : ''}>
                    <td>
                      <div className="cst-customer-cell">
                        <div className="cst-avatar">
                          {[c.first_name, c.last_name]
                            .filter(Boolean).map(n => n[0].toUpperCase()).join('') || '?'}
                        </div>
                        <div className="cst-customer-info">
                          <button
                            className="cst-customer-name"
                            onClick={() => setDetailId(c.customer_id)}
                          >
                            {[c.first_name, c.last_name].filter(Boolean).join(' ') || 'Sin nombre'}
                          </button>
                          {c.rfc && <span className="cst-muted">RFC: {c.rfc}</span>}
                          {isGeneric(c) && (
                            <span className="cst-badge-generic">Público general</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="cst-contact">
                        {c.phone_number && (
                          <span className="cst-muted">
                            <i className="bi bi-telephone" />{c.phone_number}
                          </span>
                        )}
                        {c.email && (
                          <span className="cst-muted">
                            <i className="bi bi-envelope" />{c.email}
                          </span>
                        )}
                        {!c.phone_number && !c.email && <span className="cst-muted">—</span>}
                      </div>
                    </td>
                    <td><CreditBar limit={c.credit_limit} balance={c.credit_balance} /></td>
                    <td>
                      <span className={`cst-status ${c.is_active ? 'cst-status--on' : 'cst-status--off'}`}>
                        <span className="cst-status__dot" />
                        {c.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {canEdit && (
                      <td>
                        <div className="cst-actions">
                          <button
                            className="cst-action-btn"
                            title="Editar"
                            onClick={() => setModal({ open: true, customer: c })}
                            disabled={isGeneric(c)}
                          >
                            <i className="bi bi-pencil" />
                          </button>
                          <button
                            className={`cst-action-btn ${c.is_active ? 'cst-action-btn--danger' : ''}`}
                            title={c.is_active ? 'Desactivar' : 'Activar'}
                            onClick={() => handleToggle(c)}
                            disabled={toggling === c.customer_id || isGeneric(c)}
                          >
                            {toggling === c.customer_id
                              ? <span className="cst-spinner" />
                              : <i className={`bi ${c.is_active ? 'bi-person-slash' : 'bi-person-check'}`} />
                            }
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Cards (móvil) ── */}
          <div className="cst-cards">
            {customers.map(c => (
              <div key={c.customer_id} className={`cst-card ${!c.is_active ? 'cst-card--inactive' : ''}`}>
                <div className="cst-card__top">
                  <div className="cst-customer-cell">
                    <div className="cst-avatar">
                      {[c.first_name, c.last_name]
                        .filter(Boolean).map(n => n[0].toUpperCase()).join('') || '?'}
                    </div>
                    <div className="cst-customer-info">
                      <button
                        className="cst-customer-name"
                        onClick={() => setDetailId(c.customer_id)}
                      >
                        {[c.first_name, c.last_name].filter(Boolean).join(' ') || 'Sin nombre'}
                      </button>
                      {isGeneric(c) && <span className="cst-badge-generic">Público general</span>}
                    </div>
                  </div>
                  <span className={`cst-status ${c.is_active ? 'cst-status--on' : 'cst-status--off'}`}>
                    <span className="cst-status__dot" />
                    {c.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                <div className="cst-card__meta">
                  {c.phone_number && (
                    <span className="cst-muted"><i className="bi bi-telephone" />{c.phone_number}</span>
                  )}
                  {c.email && (
                    <span className="cst-muted"><i className="bi bi-envelope" />{c.email}</span>
                  )}
                  {c.rfc && (
                    <span className="cst-muted"><i className="bi bi-file-text" />RFC: {c.rfc}</span>
                  )}
                </div>

                <CreditBar limit={c.credit_limit} balance={c.credit_balance} />

                {canEdit && !isGeneric(c) && (
                  <div className="cst-card__actions">
                    <button
                      className="cst-btn cst-btn--ghost"
                      onClick={() => setModal({ open: true, customer: c })}
                    >
                      <i className="bi bi-pencil" /><span>Editar</span>
                    </button>
                    <button
                      className={`cst-btn ${c.is_active ? 'cst-btn--danger-ghost' : 'cst-btn--ghost'}`}
                      onClick={() => handleToggle(c)}
                      disabled={toggling === c.customer_id}
                    >
                      {toggling === c.customer_id
                        ? <span className="cst-spinner" />
                        : <i className={`bi ${c.is_active ? 'bi-person-slash' : 'bi-person-check'}`} />
                      }
                      <span>{c.is_active ? 'Desactivar' : 'Activar'}</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Paginación ── */}
          {pagination.totalPages > 1 && (
            <div className="cst-pagination">
              <button
                className="cst-btn cst-btn--ghost cst-btn--icon"
                onClick={() => setPage(p => p - 1)}
                disabled={page === 1}
              >
                <i className="bi bi-chevron-left" />
              </button>
              <span className="cst-pagination__info">
                Página <strong>{page}</strong> de <strong>{pagination.totalPages}</strong>
              </span>
              <button
                className="cst-btn cst-btn--ghost cst-btn--icon"
                onClick={() => setPage(p => p + 1)}
                disabled={page === pagination.totalPages}
              >
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Modales ── */}
      {detailId && (
        <CustomerDetailModal
          customerId={detailId}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
          onEdit={(c) => { setDetailId(null); setModal({ open: true, customer: c }) }}
        />
      )}

      {modal.open && (
        <CustomerModal
          customer={modal.customer}
          canEditCredit={hasPermission('credit', 'create')}
          onSaved={handleSaved}
          onClose={() => setModal({ open: false, customer: null })}
        />
      )}

      {confirmTarget && (
        <ConfirmDialog
          title="Desactivar cliente"
          message={`¿Desactivar a ${[confirmTarget.first_name, confirmTarget.last_name].filter(Boolean).join(' ') || 'este cliente'}? No podrá usarse en nuevas ventas hasta reactivarlo.`}
          confirmLabel="Desactivar"
          variant="danger"
          onClose={() => setConfirmTarget(null)}
          onConfirm={async () => {
            await performToggle(confirmTarget)
            setConfirmTarget(null)
          }}
        />
      )}
    </div>
  )
}

export default Customers
