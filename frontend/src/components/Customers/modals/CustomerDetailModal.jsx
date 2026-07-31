// src/components/Customers/modals/CustomerDetailModal.jsx
import { useState, useEffect, useCallback } from 'react'
import api from '../../../services/api'
import { CreditBar } from '../Customers'

const fmtMXN = (v) =>
  `$${Number(v ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—'

// ── Status badge ──────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    completed: { label: 'Completada', cls: 'cst-badge--green'  },
    pending:   { label: 'Pendiente',  cls: 'cst-badge--warn'   },
    cancelled: { label: 'Cancelada',  cls: 'cst-badge--red'    },
    paid:      { label: 'Pagado',     cls: 'cst-badge--green'  },
    partial:   { label: 'Parcial',    cls: 'cst-badge--warn'   },
    overdue:   { label: 'Vencido',    cls: 'cst-badge--red'    },
    active:    { label: 'Activo',     cls: 'cst-badge--accent' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'cst-badge--muted' }
  return <span className={`cst-badge ${cls}`}>{label}</span>
}

// ── Tab skeleton ──────────────────────────────────────────────────────────────
const TabSkeleton = () => (
  <div className="cst-skeleton">
    {[...Array(3)].map((_, i) => <div key={i} className="cst-skeleton__row" />)}
  </div>
)

// ── Tab vacío ─────────────────────────────────────────────────────────────────
const TabEmpty = ({ icon, text }) => (
  <div className="cst-empty">
    <i className={`bi ${icon}`} />
    <span>{text}</span>
  </div>
)

// ── Detalle row ───────────────────────────────────────────────────────────────
const DetailRow = ({ icon, label, value }) => (
  <div className="cst-detail__row">
    <span className="cst-detail__label"><i className={`bi ${icon}`} />{label}</span>
    <span className="cst-detail__value">{value ?? '—'}</span>
  </div>
)

// ── Componente principal ──────────────────────────────────────────────────────
const CustomerDetailModal = ({ customerId, canEdit, onClose, onEdit }) => {
  const [customer,  setCustomer]  = useState(null)
  const [activeTab, setActiveTab] = useState('profile')
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState(null)

  // Historia por tab
  const [orders,   setOrders]   = useState([])
  const [credits,  setCredits]  = useState([])
  const [layaways, setLayaways] = useState([])
  const [histLoading, setHistLoading] = useState(false)

  // Cargar datos del cliente
  useEffect(() => {
    const fetch = async () => {
      setIsLoading(true)
      try {
        const { data } = await api.get(`customers/${customerId}`)
        setCustomer(data.data)
      } catch (err) {
        setError(err.response?.data?.message ?? 'Error al cargar el cliente')
      } finally {
        setIsLoading(false)
      }
    }
    fetch()
  }, [customerId])

  // Cargar historial según tab activo
  const fetchTab = useCallback(async (tab) => {
    if (tab === 'profile') return
    setHistLoading(true)
    try {
      if (tab === 'orders' && orders.length === 0) {
        const { data } = await api.get(`customers/${customerId}/orders`)
        setOrders(data.data)
      }
      if (tab === 'credits' && credits.length === 0) {
        const { data } = await api.get(`customers/${customerId}/credits`)
        setCredits(data.data)
      }
      if (tab === 'layaways' && layaways.length === 0) {
        const { data } = await api.get(`customers/${customerId}/layaways`)
        setLayaways(data.data)
      }
    } catch (_) {} finally {
      setHistLoading(false)
    }
  }, [customerId, orders.length, credits.length, layaways.length])

  const handleTab = (tab) => { setActiveTab(tab); fetchTab(tab) }

  const initials = customer
    ? ([customer.first_name, customer.last_name].filter(Boolean).map(n => n[0].toUpperCase()).join('') || '?')
    : '?'

  const TABS = [
    { id: 'profile',  icon: 'bi-person',       label: 'Perfil'     },
    { id: 'orders',   icon: 'bi-bag',           label: 'Compras'    },
    { id: 'credits',  icon: 'bi-clock-history', label: 'Créditos'   },
    { id: 'layaways', icon: 'bi-bookmark-check',label: 'Apartados'  },
  ]

  return (
    <div className="cst-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cst-modal cst-modal--lg">
        {/* ── Header ── */}
        <div className="cst-modal__header">
          <h3 className="cst-modal__title">
            <i className="bi bi-person-circle" />
            Detalle del cliente
          </h3>
          <button className="cst-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        {/* ── Cuerpo ── */}
        <div className="cst-modal__body">
          {isLoading && <TabSkeleton />}
          {error && (
            <div className="cst-alert">
              <i className="bi bi-exclamation-circle" /><span>{error}</span>
            </div>
          )}

          {customer && !isLoading && (
            <>
              {/* Hero */}
              <div className="cst-detail__hero">
                <div className="cst-avatar cst-avatar--lg">{initials}</div>
                <div className="cst-detail__hero-info">
                  <h4 className="cst-detail__name">
                    {[customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Sin nombre'}
                  </h4>
                  {customer.email && <span className="cst-muted">{customer.email}</span>}
                  <div className="cst-detail__hero-badges">
                    <span className={`cst-status ${customer.is_active ? 'cst-status--on' : 'cst-status--off'}`}>
                      <span className="cst-status__dot" />
                      {customer.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                    {customer.customer_id === 1 && (
                      <span className="cst-badge-generic">Público general</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="cst-tabs">
                {TABS.map(t => (
                  <button
                    key={t.id}
                    className={`cst-tab ${activeTab === t.id ? 'cst-tab--active' : ''}`}
                    onClick={() => handleTab(t.id)}
                  >
                    <i className={`bi ${t.icon}`} />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>

              {/* ── Tab: Perfil ── */}
              {activeTab === 'profile' && (
                <div className="cst-detail__sections">
                  <div className="cst-detail__section">
                    <span className="cst-detail__section-title">Contacto</span>
                    <DetailRow icon="bi-telephone"  label="Teléfono" value={customer.phone_number} />
                    <DetailRow icon="bi-envelope"   label="Email"    value={customer.email} />
                    <DetailRow icon="bi-file-text"  label="RFC"      value={customer.rfc} />
                  </div>
                  <div className="cst-detail__section">
                    <span className="cst-detail__section-title">Dirección</span>
                    <DetailRow icon="bi-geo-alt" label="Dirección" value={customer.address} />
                    <DetailRow icon="bi-map"     label="Ciudad"
                      value={[customer.city, customer.state].filter(Boolean).join(', ') || null} />
                    <DetailRow icon="bi-mailbox" label="C.P."      value={customer.zip_code} />
                  </div>
                  <div className="cst-detail__section">
                    <span className="cst-detail__section-title">Crédito</span>
                    <div className="cst-detail__row">
                      <span className="cst-detail__label">
                        <i className="bi bi-credit-card" />Límite / Saldo
                      </span>
                      <div className="cst-detail__value">
                        <CreditBar limit={customer.credit_limit} balance={customer.credit_balance} />
                      </div>
                    </div>
                  </div>
                  <div className="cst-detail__section">
                    <span className="cst-detail__section-title">Sistema</span>
                    <DetailRow icon="bi-hash"     label="ID"        value={`#${customer.customer_id}`} />
                    <DetailRow icon="bi-calendar" label="Registro"  value={fmtDate(customer.created_at)} />
                    <DetailRow icon="bi-pencil-square" label="Actualizado" value={fmtDate(customer.updated_at)} />
                  </div>
                </div>
              )}

              {/* ── Tab: Compras ── */}
              {activeTab === 'orders' && (
                histLoading ? <TabSkeleton /> :
                orders.length === 0 ? <TabEmpty icon="bi-bag" text="Sin compras registradas" /> : (
                  <div className="cst-hist-list">
                    {orders.map(o => (
                      <div key={o.order_id} className="cst-hist-card">
                        <div className="cst-hist-card__top">
                          <span className="cst-hist-card__id">Orden #{o.order_id}</span>
                          <StatusBadge status={o.status} />
                        </div>
                        <div className="cst-hist-card__meta">
                          <span className="cst-muted"><i className="bi bi-calendar" />{fmtDate(o.created_at)}</span>
                          <span className="cst-muted"><i className="bi bi-building" />{o.branch_name ?? '—'}</span>
                          <span className="cst-muted"><i className="bi bi-person" />{o.seller ?? '—'}</span>
                        </div>
                        <div className="cst-hist-card__total">
                          <span>Total</span>
                          <strong>{fmtMXN(o.total)}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* ── Tab: Créditos ── */}
              {activeTab === 'credits' && (
                histLoading ? <TabSkeleton /> :
                credits.length === 0 ? <TabEmpty icon="bi-clock-history" text="Sin créditos registrados" /> : (
                  <div className="cst-hist-list">
                    {credits.map(cr => (
                      <div key={cr.credit_sale_id} className="cst-hist-card">
                        <div className="cst-hist-card__top">
                          <span className="cst-hist-card__id">Crédito #{cr.credit_sale_id}</span>
                          <StatusBadge status={cr.status} />
                        </div>
                        <div className="cst-hist-card__meta">
                          <span className="cst-muted"><i className="bi bi-calendar" />{fmtDate(cr.created_at)}</span>
                          <span className="cst-muted"><i className="bi bi-building" />{cr.branch_name ?? '—'}</span>
                          {cr.due_date && (
                            <span className="cst-muted"><i className="bi bi-alarm" />Vence: {fmtDate(cr.due_date)}</span>
                          )}
                        </div>
                        <div className="cst-hist-card__rows">
                          <div className="cst-hist-card__row">
                            <span>Total</span><span>{fmtMXN(cr.total_amount)}</span>
                          </div>
                          <div className="cst-hist-card__row">
                            <span>Pagado</span><span className="cst-green">{fmtMXN(cr.amount_paid)}</span>
                          </div>
                          <div className="cst-hist-card__row cst-hist-card__row--total">
                            <span>Saldo</span><strong className="cst-red">{fmtMXN(cr.balance)}</strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* ── Tab: Apartados ── */}
              {activeTab === 'layaways' && (
                histLoading ? <TabSkeleton /> :
                layaways.length === 0 ? <TabEmpty icon="bi-bookmark-check" text="Sin apartados registrados" /> : (
                  <div className="cst-hist-list">
                    {layaways.map(l => (
                      <div key={l.layaway_id} className="cst-hist-card">
                        <div className="cst-hist-card__top">
                          <span className="cst-hist-card__id">Apartado #{l.layaway_id}</span>
                          <StatusBadge status={l.status} />
                        </div>
                        <div className="cst-hist-card__meta">
                          <span className="cst-muted"><i className="bi bi-calendar" />{fmtDate(l.created_at)}</span>
                          <span className="cst-muted"><i className="bi bi-building" />{l.branch_name ?? '—'}</span>
                          {l.due_date && (
                            <span className="cst-muted"><i className="bi bi-alarm" />Vence: {fmtDate(l.due_date)}</span>
                          )}
                        </div>
                        {l.notes && <p className="cst-hist-card__notes">{l.notes}</p>}
                        <div className="cst-hist-card__rows">
                          <div className="cst-hist-card__row">
                            <span>Total</span><span>{fmtMXN(l.total_amount)}</span>
                          </div>
                          <div className="cst-hist-card__row">
                            <span>Pagado</span><span className="cst-green">{fmtMXN(l.amount_paid)}</span>
                          </div>
                          <div className="cst-hist-card__row cst-hist-card__row--total">
                            <span>Saldo</span><strong className="cst-red">{fmtMXN(l.balance)}</strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* Acciones */}
              {canEdit && customer.customer_id !== 1 && (
                <div className="cst-detail__actions">
                  <button className="cst-btn cst-btn--primary"
                    onClick={() => { onClose(); onEdit(customer) }}>
                    <i className="bi bi-pencil" /><span>Editar cliente</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default CustomerDetailModal
