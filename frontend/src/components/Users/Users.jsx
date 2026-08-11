// src/components/Users/Users.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useUser } from '../../Context/UserContext'
import api from '../../services/api'
import UserModal           from './modals/UserModal'
import TempPassModal       from './modals/TempPassModal'
import ChangePasswordModal from './modals/ChangePasswordModal'
import UserDetailModal     from './modals/UserDetailModal'
import ConfirmDialog       from '../Common/ConfirmDialog'
import './users.css'

// Colores por nombre de rol — fallback genérico para roles personalizados
const ROLE_COLOR_PALETTE = [
  { bg: 'rgba(79,142,247,.12)',  color: '#4f8ef7' },
  { bg: 'rgba(147,51,234,.12)', color: '#9333ea' },
  { bg: 'rgba(22,163,74,.12)',  color: '#16a34a' },
  { bg: 'rgba(217,119,6,.12)',  color: '#d97706' },
  { bg: 'rgba(239,68,68,.12)',  color: '#ef4444' },
  { bg: 'rgba(20,184,166,.12)', color: '#14b8a6' },
]

// Asigna un color consistente a cada rol por su role_id
const getRoleColor = (roleId) =>
  ROLE_COLOR_PALETTE[(roleId - 1) % ROLE_COLOR_PALETTE.length]

const PAGE_SIZE = 20

// ── Componente Badge de rol ───────────────────────────────────────────────────
const RoleBadge = ({ roleName, roleId }) => {
  const style = getRoleColor(roleId ?? 0)
  return (
    <span className="usr-role-badge" style={{ background: style.bg, color: style.color }}>
      {roleName}
    </span>
  )
}

// ── Componente Avatar ─────────────────────────────────────────────────────────
const Avatar = ({ user }) => {
  const initials = [user.first_name, user.last_name]
    .filter(Boolean)
    .map(n => n[0].toUpperCase())
    .join('')
    || user.username[0].toUpperCase()

  const style = getRoleColor(user.role_id ?? 0)

  if (user.profile_image) {
    return <img src={user.profile_image} alt={user.username} className="usr-avatar" />
  }
  return (
    <span className="usr-avatar usr-avatar--initials" style={{ background: style.bg, color: style.color }}>
      {initials}
    </span>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
const Users = () => {
  // FIX: se añade isCentralAdmin del contexto. Antes `isAdmin` (role_name
  // === 'admin', SIN importar branch_id) se usaba para decidir si mostrar
  // el selector "Todas las sucursales" y cargar el catálogo completo de
  // sucursales — eso incluía por error a un admin DE SUCURSAL (no central),
  // que según la regla de negocio solo opera con su propia sucursal. El
  // backend igual ignora cualquier branch_id que un no-central mande
  // (userService.getAll fuerza su propio branch_id), así que no era un
  // hueco de seguridad, pero sí una UI incongruente con la regla.
  const { user: me, isAdmin, isCentralAdmin, hasPermission } = useUser()
  const canEdit = hasPermission('users', 'create') || hasPermission('users', 'update')

  const isSuperadmin = me?.role_name === 'superadmin'

  // FIX: canActOnUser antes solo cubría el caso superadmin y para todo lo
  // demás devolvía el permiso RBAC plano (canEdit), sin replicar la
  // jerarquía real (admin central solo gestionable por otro admin
  // central/superadmin; admin de sucursal y demás roles por superadmin/
  // admin central/admin de su misma sucursal). Esto no era explotable
  // porque el backend (roleHelpers.canEditUser/canDeleteOrDeactivateUser)
  // sigue siendo quien autoriza de verdad — pero es la misma dispersión
  // de lógica de jerarquía que ya eliminamos del backend, ahora
  // reapareciendo en el frontend. Se replica aquí la misma estructura,
  // y se separa "editar" de "desactivar/borrar" igual que en el backend.
  const isCentralAdminUser = (u) => u.role_name === 'admin' && u.branch_id === null
  const isBranchAdminOf    = (u, branchId) =>
    u.role_name === 'admin' && u.branch_id !== null && Number(u.branch_id) === Number(branchId)

  const canEditThisUser = (target) => {
    if (!canEdit) return false
    if (target.role_name === 'superadmin') return me?.user_id === target.user_id
    if (isCentralAdminUser(target)) return isSuperadmin || isCentralAdminUser(me)
    return isSuperadmin || isCentralAdminUser(me) || isBranchAdminOf(me, target.branch_id)
  }

  const canDeactivateThisUser = (target) => {
    if (!canEdit) return false
    if (target.role_name === 'superadmin') return false
    if (isCentralAdminUser(target)) {
      if (me?.user_id === target.user_id) return false
      return isSuperadmin || isCentralAdminUser(me)
    }
    return isSuperadmin || isCentralAdminUser(me) || isBranchAdminOf(me, target.branch_id)
  }

  // Si puede hacer CUALQUIERA de las dos, se muestra el bloque de acciones
  const canActOnUser = (user) => canEditThisUser(user) || canDeactivateThisUser(user)

  // ── Estado ──
  const [users,        setUsers]        = useState([])
  const [pagination,   setPagination]   = useState({ total: 0, page: 1, totalPages: 1 })
  const [isLoading,    setIsLoading]    = useState(true)
  const [error,        setError]        = useState(null)

  // Catálogos
  const [roles,        setRoles]        = useState([])
  const [branches,     setBranches]     = useState([])

  // Filtros
  const [search,       setSearch]       = useState('')
  const [filterRole,   setFilterRole]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterBranch, setFilterBranch] = useState('')
  const [page,         setPage]         = useState(1)

  // Modales
  const [userModal,     setUserModal]     = useState({ open: false, user: null })
  const [tempPass,      setTempPass]      = useState(null)
  const [changePwModal, setChangePwModal] = useState(null)
  const [detailUserId,  setDetailUserId]  = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [toggling,      setToggling]      = useState(null)

  const searchTimer = useRef(null)
  const searchRef   = useRef('')
  const roleRef     = useRef('')
  const statusRef   = useRef('')
  const branchRef   = useRef('')

  // ── Cargar roles y sucursales al montar ──
  // FIX: antes usaba `isAdmin || isSuperadmin` — ahora `isCentralAdmin`
  // (que ya cubre superadmin, cuyo branch_id también es null), para no
  // cargar el catálogo completo de sucursales a un admin de sucursal.
  useEffect(() => {
    api.get('roles?is_active=true')
      .then(({ data }) => setRoles(data.data))
      .catch(() => {})
    if (isCentralAdmin) {
      api.get('branches?is_active=true')
        .then(({ data }) => setBranches(data.data))
        .catch(() => {})
    }
  }, [isCentralAdmin])

  // ── Fetch usuarios ──
  const fetchUsers = useCallback(async (currentPage = 1) => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: currentPage, limit: PAGE_SIZE })
      if (searchRef.current)  params.set('search',    searchRef.current)
      if (roleRef.current)    params.set('role_id',   roleRef.current)
      if (statusRef.current)  params.set('is_active', statusRef.current)
      if (branchRef.current)  params.set('branch_id', branchRef.current)

      const { data } = await api.get(`users?${params}`)
      setUsers(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar usuarios')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers(page) }, [page, fetchUsers])

  // ── Búsqueda con debounce ──
  const handleSearch = (val) => {
    searchRef.current = val
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(prev => { if (prev === 1) { fetchUsers(1); return 1 } return 1 })
    }, 400)
  }

  const handleFilter = (setter, ref) => (e) => {
    ref.current = e.target.value
    setter(e.target.value)
    setPage(prev => { if (prev === 1) { fetchUsers(1); return 1 } return 1 })
  }

  // ── Toggle status ──
  const handleToggleStatus = (user) => {
    if (user.is_active) { setConfirmTarget(user); return }
    performToggle(user)
  }

  const performToggle = async (user) => {
    setToggling(user.user_id)
    try {
      const { data } = await api.patch(`users/${user.user_id}/status`, {
        is_active: !user.is_active,
      })
      setUsers(prev => prev.map(u => u.user_id === user.user_id ? data.data : u))
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cambiar estado')
    } finally {
      setToggling(null)
    }
  }

  // ── Guardar usuario ──
  const handleSaved = (savedUser) => {
    if (savedUser.temp_password) {
      setTempPass({ username: savedUser.username, password: savedUser.temp_password })
    }
    setUsers(prev => {
      const exists = prev.find(u => u.user_id === savedUser.user_id)
      return exists
        ? prev.map(u => u.user_id === savedUser.user_id ? savedUser : u)
        : [savedUser, ...prev]
    })
    setUserModal({ open: false, user: null })
  }

  const isSelf = (user) => user.user_id === me?.user_id

  return (
    <div className="usr-root">
      {/* ── Header ── */}
      <div className="usr-header">
        <div>
          <h1 className="usr-header__title">Usuarios</h1>
          <span className="usr-header__sub">
            {pagination.total} usuario{pagination.total !== 1 ? 's' : ''} encontrado{pagination.total !== 1 ? 's' : ''}
          </span>
        </div>
        {canEdit && (
          <button
            className="usr-btn usr-btn--primary"
            onClick={() => setUserModal({ open: true, user: null })}
          >
            <i className="bi bi-person-plus" />
            <span>Nuevo usuario</span>
          </button>
        )}
      </div>

      {/* ── Filtros ── */}
      <div className="usr-filters">
        <div className="usr-search">
          <i className="bi bi-search usr-search__icon" />
          <input
            type="text"
            className="usr-search__input"
            placeholder="Buscar por nombre o usuario..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
          {search && (
            <button className="usr-search__clear" onClick={() => handleSearch('')}>
              <i className="bi bi-x" />
            </button>
          )}
        </div>

        <select
          className="usr-select"
          value={filterRole}
          onChange={handleFilter(setFilterRole, roleRef)}
        >
          <option value="">Todos los roles</option>
          {roles.map(r => (
            <option key={r.role_id} value={r.role_id}>{r.name}</option>
          ))}
        </select>

        <select
          className="usr-select"
          value={filterStatus}
          onChange={handleFilter(setFilterStatus, statusRef)}
        >
          <option value="">Todos los estados</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>

        {isCentralAdmin && branches.length > 0 && (
          <select
            className="usr-select"
            value={filterBranch}
            onChange={handleFilter(setFilterBranch, branchRef)}
          >
            <option value="">Todas las sucursales</option>
            {branches.map(b => (
              <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="usr-alert">
          <i className="bi bi-exclamation-circle" />
          <span>{error}</span>
          <button onClick={() => setError(null)}><i className="bi bi-x" /></button>
        </div>
      )}

      {/* ── Tabla (desktop) ── */}
      {isLoading ? (
        <div className="usr-skeleton">
          {[...Array(5)].map((_, i) => <div key={i} className="usr-skeleton__row" />)}
        </div>
      ) : users.length === 0 ? (
        <div className="usr-empty">
          <i className="bi bi-people" />
          <span>No se encontraron usuarios</span>
        </div>
      ) : (
        <>
          <div className="usr-table-wrap">
            <table className="usr-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Sucursal</th>
                  <th>Cargo</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.user_id} className={!user.is_active ? 'usr-row--inactive' : ''}>
                    <td>
                      <div className="usr-user-cell">
                        <Avatar user={user} />
                        <div className="usr-user-info">
                          <button
                            className="usr-user-name usr-user-name--link"
                            onClick={() => setDetailUserId(user.user_id)}
                          >
                            {[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}
                          </button>
                          <div className="usr-user-username-row">
                            <span className="usr-user-username">@{user.username}</span>
                            {isSelf(user) && <span className="usr-detail__self-badge">Tú</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td><RoleBadge roleName={user.role_name} roleId={user.role_id} /></td>
                    <td className="usr-muted">
                      {user.branch_name ?? <span className="usr-badge-central">Central</span>}
                    </td>
                    <td className="usr-muted">{user.position ?? '—'}</td>
                    <td>
                      <span className={`usr-status ${user.is_active ? 'usr-status--on' : 'usr-status--off'}`}>
                        <span className="usr-status__dot" />
                        {user.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      {canActOnUser(user) && (
                        <div className="usr-actions">
                          {canEditThisUser(user) && (
                            <>
                              <button
                                className="usr-action-btn"
                                title="Editar"
                                onClick={() => setUserModal({ open: true, user })}
                              >
                                <i className="bi bi-pencil" />
                              </button>
                              <button
                                className="usr-action-btn"
                                title="Cambiar contraseña"
                                onClick={() => setChangePwModal(user)}
                              >
                                <i className="bi bi-key" />
                              </button>
                            </>
                          )}
                          {canDeactivateThisUser(user) && (
                            <button
                              className={`usr-action-btn ${user.is_active ? 'usr-action-btn--danger' : ''}`}
                              title={user.is_active ? 'Desactivar' : 'Activar'}
                              onClick={() => handleToggleStatus(user)}
                              disabled={toggling === user.user_id || isSelf(user)}
                            >
                              {toggling === user.user_id
                                ? <span className="usr-spinner" />
                                : <i className={`bi ${user.is_active ? 'bi-person-slash' : 'bi-person-check'}`} />
                              }
                            </button>
                          )}
                        </div>
                      )}
                      {!isSuperadmin && user.role_name === 'superadmin' && (
                        <span className="usr-badge-central" style={{ fontSize: 11, padding: '2px 8px' }}>
                          <i className="bi bi-shield-lock" /> Protegido
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards móvil */}
          <div className="usr-cards">
            {users.map(user => (
              <div
                key={user.user_id}
                className={`usr-card ${!user.is_active ? 'usr-card--inactive' : ''}`}
              >
                <div className="usr-card__top">
                  <div className="usr-user-cell">
                    <Avatar user={user} />
                    <div className="usr-user-info">
                      <button
                        className="usr-user-name usr-user-name--link"
                        onClick={() => setDetailUserId(user.user_id)}
                      >
                        {[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}
                      </button>
                      <span className="usr-user-username">@{user.username}</span>
                    </div>
                  </div>
                  <span className={`usr-status ${user.is_active ? 'usr-status--on' : 'usr-status--off'}`}>
                    <span className="usr-status__dot" />
                    {user.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                <div className="usr-card__meta">
                  <RoleBadge roleName={user.role_name} roleId={user.role_id} />
                  <span className="usr-meta">
                    <i className="bi bi-building" />
                    {user.branch_name ?? 'Central'}
                  </span>
                  {user.position && (
                    <span className="usr-meta">
                      <i className="bi bi-briefcase" />
                      {user.position}
                    </span>
                  )}
                </div>

                {canActOnUser(user) && (
                  <div className="usr-card__actions">
                    {canEditThisUser(user) && (
                      <>
                        <button
                          className="usr-btn usr-btn--ghost"
                          onClick={() => setUserModal({ open: true, user })}
                        >
                          <i className="bi bi-pencil" /><span>Editar</span>
                        </button>
                        <button
                          className="usr-btn usr-btn--ghost"
                          onClick={() => setChangePwModal(user)}
                        >
                          <i className="bi bi-key" /><span>Contraseña</span>
                        </button>
                      </>
                    )}
                    {canDeactivateThisUser(user) && (
                      <button
                        className={`usr-btn ${user.is_active ? 'usr-btn--danger-ghost' : 'usr-btn--ghost'}`}
                        onClick={() => handleToggleStatus(user)}
                        disabled={toggling === user.user_id || isSelf(user)}
                      >
                        {toggling === user.user_id
                          ? <span className="usr-spinner" />
                          : <i className={`bi ${user.is_active ? 'bi-person-slash' : 'bi-person-check'}`} />
                        }
                        <span>{user.is_active ? 'Desactivar' : 'Activar'}</span>
                      </button>
                    )}
                  </div>
                )}
                {!isSuperadmin && user.role_name === 'superadmin' && (
                  <div className="usr-card__actions">
                    <span className="usr-badge-central" style={{ fontSize: 11, padding: '4px 10px' }}>
                      <i className="bi bi-shield-lock" /> Protegido
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Paginación */}
          {pagination.totalPages > 1 && (
            <div className="usr-pagination">
              <button
                className="usr-btn usr-btn--ghost usr-btn--icon"
                onClick={() => setPage(p => p - 1)}
                disabled={page === 1}
              >
                <i className="bi bi-chevron-left" />
              </button>
              <span className="usr-pagination__info">
                Página <strong>{page}</strong> de <strong>{pagination.totalPages}</strong>
              </span>
              <button
                className="usr-btn usr-btn--ghost usr-btn--icon"
                onClick={() => setPage(p => p + 1)}
                disabled={page === pagination.totalPages}
              >
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Modales */}
      {userModal.open && (
        <UserModal
          user={userModal.user}
          roles={roles}
          branches={branches}
          onSaved={handleSaved}
          onClose={() => setUserModal({ open: false, user: null })}
        />
      )}

      {detailUserId && (() => {
        const targetUser = users.find(u => u.user_id === detailUserId)
        // Fallback conservador si el usuario no está en la página actual
        // (p. ej. se abrió desde otra vista): sin datos para evaluar la
        // jerarquía, no se muestran acciones — más seguro que asumir que sí.
        const canManage = targetUser ? canEditThisUser(targetUser) : false
        return (
          <UserDetailModal
            userId={detailUserId}
            isSelf={me?.user_id === detailUserId}
            canManage={canManage}
            onClose={() => setDetailUserId(null)}
            onEdit={(user) => setUserModal({ open: true, user })}
            onChangePassword={(user) => setChangePwModal(user)}
          />
        )
      })()}

      {changePwModal && (
        <ChangePasswordModal
          user={changePwModal}
          isSelf={isSelf(changePwModal)}
          onClose={() => setChangePwModal(null)}
        />
      )}

      {tempPass && (
        <TempPassModal
          username={tempPass.username}
          password={tempPass.password}
          onClose={() => setTempPass(null)}
        />
      )}

      {confirmTarget && (
        <ConfirmDialog
          title="Desactivar usuario"
          message={`¿Desactivar a @${confirmTarget.username}? Se cerrarán todas sus sesiones activas de inmediato.`}
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

export default Users