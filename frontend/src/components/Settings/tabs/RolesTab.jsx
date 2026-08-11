// src/components/Settings/tabs/RolesTab.jsx
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '../../../Context/UserContext'
import api from '../../../services/api'
import RoleModal from '../modals/RoleModal'
import PermissionsModal from '../modals/PermissionsModal'
import ConfirmDialog from '../../Common/ConfirmDialog'

const RolesTab = ({ isCentralAdmin }) => {
  const { user: currentUser, hasPermission } = useUser()

  const isSuperadmin = currentUser?.role_name === 'superadmin'
  const canEdit = (isCentralAdmin || isSuperadmin) && hasPermission('roles', 'update')

  const [roles,          setRoles]          = useState([])
  const [allPermissions, setAllPermissions] = useState(null)
  const [isLoading,      setIsLoading]      = useState(true)
  const [error,          setError]          = useState(null)
  const [modal,          setModal]          = useState({ open: false, role: null })
  const [permModal,      setPermModal]      = useState({ open: false, role: null })
  const [toggling,       setToggling]       = useState(null)
  const [confirmTarget,  setConfirmTarget]  = useState(null)

  // Cargar roles y catálogo de permisos en paralelo
  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [rolesRes, permsRes] = await Promise.all([
        api.get('roles'),
        api.get('permissions'),
      ])
      setRoles(rolesRes.data.data)
      setAllPermissions(permsRes.data.data)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar datos')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleToggleStatus = (role) => {
    if (role.is_system) {
      setError('Los roles del sistema no pueden desactivarse')
      setTimeout(() => setError(null), 3000)
      return
    }
    if (role.is_active && role.user_count > 0) {
      setConfirmTarget(role)
      return
    }
    performToggle(role)
  }

  const performToggle = async (role) => {
    setToggling(role.role_id)
    setError(null)
    try {
      const { data } = await api.patch(`roles/${role.role_id}/status`, {
        is_active: !role.is_active,
      })
      setRoles(prev => prev.map(r => r.role_id === role.role_id ? data.data : r))
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cambiar estado')
    } finally {
      setToggling(null)
    }
  }

  const handleSavedRole = (savedRole) => {
    setRoles(prev => {
      const exists = prev.find(r => r.role_id === savedRole.role_id)
      return exists
        ? prev.map(r => r.role_id === savedRole.role_id ? savedRole : r)
        : [...prev, savedRole]
    })
    setModal({ open: false, role: null })
  }

  const handlePermissionsSaved = (updatedRole) => {
    setRoles(prev => prev.map(r => r.role_id === updatedRole.role_id ? updatedRole : r))
    setPermModal({ open: false, role: null })
  }

  const activeCount = roles.filter(r => r.is_active).length

  // FIX: antes solo se checaba `!role.is_system`, sin exigir `canEdit` —
  // cualquiera que pudiera VER el tab (gateado hoy por settings.read, no
  // por roles.update) podía abrir el modal de permisos y llegar hasta
  // "Guardar" antes de que el backend lo rechazara. Ahora la card solo es
  // clickeable si además tiene permiso real de editar roles — el mismo
  // criterio que ya se usaba para el botón interno "Permisos".
  const canOpenPermissions = (role) => canEdit && !role.is_system

  return (
    <div className="set-section">
      {/* ── Header ── */}
      <div className="set-section__head">
        <div>
          <h2 className="set-section__title">Roles y permisos</h2>
          <p className="set-section__sub">
            {isCentralAdmin || isSuperadmin
              ? 'Gestiona los roles del sistema y sus permisos'
              : 'Solo el administrador central puede gestionar roles'}
          </p>
        </div>
        {canEdit && (
          <button
            className="set-btn set-btn--primary"
            onClick={() => setModal({ open: true, role: null })}
          >
            <i className="bi bi-plus-lg" />
            <span>Nuevo rol</span>
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="set-alert set-alert--error">
          <i className="bi bi-exclamation-circle" />
          <span>{error}</span>
          <button className="set-alert__close" onClick={() => setError(null)}>
            <i className="bi bi-x" />
          </button>
        </div>
      )}

      {/* Resumen */}
      {roles.length > 0 && (
        <div className="set-summary">
          <div className="set-summary__item">
            <span className="set-summary__val">{roles.length}</span>
            <span className="set-summary__label">Total</span>
          </div>
          <div className="set-summary__item">
            <span className="set-summary__val set-summary__val--on">{activeCount}</span>
            <span className="set-summary__label">Activos</span>
          </div>
        </div>
      )}

      {/* Lista de roles */}
      {isLoading ? (
        <div className="set-skeleton">
          {[...Array(4)].map((_, i) => <div key={i} className="set-skeleton__row" />)}
        </div>
      ) : roles.length === 0 ? (
        <div className="set-empty">
          <i className="bi bi-shield-x" />
          <span>No hay roles definidos</span>
        </div>
      ) : (
        <div className="set-cards">
          {roles.map(role => (
            <div
              key={role.role_id}
              className={`set-card ${!role.is_active ? 'set-card--inactive' : ''}`}
              onClick={canOpenPermissions(role) ? () => setPermModal({ open: true, role }) : undefined}
              style={{ cursor: canOpenPermissions(role) ? 'pointer' : 'default' }}
              title={
                role.is_system
                  ? 'Rol del sistema — solo lectura'
                  : (canEdit ? 'Ver/editar permisos' : 'Sin permiso para gestionar roles')
              }
            >
              <span className={`set-card__dot ${role.is_active ? 'set-card__dot--on' : 'set-card__dot--off'}`} />

              <div className="set-card__body">
                <div className="set-card__row">
                  <div className="set-card__info">
                    <span className="set-card__name">{role.name}</span>
                    {role.description && (
                      <span className="set-card__meta">{role.description}</span>
                    )}
                    <span className="set-card__meta">
                      <i className="bi bi-people" />
                      {role.user_count} usuario{role.user_count !== 1 ? 's' : ''}
                      {' · '}
                      <i className="bi bi-shield-check" />
                      {role.permissions?.length ?? 0} permisos
                    </span>
                  </div>
                  <span className={`set-badge ${role.is_active ? 'set-badge--on' : 'set-badge--off'}`}>
                    <i className={`bi ${role.is_active ? 'bi-check-circle' : 'bi-slash-circle'}`} />
                    {role.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                {/* Acciones — solo admin con permiso real */}
                {canEdit && !role.is_system && (
                  <div className="set-card__actions" onClick={e => e.stopPropagation()}>
                    <button
                      className="set-btn set-btn--ghost"
                      onClick={() => setPermModal({ open: true, role })}
                    >
                      <i className="bi bi-shield-lock" />
                      <span>Permisos</span>
                    </button>
                    <button
                      className="set-btn set-btn--ghost"
                      onClick={() => setModal({ open: true, role })}
                    >
                      <i className="bi bi-pencil" />
                      <span>Editar</span>
                    </button>
                    <button
                      className={`set-btn ${role.is_active ? 'set-btn--danger-ghost' : 'set-btn--ghost'}`}
                      onClick={() => handleToggleStatus(role)}
                      disabled={toggling === role.role_id}
                    >
                      {toggling === role.role_id
                        ? <span className="set-spinner set-spinner--sm" />
                        : <i className={`bi ${role.is_active ? 'bi-slash-circle' : 'bi-check-circle'}`} />
                      }
                      <span>{role.is_active ? 'Desactivar' : 'Activar'}</span>
                    </button>
                  </div>
                )}

                {/* FIX: `role.is_system` es un TINYINT (0/1) de MySQL, no un
                    booleano — `{role.is_system && (<div/>)}` hacía que React
                    renderizara literalmente el número 0 como texto visible
                    en CADA card de rol no-protegido (0 && <jsx> se evalúa a
                    0, no a false, y React SÍ pinta el 0). Usar un ternario
                    evita el problema de raíz: solo se elige una rama, nunca
                    se "filtra" el operando falsy hacia el render. */}
                {role.is_system ? (
                  <div className="set-card__actions" onClick={e => e.stopPropagation()}>
                    <span className="set-badge set-badge--protected">
                      <i className="bi bi-shield-lock" /> Protegido
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal crear/editar rol */}
      {modal.open && (
        <RoleModal
          role={modal.role}
          onSaved={handleSavedRole}
          onClose={() => setModal({ open: false, role: null })}
        />
      )}

      {/* Modal de permisos */}
      {permModal.open && allPermissions && (
        <PermissionsModal
          role={permModal.role}
          allPermissions={allPermissions}
          onSaved={handlePermissionsSaved}
          onClose={() => setPermModal({ open: false, role: null })}
        />
      )}

      {/* Confirmación desactivar con usuarios activos */}
      {confirmTarget && (
        <ConfirmDialog
          title="Desactivar rol"
          message={`El rol "${confirmTarget.name}" tiene ${confirmTarget.user_count} usuario(s) activo(s). ¿Deseas desactivarlo de todas formas? Los usuarios conservarán el rol asignado pero no podrán iniciar sesión con permisos de este rol.`}
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

export default RolesTab