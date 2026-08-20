// src/components/App.jsx
import { useState } from 'react'
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import { useUser } from '../Context/UserContext'
import { useBranch } from '../context/BranchContext'
import './app.css'

function App() {
  const { user, isLoading, logout, hasPermission, isCentralAdmin } = useUser()
  const {selectedBranch} = useBranch()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  const userBranchName = isCentralAdmin 
  ? "Sin Sucursal" 
  : (selectedBranch?.name || "Sin Sucursal"); // Respaldo por si no ha cargado

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="app-loading__spinner" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  const isPosRoute = location.pathname === '/pos'

  const navItems = [
    { to: '/pos',                icon: 'bi-pc-display-horizontal', label: 'POS',          perm: ['pos',       'use']   },
    { to: '/dashboard',          icon: 'bi-graph-up-arrow',        label: 'Dashboard',    perm: ['dashboard', 'read']  },
    { to: '/orders',             icon: 'bi-clipboard2-data',       label: 'Ventas',       perm: ['orders',    'read']  },
    { to: '/products',           icon: 'bi-boxes',                 label: 'Productos',    perm: ['products',  'read']  },
    { to: '/inventory',          icon: 'bi-box-seam',              label: 'Inventario',   perm: ['inventory',  'read']  },
    { to: '/providers',          icon: 'bi-truck',                 label: 'Proveedores',  perm: ['providers', 'read']  },
    { to: '/customers',          icon: 'bi-person-badge',          label: 'Clientes',     perm: ['customers', 'read']  },
    { to: '/layaways',           icon: 'bi-bookmark-check',        label: 'Apartados',    perm: ['layaway',   'read']  },
    { to: '/credits',            icon: 'bi-clock-history',         label: 'Créditos',     perm: ['credit',    'read']  },
     { to: '/returns',           icon: 'bi-arrow-return-left',     label: 'Devoluciones', perm: ['returns',    'read']  },
    { to: '/reports',            icon: 'bi-bar-chart-line',        label: 'Reportes',     perm: ['reports',   'basic'] },
    { to: '/users',              icon: 'bi-person',                label: 'Usuarios',     perm: ['users',     'read']  },
  ].filter(item => hasPermission(...item.perm))

  return (
    <div className="app-root">
      {!isPosRoute && (
        <>
          {/* Sidebar — visible en tablet/desktop */}
          <aside className="app-sidebar">
            <div className="app-sidebar__brand">
              <i className="bi bi-shop" />
              <span>SmallPos V2.0</span>
            </div>

            <nav className="app-sidebar__nav">
              {navItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `app-nav-item ${isActive ? 'app-nav-item--active' : ''}`
                  }
                >
                  <i className={`bi ${item.icon}`} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="app-sidebar__footer">
              {hasPermission('settings', 'read') && (
                <NavLink
                  to="/settings"
                  className={({ isActive }) =>
                    `app-nav-item ${isActive ? 'app-nav-item--active' : ''}`
                  }
                >
                  <i className="bi bi-gear" />
                  <span>Configuración</span>
                </NavLink>
              )}
              <div className="app-sidebar__user">
                <i className="bi bi-person-circle" />
                <div className="app-sidebar__user-info">
                  <span className="app-sidebar__username">{user.username}</span>
                  <span className="app-sidebar__role">
                    {/* FIX: se agrega la sucursal junto al rol, cuando el usuario tenga una */}
                    {user.role_name}{` · ${userBranchName}`}
                  </span>
                </div>
                <button
                  className="app-sidebar__logout"
                  title="Cerrar sesión"
                  onClick={logout}
                >
                  <i className="bi bi-box-arrow-right" />
                </button>
              </div>
            </div>
          </aside>

          {/* Bottom nav — visible solo en móvil (máx 4 items + botón Más) */}
          <nav className="app-bottom-nav">
            {navItems.slice(0, 4).map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `app-bottom-item ${isActive ? 'app-bottom-item--active' : ''}`
                }
              >
                <i className={`bi ${item.icon}`} />
                <span>{item.label}</span>
              </NavLink>
            ))}

            {navItems.length > 4 && (
              <button
                className={`app-bottom-item app-bottom-item--btn ${moreOpen ? 'app-bottom-item--active' : ''}`}
                onClick={() => setMoreOpen(true)}
              >
                <i className="bi bi-grid" />
                <span>Más</span>
              </button>
            )}
          </nav>

          {/* Panel lateral "Más" — móvil */}
          {moreOpen && (
            <>
              <div
                className="app-more-backdrop"
                onClick={() => setMoreOpen(false)}
              />
              <div className="app-more-panel">
                <div className="app-more-panel__header">
                  <span>Menú</span>
                  <button
                    className="app-more-panel__close"
                    onClick={() => setMoreOpen(false)}
                  >
                    <i className="bi bi-x-lg" />
                  </button>
                </div>

                <nav className="app-more-panel__nav">
                  {navItems.slice(4).map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `app-nav-item ${isActive ? 'app-nav-item--active' : ''}`
                      }
                      onClick={() => setMoreOpen(false)}
                    >
                      <i className={`bi ${item.icon}`} />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}

                  {hasPermission('settings', 'read') && (
                    <NavLink
                      to="/settings"
                      className={({ isActive }) =>
                        `app-nav-item ${isActive ? 'app-nav-item--active' : ''}`
                      }
                      onClick={() => setMoreOpen(false)}
                    >
                      <i className="bi bi-gear" />
                      <span>Configuración</span>
                    </NavLink>
                  )}
                </nav>

                <div className="app-more-panel__footer">
                  <div className="app-sidebar__user">
                    <i className="bi bi-person-circle" />
                    <div className="app-sidebar__user-info">
                      <span className="app-sidebar__username">{user.username}</span>
                      <span className="app-sidebar__role">
                        {/* FIX: se agrega la sucursal junto al rol, cuando el usuario tenga una */}
                        {user.role_name}{user.branch_name ? ` · ${user.branch_name}` : ''}
                      </span>
                    </div>
                    <button
                      className="app-sidebar__logout"
                      title="Cerrar sesión"
                      onClick={logout}
                    >
                      <i className="bi bi-box-arrow-right" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <main className={`app-main ${isPosRoute ? 'app-main--pos' : ''}`}>
        <Outlet />
      </main>
    </div>
  )
}

export default App