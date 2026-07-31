// src/components/Dashboard/Dashboard.jsx
import { useState } from 'react'
import { useUser }   from '../../context/UserContext'
import useApi        from '../../hooks/useApi'
import { format }    from 'date-fns'
import { es }        from 'date-fns/locale'
import './dashboard.css'

// ── Helpers ──────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)

const today = () => new Date().toISOString().split('T')[0]

// ── Sub-componentes pequeños ──────────────────────────────────

const StatCard = ({ icon, label, value, sub, accent }) => (
  <div className={`dash-stat ${accent ? 'dash-stat--accent' : ''}`}>
    <div className="dash-stat__icon">
      <i className={`bi ${icon}`} />
    </div>
    <div className="dash-stat__body">
      <span className="dash-stat__value">{value}</span>
      <span className="dash-stat__label">{label}</span>
      {sub && <span className="dash-stat__sub">{sub}</span>}
    </div>
  </div>
)

const EmptyState = ({ icon, text }) => (
  <div className="dash-empty">
    <i className={`bi ${icon}`} />
    <span>{text}</span>
  </div>
)

const Skeleton = ({ rows = 4 }) => (
  <div className="dash-skeleton">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="dash-skeleton__row" style={{ animationDelay: `${i * 80}ms` }} />
    ))}
  </div>
)

// ── Componente principal ──────────────────────────────────────
const Dashboard = () => {
  const { user, hasPermission } = useUser()
  const [date, setDate]         = useState(today())

  const isAdmin   = user?.branch_id === null
  const endpoint  = `dashboard?date=${date}`

  const { data, isLoading, error, refetch } = useApi(endpoint)

  // ── Acceso ────────────────────────────────────────────────
  if (!hasPermission('reports', 'basic')) {
    return (
      <div className="dash-forbidden">
        <i className="bi bi-lock" />
        <p>Sin acceso al dashboard</p>
      </div>
    )
  }

  // ── Admin overview (multi-sucursal) ───────────────────────
  if (isAdmin && data) {
    return (
      <div className="dash-root">
        <DashHeader date={date} setDate={setDate} refetch={refetch} isLoading={isLoading} />
        <AdminOverview branches={data} />
      </div>
    )
  }

  // ── Dashboard de sucursal ─────────────────────────────────
  const orders        = data?.orders        ?? {}
  const productsSold  = data?.products_sold ?? []
  const cashRegs      = data?.cash_registers ?? []
  const lowStock      = data?.low_stock      ?? []

  const totalInCash = cashRegs.reduce((s, cr) => s + (cr.expected_close ?? 0), 0)

  return (
    <div className="dash-root">
      <DashHeader date={date} setDate={setDate} refetch={refetch} isLoading={isLoading} />

      {error && (
        <div className="dash-error">
          <i className="bi bi-exclamation-triangle" />
          {error}
        </div>
      )}

      {/* ── KPIs ── */}
      <section className="dash-stats">
        <StatCard
          icon="bi-cart-check"
          label="Ventas hoy"
          value={isLoading ? '—' : (orders.orders_total ?? 0)}
        />
        <StatCard
          icon="bi-boxes"
          label="Piezas vendidas"
          value={isLoading ? '—' : (orders.total_units_sold ?? 0)}
        />
        <StatCard
          icon="bi-cash-stack"
          label="Ingresos"
          value={isLoading ? '—' : fmt(orders.income)}
          accent
        />
        <StatCard
          icon="bi-tag"
          label="Descuentos"
          value={isLoading ? '—' : fmt(orders.total_discount)}
          sub={orders.income > 0
            ? `${((orders.total_discount / orders.income) * 100).toFixed(1)}% del total`
            : null}
        />
      </section>

      {/* ── Cuerpo ── */}
      <div className="dash-body">

        {/* Productos más vendidos */}
        <section className="dash-panel">
          <h2 className="dash-panel__title">
            <i className="bi bi-trophy" />
            Top productos hoy
          </h2>
          {isLoading
            ? <Skeleton rows={5} />
            : productsSold.length === 0
              ? <EmptyState icon="bi-cart-x" text="Sin ventas registradas hoy" />
              : (
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Producto</th>
                        <th>SKU</th>
                        <th className="num">Cant.</th>
                        <th className="num">Ingresos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productsSold.map((p, i) => (
                        <tr key={p.product_id}>
                          <td className="rank">{i + 1}</td>
                          <td>
                            <div className="dash-product">
                              <img
                                src={`${import.meta.env.VITE_URL_BASE}product/images/${p.image ?? 'sin_imagen.jpg'}`}
                                alt={p.name}
                                className="dash-product__img"
                                onError={e => { e.target.src = '/placeholder.png' }}
                              />
                              <span className="dash-product__name">{p.name}</span>
                            </div>
                          </td>
                          <td className="mono">{p.sku}</td>
                          <td className="num">
                            <span className="dash-badge">{p.total_sold}</span>
                          </td>
                          <td className="num green">{fmt(p.total_revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          }
        </section>

        {/* Columna derecha */}
        <div className="dash-side">

          {/* Cajas abiertas */}
          <section className="dash-panel">
            <h2 className="dash-panel__title">
              <i className="bi bi-pc-display-horizontal" />
              Cajas abiertas
            </h2>
            {isLoading
              ? <Skeleton rows={2} />
              : cashRegs.length === 0
                ? <EmptyState icon="bi-lock" text="No hay cajas abiertas" />
                : (
                  <>
                    <ul className="dash-cr-list">
                      {cashRegs.map(cr => (
                        <li key={cr.cash_register_id} className="dash-cr-card">
                          <div className="dash-cr-card__header">
                            <span className="dash-cr-card__name">{cr.register_name}</span>
                            <span className="dash-cr-card__user">
                              <i className="bi bi-person" />
                              {cr.first_name} {cr.last_name}
                            </span>
                          </div>
                          <div className="dash-cr-card__row">
                            <span>Apertura</span>
                            <span className="mono">{fmt(cr.open_amount)}</span>
                          </div>
                          <div className="dash-cr-card__row">
                            <span>Ingresos</span>
                            <span className="green mono">{fmt(cr.total_in)}</span>
                          </div>
                          <div className="dash-cr-card__row">
                            <span>Egresos</span>
                            <span className="red mono">{fmt(cr.total_out)}</span>
                          </div>
                          <div className="dash-cr-card__total">
                            <span>Saldo estimado</span>
                            <span className={`mono ${cr.expected_close >= 0 ? 'green' : 'red'}`}>
                              {fmt(cr.expected_close)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="dash-cr-footer">
                      <span>Total en cajas</span>
                      <strong className="mono">{fmt(totalInCash)}</strong>
                    </div>
                  </>
                )
            }
          </section>

          {/* Stock bajo */}
          {lowStock.length > 0 && (
            <section className="dash-panel dash-panel--warning">
              <h2 className="dash-panel__title">
                <i className="bi bi-exclamation-triangle" />
                Stock bajo
                <span className="dash-badge dash-badge--warn">{lowStock.length}</span>
              </h2>
              <ul className="dash-stock-list">
                {lowStock.map(item => (
                  <li key={`${item.product_id}-${item.variant_label ?? 'base'}`} className="dash-stock-item">
                    <div className="dash-stock-item__info">
                      <span className="dash-stock-item__name">{item.name}</span>
                      {item.variant_label && (
                        <span className="dash-stock-item__variant">{item.variant_label}</span>
                      )}
                      <span className="mono dash-stock-item__sku">{item.sku}</span>
                    </div>
                    <span className={`dash-stock-item__qty ${item.stock === 0 ? 'zero' : ''}`}>
                      {item.stock}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Header con selector de fecha ──────────────────────────────
const DashHeader = ({ date, setDate, refetch, isLoading }) => {
  const label = format(new Date(date + 'T12:00:00'), "EEEE d 'de' MMMM, yyyy", { locale: es })

  return (
    <header className="dash-header">
      <div className="dash-header__left">
        <h1 className="dash-header__title">Dashboard</h1>
        <span className="dash-header__date">{label}</span>
      </div>
      <div className="dash-header__right">
        <input
          type="date"
          className="dash-date-input"
          value={date}
          max={today()}
          onChange={e => setDate(e.target.value)}
        />
        <button
          className="dash-refresh-btn"
          onClick={() => refetch()}
          disabled={isLoading}
          title="Actualizar"
          aria-label="Actualizar dashboard"
        >
          <i className={`bi bi-arrow-clockwise ${isLoading ? 'spinning' : ''}`} />
        </button>
      </div>
    </header>
  )
}

// ── Vista admin multi-sucursal ────────────────────────────────
const AdminOverview = ({ branches }) => (
  <div className="dash-admin">
    <p className="dash-admin__sub">Vista global — todas las sucursales</p>
    <div className="dash-admin-grid">
      {branches.map(b => (
        <div key={b.branch_id} className="dash-branch-card">
          <div className="dash-branch-card__header">
            <i className="bi bi-shop" />
            <span>{b.branch_name}</span>
          </div>
          <div className="dash-branch-card__stat">
            <span>Ventas</span>
            <strong>{b.orders_today}</strong>
          </div>
          <div className="dash-branch-card__stat">
            <span>Ingresos</span>
            <strong className="green">{fmt(b.revenue_today)}</strong>
          </div>
          <div className="dash-branch-card__stat">
            <span>Cajas abiertas</span>
            <strong>{b.open_registers}</strong>
          </div>
        </div>
      ))}
    </div>
  </div>
)

export default Dashboard
