// src/components/Settings/modals/PermissionsModal.jsx
import { useState, useEffect } from 'react'
import api from '../../../services/api'

// Etiquetas legibles — mismas que RolesTab/UserPermissionsModal para consistencia
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

const PermissionsModal = ({ role, allPermissions, onSaved, onClose }) => {
  const [checked,         setChecked]         = useState({})
  const [expandedModules, setExpandedModules] = useState(() => new Set())
  const [isSaving,        setIsSaving]        = useState(false)
  const [error,           setError]           = useState(null)
  const [isDirty,         setIsDirty]         = useState(false)

  // Inicializar checkboxes al abrir
  useEffect(() => {
    if (!role || !allPermissions) return
    const rolePermIds = new Set(role.permissions.map(p => p.permission_id))
    const initial = {}
    allPermissions.flat.forEach(p => {
      initial[p.permission_id] = rolePermIds.has(p.permission_id)
    })
    setChecked(initial)
    setIsDirty(false)
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
  }

  // Marcar/quitar todos los permisos del rol de un solo clic
  const handleToggleAll = (value) => {
    const next = {}
    allPermissions.flat.forEach(p => { next[p.permission_id] = value })
    setChecked(next)
    setIsDirty(true)
  }

  const handleClose = () => {
    if (isDirty && !window.confirm('Tienes cambios sin guardar. ¿Cerrar de todas formas?')) return
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)
    try {
      const permission_ids = Object.entries(checked)
        .filter(([, v]) => v)
        .map(([k]) => parseInt(k))

      const { data } = await api.put(`roles/${role.role_id}/permissions`, { permission_ids })
      onSaved(data.data)
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
    <div className="set-overlay" onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="set-modal set-modal--lg">
        <div className="set-modal__header">
          <h3 className="set-modal__title">
            <i className="bi bi-shield-lock" />
            Permisos de {role.name}
          </h3>
          <button className="set-modal__close" onClick={handleClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <form className="set-modal__body" onSubmit={handleSubmit}>
          {/* ── Resumen + acciones rápidas ── */}
          <div className="set-card__row" style={{ flexWrap: 'wrap' }}>
            <span className="set-section__sub" style={{ margin: 0 }}>
              {totalChecked}/{totalPerms} permisos activos
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="set-btn set-btn--ghost" onClick={() => handleToggleAll(true)}>
                <i className="bi bi-check-all" />
                <span>Marcar todo</span>
              </button>
              <button type="button" className="set-btn set-btn--ghost" onClick={() => handleToggleAll(false)}>
                <i className="bi bi-x-lg" />
                <span>Quitar todo</span>
              </button>
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="set-alert set-alert--error">
              <i className="bi bi-exclamation-circle" />
              <span>{error}</span>
              <button type="button" className="set-alert__close" onClick={() => setError(null)}>
                <i className="bi bi-x" />
              </button>
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

          <div className="set-modal__footer">
            {isDirty && (
              <span className="set-alert set-alert--warn" style={{ marginRight: 'auto', padding: '6px 10px' }}>
                <i className="bi bi-pencil-square" />
                <span>Cambios sin guardar</span>
              </span>
            )}
            <button type="button" className="set-btn set-btn--ghost" onClick={handleClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="set-btn set-btn--primary"
              disabled={isSaving || !isDirty}
            >
              {isSaving
                ? <><span className="set-spinner set-spinner--sm" />Guardando...</>
                : <><i className="bi bi-floppy" />Guardar</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PermissionsModal
