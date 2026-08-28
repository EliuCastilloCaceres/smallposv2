// src/components/Providers/modals/ProviderDetailModal.jsx
import { useState, useEffect, useCallback } from 'react'
import api from '../../../services/api'
import { fmtDateTime } from '../../../utils/dateFormatter'

const fmtMXN = (v) =>
  `$${Number(v ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`



// ── Helpers ───────────────────────────────────────────────────────────────────

const initials = (name) => name?.trim().slice(0, 2).toUpperCase() ?? '?'

const DetailRow = ({ icon, label, value }) => (
  <div className="cst-detail__row">
    <span className="cst-detail__label"><i className={`bi ${icon}`} />{label}</span>
    <span className="cst-detail__value">{value ?? '—'}</span>
  </div>
)

const TabSkeleton = () => (
  <div className="cst-skeleton">
    {[...Array(3)].map((_, i) => <div key={i} className="cst-skeleton__row" />)}
  </div>
)

const TabEmpty = ({ icon, text }) => (
  <div className="cst-empty">
    <i className={`bi ${icon}`} />
    <span>{text}</span>
  </div>
)

// ── Componente principal ──────────────────────────────────────────────────────
const ProviderDetailModal = ({ providerId, canEdit, onClose, onEdit }) => {
  const [provider,    setProvider]    = useState(null)
  const [products,    setProducts]    = useState(null)   // null = no cargado aún
  const [activeTab,   setActiveTab]   = useState('profile')
  const [isLoading,   setIsLoading]   = useState(true)
  const [error,       setError]       = useState(null)

  // Cerrar con Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  // Carga inicial — perfil
  useEffect(() => {
    setIsLoading(true)
    api.get(`providers/${providerId}`)
      .then(({ data }) => setProvider(data.data))
      .catch(err => setError(err.response?.data?.message ?? 'Error al cargar el proveedor'))
      .finally(() => setIsLoading(false))
  }, [providerId])

  // Carga lazy de productos al cambiar a esa tab
  const handleTab = useCallback((tab) => {
    setActiveTab(tab)
    if (tab === 'products' && products === null) {
      api.get(`providers/${providerId}/products`)
        .then(({ data }) => setProducts(data.data))
        .catch(() => setProducts([]))
    }
  }, [providerId, products])

  const isGeneric = provider?.provider_id === 1

  const TABS = [
    { id: 'profile',  icon: 'bi-building',  label: 'Perfil'    },
    { id: 'products', icon: 'bi-boxes',      label: 'Productos' },
  ]

  return (
    <div className="cst-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cst-modal cst-modal--lg">

        {/* ── Header ── */}
        <div className="cst-modal__header">
          <h3 className="cst-modal__title">
            <i className="bi bi-truck" />
            Detalle del proveedor
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

          {provider && !isLoading && (
            <>
              {/* Hero */}
              <div className="cst-detail__hero">
                <div className="prv-avatar prv-avatar--lg">{initials(provider.name)}</div>
                <div className="cst-detail__hero-info">
                  <h4 className="cst-detail__name">{provider.name}</h4>
                  {provider.email && <span className="cst-muted">{provider.email}</span>}
                  <div className="cst-detail__hero-badges">
                    <span className={`cst-status ${provider.is_active ? 'cst-status--on' : 'cst-status--off'}`}>
                      <span className="cst-status__dot" />
                      {provider.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                    {isGeneric && <span className="cst-badge-generic">Genérico</span>}
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
                    <DetailRow icon="bi-telephone" label="Teléfono"  value={provider.phone_number} />
                    <DetailRow icon="bi-envelope"  label="Email"     value={provider.email} />
                    <DetailRow icon="bi-file-text" label="RFC"       value={provider.rfc} />
                  </div>
                  <div className="cst-detail__section">
                    <span className="cst-detail__section-title">Dirección</span>
                    <DetailRow icon="bi-geo-alt" label="Calle"    value={provider.address} />
                    <DetailRow icon="bi-map"     label="Ciudad"
                      value={[provider.city, provider.state].filter(Boolean).join(', ') || null} />
                    <DetailRow icon="bi-mailbox" label="C.P."     value={provider.zip_code} />
                  </div>
                  <div className="cst-detail__section">
                    <span className="cst-detail__section-title">Sistema</span>
                    <DetailRow icon="bi-hash"          label="ID"          value={`#${provider.provider_id}`} />
                    <DetailRow icon="bi-calendar"      label="Registro"    value={fmtDateTime(provider.created_at)} />
                    <DetailRow icon="bi-pencil-square" label="Actualizado" value={fmtDateTime(provider.updated_at)} />
                  </div>
                </div>
              )}

              {/* ── Tab: Productos ── */}
              {activeTab === 'products' && (
                products === null ? <TabSkeleton /> :
                products.length === 0
                  ? <TabEmpty icon="bi-boxes" text="Sin productos asignados" />
                  : (
                    <div className="cst-hist-list">
                      {products.map(prod => (
                        <div key={prod.product_id} className={`cst-hist-card ${!prod.is_active ? 'prv-product--inactive' : ''}`}>
                          <div className="cst-hist-card__top">
                            <div className="prv-product__name-wrap">
                              <span className="cst-hist-card__id">{prod.name}</span>
                              {prod.sku && <span className="cst-muted">SKU: {prod.sku}</span>}
                            </div>
                            <span className={`cst-status ${prod.is_active ? 'cst-status--on' : 'cst-status--off'}`}>
                              <span className="cst-status__dot" />
                              {prod.is_active ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>

                          <div className="cst-hist-card__meta">
                            {!!prod.is_variable && (
                              <span className="cst-badge cst-badge--accent">Variable</span>
                            )}
                          </div>

                          <div className="cst-hist-card__rows">
                            <div className="cst-hist-card__row">
                              <span>Precio compra</span>
                              <span>{fmtMXN(prod.purchase_price)}</span>
                            </div>
                            <div className="cst-hist-card__row cst-hist-card__row--total">
                              <span>Precio venta</span>
                              <strong className="cst-green">{fmtMXN(prod.sale_price)}</strong>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
              )}

              {/* Acciones */}
              {canEdit && !isGeneric && (
                <div className="cst-detail__actions">
                  <button
                    className="cst-btn cst-btn--primary"
                    onClick={() => { onClose(); onEdit(provider) }}
                  >
                    <i className="bi bi-pencil" /><span>Editar proveedor</span>
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

export default ProviderDetailModal
