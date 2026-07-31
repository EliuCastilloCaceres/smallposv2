// src/components/Users/modals/UserDetailModal.jsx
import { useState, useEffect } from 'react'
import api from '../../../services/api'

const ROLE_COLORS = {
  admin:       { bg: 'rgba(79,142,247,.12)',  color: '#4f8ef7' },
  supervisor:  { bg: 'rgba(147,51,234,.12)',  color: '#9333ea' },
  cajero:      { bg: 'rgba(22,163,74,.12)',   color: '#16a34a' },
  almacenista: { bg: 'rgba(217,119,6,.12)',   color: '#d97706' },
}

const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('es-MX', {
    day:   '2-digit',
    month: 'long',
    year:  'numeric',
  })
}

// ── Fila de detalle ───────────────────────────────────────────────────────────
const DetailRow = ({ icon, label, value }) => (
  <div className="usr-detail__row">
    <span className="usr-detail__label">
      <i className={`bi ${icon}`} />
      {label}
    </span>
    <span className="usr-detail__value">{value ?? '—'}</span>
  </div>
)

// ── Componente principal ──────────────────────────────────────────────────────
const UserDetailModal = ({ userId, isSelf, onClose, onEdit, onChangePassword }) => {
  const [user,      setUser]      = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => {
    const fetchUser = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const { data } = await api.get(`users/${userId}`)
        setUser(data.data)
      } catch (err) {
        setError(err.response?.data?.message ?? 'Error al cargar el usuario')
      } finally {
        setIsLoading(false)
      }
    }
    fetchUser()
  }, [userId])

  const roleStyle = user ? (ROLE_COLORS[user.role_name] ?? { bg: '#f1f5f9', color: '#64748b' }) : {}

  const initials = user
    ? ([user.first_name, user.last_name].filter(Boolean).map(n => n[0].toUpperCase()).join('') || user.username[0].toUpperCase())
    : ''

  return (
    <div className="usr-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="usr-modal">
        {/* ── Header ── */}
        <div className="usr-modal__header">
          <h3 className="usr-modal__title">
            <i className="bi bi-person-circle" />
            Detalle de usuario
          </h3>
          <button className="usr-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="usr-modal__body">
          {/* ── Skeleton ── */}
          {isLoading && (
            <div className="usr-detail__skeleton">
              <div className="usr-detail__skeleton-avatar" />
              <div className="usr-detail__skeleton-line usr-detail__skeleton-line--lg" />
              <div className="usr-detail__skeleton-line" />
              <div className="usr-detail__skeleton-line usr-detail__skeleton-line--sm" />
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="usr-alert">
              <i className="bi bi-exclamation-circle" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Contenido ── */}
          {user && !isLoading && (
            <>
              {/* Avatar + nombre + badges */}
              <div className="usr-detail__hero">
                <div className="usr-detail__avatar-wrap">
                  {user.profile_image ? (
                    <img
                      src={user.profile_image}
                      alt={user.username}
                      className="usr-detail__avatar"
                    />
                  ) : (
                    <span
                      className="usr-detail__avatar usr-detail__avatar--initials"
                      style={{ background: roleStyle.bg, color: roleStyle.color }}
                    >
                      {initials}
                    </span>
                  )}
                  {/* Dot de estado */}
                  <span className={`usr-detail__status-dot ${user.is_active ? 'usr-detail__status-dot--on' : 'usr-detail__status-dot--off'}`} />
                </div>

                <div className="usr-detail__hero-info">
                  <div className="usr-detail__name-row">
                    <h4 className="usr-detail__name">
                      {[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}
                    </h4>
                    {isSelf && <span className="usr-detail__self-badge">Tú</span>}
                  </div>
                  <span className="usr-detail__username">@{user.username}</span>
                  <div className="usr-detail__badges">
                    <span
                      className="usr-role-badge"
                      style={{ background: roleStyle.bg, color: roleStyle.color }}
                    >
                      {user.role_name}
                    </span>
                    <span className={`usr-status ${user.is_active ? 'usr-status--on' : 'usr-status--off'}`}>
                      <span className="usr-status__dot" />
                      {user.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Sección: información laboral ── */}
              <div className="usr-detail__section">
                <span className="usr-detail__section-title">Información laboral</span>
                <div className="usr-detail__rows">
                  <DetailRow icon="bi-briefcase"    label="Cargo"     value={user.position} />
                  <DetailRow icon="bi-building"     label="Sucursal"  value={user.branch_name ?? 'Central'} />
                  <DetailRow icon="bi-shield-check" label="Rol"       value={user.role_name} />
                </div>
              </div>

              {/* ── Sección: contacto ── */}
              <div className="usr-detail__section">
                <span className="usr-detail__section-title">Contacto</span>
                <div className="usr-detail__rows">
                  <DetailRow icon="bi-telephone"  label="Teléfono" value={user.phone_number} />
                  <DetailRow icon="bi-geo-alt"    label="Dirección" value={user.address} />
                  <DetailRow icon="bi-map"        label="Ciudad"
                    value={[user.city, user.state].filter(Boolean).join(', ') || null}
                  />
                  <DetailRow icon="bi-mailbox"    label="C.P."     value={user.zip_code} />
                </div>
              </div>

              {/* ── Sección: sistema ── */}
              <div className="usr-detail__section">
                <span className="usr-detail__section-title">Sistema</span>
                <div className="usr-detail__rows">
                  <DetailRow icon="bi-hash"        label="ID"             value={`#${user.user_id}`} />
                  <DetailRow icon="bi-calendar"    label="Creado"         value={formatDate(user.created_at)} />
                  <DetailRow icon="bi-pencil-square" label="Actualizado"  value={formatDate(user.updated_at)} />
                </div>
              </div>

              {/* ── Acciones ── */}
              <div className="usr-detail__actions">
                <button
                  className="usr-btn usr-btn--ghost"
                  onClick={() => { onClose(); onChangePassword(user) }}
                >
                  <i className="bi bi-key" />
                  <span>Cambiar contraseña</span>
                </button>
                <button
                  className="usr-btn usr-btn--primary"
                  onClick={() => { onClose(); onEdit(user) }}
                >
                  <i className="bi bi-pencil" />
                  <span>Editar</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default UserDetailModal
