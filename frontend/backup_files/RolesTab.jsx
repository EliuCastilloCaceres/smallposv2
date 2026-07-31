// src/components/Settings/tabs/RolesTab.jsx
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '../../../Context/UserContext'
import api from '../../../services/api'
import RoleModal from '../modals/RoleModal'
import ConfirmDialog from '../../Common/ConfirmDialog'

// Etiquetas legibles — mismas que UserPermissionsModal para consistencia
const MODULE_LABELS = {
  pos:       'Punto de Venta',
  orders:    'Ventas',
  products:  'Productos',
  inventory: 'Inventario',
  customers: 'Clientes',
  providers: 'Proveedores',
  credit:    'Crédito',
  layaway:   'Apartados',
  reports:   'Reportes',
  users:     'Usuarios',
  settings:  'Configuración',
}

const ACTION_LABELS = {
  use:      'Usar',
  read:     'Ver',
  create:   'Crear',
  update:   'Editar',
  delete:   'Eliminar',
  cancel:   'Cancelar',
  approve:  'Aprobar',
  adjust:   'Ajustar',
  transfer: 'Traspasar',
  basic:    'Básico',
  advanced: 'Avanzado',
}

const MODULE_ICONS = {
  pos:       'bi-pc-display-horizontal',
  orders:    'bi-clipboard2-data',
  products:  'bi-boxes',
  inventory: 'bi-archive',
  customers: 'bi-person-badge',
  providers: 'bi-truck',
  credit:    'bi-clock-history',
  layaway:   'bi-bookmark-check',
  reports:   'bi-bar-chart-line',
  users:     'bi-person',
  settings:  'bi-gear',
}

// ─── Editor de permisos del rol seleccionado ──────────────────────────────────
const RolePermissionsEditor = ({ role, allPermissions, onSaved }) => {
  const [checked,         setChecked]         = useState({})
  const [expandedModules, setExpandedModules] = useState(() => new Set())
  const [isSaving,        setIsSaving]        = useState(false)
  const [error,           setError]           = useState(null)
  const [isDirty,         setIsDirty]         = useState(false)
  const [savedOk,         setSavedOk]         = useState(false)

  // Inicializar checkboxes cuando cambia el rol o el catálogo
  useEffect(() => {
    if (!role || !allPermissions) return
    const rolePermIds = new Set(role.permissions.map(p => p.permission_id))
    const initial = {}
    allPermissions.flat.forEach(p => {
      initial[p.permission_id] = rolePermIds.has(p.permission_id)
    })
    setChecked(initial)
    setIsDirty(false)
    setSavedOk(false)
    setError(null)
    // Abrir primer módulo por default
    const first = Object.keys(allPermissions.grouped)[0]
    setExpandedModules(first ? new Set([first]) : new Set())
  }, [role?.role_id, allPermissions])

  const toggleModuleOpen = (module) => {
    setExpandedModules(prev => {
      const next = new Set(prev)
      next.has(module) ? next.delete(module) : next.add(module)
      return next
    })
  }

  const handleToggle = (permId) => {
    setChecked(prev => ({ ...prev, [permId]: !prev[permId] }))
    setIsDirty(true)
    setSavedOk(false)
    setError(null)
  }

  const handleToggleModule = (module, perms) => {
    const allChecked = perms.every(p => checked[p.permission_id])
    setChecked(prev => {
      const next = { ...prev }
      perms.forEach(p => { next[p.permission_id] = !allChecked })
      return next
    })
    setIsDirty(true)
    setSavedOk(false)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const permission_ids = Object.entries(checked)
        .filter(([, v]) => v)
        .map(([k]) => parseInt(k))

      const { data } = await api.put(`roles/${role.role_id}/permissions`, { permission_ids })
      setIsDirty(false)
      setSavedOk(true)
      onSaved(data.data)
      setTimeout(() => setSavedOk(false), 3000)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al guardar permisos')
    } finally {
      setIsSaving(false)
    }
  }

  if (!role || !allPermissions) return null

  const totalChecked = Object.values(checked).filter(Boolean).length
  const totalPerms   = allPermissions.flat.length

  return (
    <div className="set-section">
      {/* ── Header del editor ── */}
      <div className="set-section__head">
        <div>
          <h3 className="set-section__title">
            Permisos de {role.name}
          </h3>
          <p className="set-section__sub">
            {totalChecked}/{totalPerms} permisos activos
          </p>
        </div>
        <button
          className="set-btn set-btn--primary"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
        >
          {isSaving
            ? <><span className="set-spinner set-spinner--sm" />Guardando...</>
            : savedOk
              ? <><i className="bi bi-check2" />Guardado</>
              : <><i className="bi bi-floppy" />Guardar</>
          }
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="set-alert set-alert--error">
          <i className="bi bi-exclamation-circle" />
          <span>{error}</span>
          <button className="set-alert__close" onClick={() => setError(null)}>
            <i className="bi bi-x" />
          </button>
        </div>
      )}

      {/* ── Cambios sin guardar ── */}
      {isDirty && (
        <div className="set-alert set-alert--warn">
          <i className="bi bi-pencil-square" />
          <span>Tienes cambios sin guardar</span>
        </div>
      )}

      {/* ── Módulos ── */}
      <div className="set-cards">
        {Object.entries(allPermissions.grouped).map(([module, perms]) => {
          const isOpen       = expandedModules.has(module)
          const checkedCount = perms.filter(p => checked[p.permission_id]).length
          const allChecked   = checkedCount === perms.length
          const someChecked  = checkedCount > 0 && !allChecked

          return (
            <div key={module} className="set-card">
              <div className="set-card__body">
                <div className="set-card__row">
                  {/* Checkbox de módulo completo + nombre */}
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minWidth: 0 }}
                  >
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={el => { if (el) el.indeterminate = someChecked }}
                      onChange={() => handleToggleModule(module, perms)}
                      style={{ width: 16, height: 16, accentColor: 'var(--set-accent)', flexShrink: 0 }}
                    />
                    <span className="set-card__name" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <i className={`bi ${MODULE_ICONS[module] ?? 'bi-grid'}`} style={{ color: 'var(--set-accent)' }} />
                      {MODULE_LABELS[module] ?? module}
                    </span>
                  </label>

                  {/* Contador + acordeón */}
                  <button
                    type="button"
                    className="set-btn set-btn--ghost"
                    onClick={() => toggleModuleOpen(module)}
                  >
                    <span className={`set-badge ${allChecked ? 'set-badge--on' : 'set-badge--off'}`}>
                      {checkedCount}/{perms.length}
                    </span>
                    <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} />
                  </button>
                </div>

                {/* Permisos individuales */}
                {isOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--set-border)', paddingTop: 10, gap: 2 }}>
                    {perms.map(perm => (
                      <label
                        key={perm.permission_id}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', cursor: 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={!!checked[perm.permission_id]}
                          onChange={() => handleToggle(perm.permission_id)}
                          style={{ width: 15, height: 15, accentColor: 'var(--set-accent)', flexShrink: 0 }}
                        />
                        <div className="set-card__info">
                          <span className="set-card__name" style={{ fontSize: 13 }}>
                            {ACTION_LABELS[perm.action] ?? perm.action}
                          </span>
                          {perm.description && (
                            <span className="set-card__meta">{perm.description}</span>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tab principal ────────────────────────────────────────────────────────────
const RolesTab = ({ isAdmin }) => {
  const { hasPermission } = useUser()
  const canEdit = isAdmin && hasPermission('users', 'update')

  const [roles,          setRoles]          = useState([])
  const [allPermissions, setAllPermissions] = useState(null)
  const [selectedRole,   setSelectedRole]   = useState(null)
  const [isLoading,      setIsLoading]      = useState(true)
  const [error,          setError]          = useState(null)
  const [modal,          setModal]          = useState({ open: false, role: null })
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
      // Seleccionar el primer rol activo por defecto
      const first = rolesRes.data.data.find(r => r.is_active)
      if (first) setSelectedRole(first)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar datos')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleToggleStatus = (role) => {
    // Si tiene usuarios activos y se va a desactivar, pedir confirmación
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
      if (selectedRole?.role_id === role.role_id) setSelectedRole(data.data)
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
    setSelectedRole(savedRole)
    setModal({ open: false, role: null })
  }

  const handlePermissionsSaved = (updatedRole) => {
    setRoles(prev => prev.map(r => r.role_id === updatedRole.role_id ? updatedRole : r))
    setSelectedRole(updatedRole)
  }

  const activeCount = roles.filter(r => r.is_active).length

  return (
    <div className="set-section">
      {/* ── Header ── */}
      <div className="set-section__head">
        <div>
          <h2 className="set-section__title">Roles y permisos</h2>
          <p className="set-section__sub">
            {isAdmin
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
          {roles.map(role => {
            const isSelected = selectedRole?.role_id === role.role_id
            return (
              <div
                key={role.role_id}
                className={`set-card ${!role.is_active ? 'set-card--inactive' : ''}`}
                onClick={() => setSelectedRole(role)}
                style={{
                  cursor: 'pointer',
                  borderColor: isSelected ? 'var(--set-accent)' : undefined,
                  background: isSelected ? 'var(--set-accent-bg)' : undefined,
                }}
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

                  {/* Acciones — solo si canEdit */}
                  {canEdit && (
                    <div className="set-card__actions" onClick={e => e.stopPropagation()}>
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
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Editor de permisos del rol seleccionado */}
      {selectedRole && allPermissions && (
        <RolePermissionsEditor
          role={selectedRole}
          allPermissions={allPermissions}
          onSaved={handlePermissionsSaved}
        />
      )}

      {/* Modal crear/editar rol */}
      {modal.open && (
        <RoleModal
          role={modal.role}
          onSaved={handleSavedRole}
          onClose={() => setModal({ open: false, role: null })}
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