// src/components/Providers/Providers.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useUser } from '../../Context/UserContext'
import api from '../../services/api'
import ProviderModal       from './modals/ProviderModal'
import ProviderDetailModal from './modals/ProviderDetailModal'
import ConfirmDialog       from '../Common/ConfirmDialog'
import './providers.css'

const PAGE_SIZE    = 20
const GENERIC_ID   = 1

const initials = (p) =>
  p.name?.trim().slice(0, 2).toUpperCase() ?? '?'

const Providers = () => {
  const { hasPermission } = useUser()
  const canCreate = hasPermission('providers', 'create')
  const canEdit   = hasPermission('providers', 'update')

  // ── Estado ──
  const [providers,    setProviders]    = useState([])
  const [pagination,   setPagination]   = useState({ total: 0, page: 1, totalPages: 1 })
  const [isLoading,    setIsLoading]    = useState(true)
  const [isFetching,   setIsFetching]   = useState(false)
  const [error,        setError]        = useState(null)

  // Filtros
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page,         setPage]         = useState(1)

  // Modales
  const [modal,         setModal]         = useState({ open: false, provider: null })
  const [detailId,      setDetailId]      = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [toggling,      setToggling]      = useState(null)

  const searchTimer = useRef(null)
  const searchRef   = useRef('')
  const statusRef   = useRef('')

  // ── Fetch ──
  const fetchProviders = useCallback(async (currentPage = 1, silent = false) => {
    if (silent) setIsFetching(true)
    else        setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: currentPage, limit: PAGE_SIZE })
      if (searchRef.current) params.set('search',    searchRef.current)
      if (statusRef.current) params.set('is_active', statusRef.current)

      const { data } = await api.get(`providers?${params}`)
      setProviders(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar proveedores')
    } finally {
      setIsLoading(false)
      setIsFetching(false)
    }
  }, [])

  useEffect(() => { fetchProviders(page) }, [page, fetchProviders])

  // ── Búsqueda con debounce ──
  const handleSearch = (val) => {
    searchRef.current = val
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(prev => {
        if (prev !== 1) return 1
        fetchProviders(1, true)
        return 1
      })
    }, 400)
  }

  const handleFilterStatus = (e) => {
    statusRef.current = e.target.value
    setFilterStatus(e.target.value)
    setPage(prev => {
      if (prev !== 1) return 1
      fetchProviders(1, true)
      return 1
    })
  }

  // ── Toggle status ──
  const handleToggle = (provider) => {
    if (provider.is_active) { setConfirmTarget(provider); return }
    performToggle(provider)
  }

  const performToggle = async (provider) => {
    setToggling(provider.provider_id)
    try {
      const { data } = await api.patch(`providers/${provider.provider_id}/status`, {
        is_active: !provider.is_active,
      })
      setProviders(prev => prev.map(p =>
        p.provider_id === provider.provider_id ? data.data : p
      ))
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cambiar estado')
    } finally {
      setToggling(null)
    }
  }

  // ── Guardar ──
  const handleSaved = (saved) => {
    setProviders(prev => {
      const exists = prev.find(p => p.provider_id === saved.provider_id)
      return exists
        ? prev.map(p => p.provider_id === saved.provider_id ? saved : p)
        : [saved, ...prev]
    })
    setModal({ open: false, provider: null })
  }

  const isGeneric = (p) => p.provider_id === GENERIC_ID

  return (
    <div className="prv-root">

      {/* ── Header ── */}
      <div className="cst-header">
        <div>
          <h1 className="cst-header__title">Proveedores</h1>
          <span className="cst-header__sub">
            {pagination.total} proveedor{pagination.total !== 1 ? 'es' : ''} encontrado{pagination.total !== 1 ? 's' : ''}
          </span>
        </div>
        {canCreate && (
          <button
            className="cst-btn cst-btn--primary"
            onClick={() => setModal({ open: true, provider: null })}
          >
            <i className="bi bi-truck" />
            <span>Nuevo proveedor</span>
          </button>
        )}
      </div>

      {/* ── Filtros ── */}
      <div className={`cst-filters${isFetching ? ' prv-filters--loading' : ''}`}>
        <div className="cst-search">
          <i className="bi bi-search cst-search__icon" />
          <input
            type="text"
            className="cst-search__input"
            placeholder="Buscar por nombre, RFC o email..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
          {search && (
            <button className="cst-search__clear" onClick={() => handleSearch('')}>
              <i className="bi bi-x" />
            </button>
          )}
        </div>
        <select
          className="cst-select"
          value={filterStatus}
          onChange={handleFilterStatus}
        >
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
      ) : providers.length === 0 ? (
        <div className="cst-empty">
          <i className="bi bi-truck" />
          <span>No se encontraron proveedores</span>
        </div>
      ) : (
        <>
          {/* ── Tabla desktop ── */}
          <div className="cst-table-wrap">
            <table className="cst-table">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Contacto</th>
                  <th>Dirección</th>
                  <th>Estado</th>
                  {canEdit && <th></th>}
                </tr>
              </thead>
              <tbody>
                {providers.map(p => (
                  <tr key={p.provider_id} className={!p.is_active ? 'cst-row--inactive' : ''}>

                    {/* Nombre + RFC */}
                    <td>
                      <div className="cst-customer-cell">
                        <div className="prv-avatar">{initials(p)}</div>
                        <div className="cst-customer-info">
                          <button
                            className="cst-customer-name"
                            onClick={() => setDetailId(p.provider_id)}
                          >
                            {p.name}
                          </button>
                          {p.rfc && <span className="cst-muted">RFC: {p.rfc}</span>}
                          {isGeneric(p) && (
                            <span className="cst-badge-generic">Genérico</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Contacto */}
                    <td>
                      <div className="cst-contact">
                        {p.phone_number && (
                          <span className="cst-muted">
                            <i className="bi bi-telephone" />{p.phone_number}
                          </span>
                        )}
                        {p.email && (
                          <span className="cst-muted">
                            <i className="bi bi-envelope" />{p.email}
                          </span>
                        )}
                        {!p.phone_number && !p.email && <span className="cst-muted">—</span>}
                      </div>
                    </td>

                    {/* Ubicación */}
                    <td>
                      <div className="cst-contact">
                        {(p.city || p.state) && (
                          <span className="cst-muted">
                            <i className="bi bi-geo-alt" />
                            {[p.city, p.state].filter(Boolean).join(', ')}
                          </span>
                        )}
                        {p.zip_code && (
                          <span className="cst-muted">
                            <i className="bi bi-mailbox" />C.P. {p.zip_code}
                          </span>
                        )}
                        {!p.city && !p.state && !p.zip_code && <span className="cst-muted">—</span>}
                      </div>
                    </td>

                    {/* Estado */}
                    <td>
                      <span className={`cst-status ${p.is_active ? 'cst-status--on' : 'cst-status--off'}`}>
                        <span className="cst-status__dot" />
                        {p.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    {/* Acciones */}
                    {canEdit && (
                      <td>
                        <div className="cst-actions">
                          <button
                            className="cst-action-btn"
                            title="Editar"
                            onClick={() => setModal({ open: true, provider: p })}
                            disabled={isGeneric(p)}
                          >
                            <i className="bi bi-pencil" />
                          </button>
                          <button
                            className={`cst-action-btn ${p.is_active ? 'cst-action-btn--danger' : ''}`}
                            title={p.is_active ? 'Desactivar' : 'Activar'}
                            onClick={() => handleToggle(p)}
                            disabled={toggling === p.provider_id || isGeneric(p)}
                          >
                            {toggling === p.provider_id
                              ? <span className="cst-spinner" />
                              : <i className={`bi ${p.is_active ? 'bi-slash-circle' : 'bi-check-circle'}`} />
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

          {/* ── Cards móvil ── */}
          <div className="cst-cards">
            {providers.map(p => (
              <div
                key={p.provider_id}
                className={`cst-card ${!p.is_active ? 'cst-card--inactive' : ''}`}
              >
                <div className="cst-card__top">
                  <div className="cst-customer-cell">
                    <div className="prv-avatar">{initials(p)}</div>
                    <div className="cst-customer-info">
                      <button
                        className="cst-customer-name"
                        onClick={() => setDetailId(p.provider_id)}
                      >
                        {p.name}
                        {isGeneric(p) && <span className="cst-badge-generic" style={{ marginLeft: 6 }}>Genérico</span>}
                      </button>
                      {p.rfc && <span className="cst-muted">RFC: {p.rfc}</span>}
                    </div>
                  </div>
                  <span className={`cst-status ${p.is_active ? 'cst-status--on' : 'cst-status--off'}`}>
                    <span className="cst-status__dot" />
                    {p.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                <div className="cst-card__meta">
                  {p.phone_number && (
                    <span className="cst-muted"><i className="bi bi-telephone" />{p.phone_number}</span>
                  )}
                  {p.email && (
                    <span className="cst-muted"><i className="bi bi-envelope" />{p.email}</span>
                  )}
                  {(p.city || p.state) && (
                    <span className="cst-muted">
                      <i className="bi bi-geo-alt" />{[p.city, p.state].filter(Boolean).join(', ')}
                    </span>
                  )}
                </div>

                {canEdit && !isGeneric(p) && (
                  <div className="cst-card__actions">
                    <button
                      className="cst-btn cst-btn--ghost"
                      onClick={() => setModal({ open: true, provider: p })}
                    >
                      <i className="bi bi-pencil" /><span>Editar</span>
                    </button>
                    <button
                      className={`cst-btn ${p.is_active ? 'cst-btn--danger-ghost' : 'cst-btn--ghost'}`}
                      onClick={() => handleToggle(p)}
                      disabled={toggling === p.provider_id}
                    >
                      {toggling === p.provider_id
                        ? <span className="cst-spinner" />
                        : <i className={`bi ${p.is_active ? 'bi-slash-circle' : 'bi-check-circle'}`} />
                      }
                      <span>{p.is_active ? 'Desactivar' : 'Activar'}</span>
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
        <ProviderDetailModal
          providerId={detailId}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
          onEdit={(p) => { setDetailId(null); setModal({ open: true, provider: p }) }}
        />
      )}

      {modal.open && (
        <ProviderModal
          provider={modal.provider}
          onSaved={handleSaved}
          onClose={() => setModal({ open: false, provider: null })}
        />
      )}

      {confirmTarget && (
        <ConfirmDialog
          title="Desactivar proveedor"
          message={`¿Desactivar a "${confirmTarget.name}"? Sus productos serán reasignados al proveedor genérico automáticamente.`}
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

export default Providers
