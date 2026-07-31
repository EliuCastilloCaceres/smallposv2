// src/components/Common/BranchPicker.jsx
import { useBranch } from '../../Context/BranchContext'
import './branch-picker.css'

// ── Initials helper ───────────────────────────────────────────────────────────
const initials = (name) =>
  name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() ?? '?'

// ── Componente ────────────────────────────────────────────────────────────────
const BranchPicker = ({ title, description }) => {
  const { branches, isLoading, error, selectBranch } = useBranch()

  return (
    <div className="bp-root">
      <div className="bp-card">

        {/* Icono + texto */}
        <div className="bp-header">
          <div className="bp-icon">
            <i className="bi bi-building" />
          </div>
          <h2 className="bp-title">{title ?? 'Selecciona una sucursal'}</h2>
          <p className="bp-desc">
            {description ?? 'Este módulo muestra información por sucursal. Elige una para continuar.'}
          </p>
        </div>

        {/* Estados */}
        {isLoading && (
          <div className="bp-list">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bp-skeleton" />
            ))}
          </div>
        )}

        {error && !isLoading && (
          <div className="bp-error">
            <i className="bi bi-exclamation-circle" />
            <span>{error}</span>
          </div>
        )}

        {!isLoading && !error && branches.length === 0 && (
          <div className="bp-empty">
            <i className="bi bi-building-slash" />
            <span>No hay sucursales activas disponibles</span>
          </div>
        )}

        {/* Lista de sucursales */}
        {!isLoading && !error && branches.length > 0 && (
          <ul className="bp-list">
            {branches.map(branch => (
              <li key={branch.branch_id}>
                <button
                  className="bp-item"
                  onClick={() => selectBranch(branch)}
                >
                  <div className="bp-item__avatar">
                    {initials(branch.name)}
                  </div>
                  <div className="bp-item__info">
                    <span className="bp-item__name">{branch.name}</span>
                    {(branch.city || branch.state) && (
                      <span className="bp-item__meta">
                        <i className="bi bi-geo-alt" />
                        {[branch.city, branch.state].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                  <i className="bi bi-chevron-right bp-item__arrow" />
                </button>
              </li>
            ))}
          </ul>
        )}

      </div>
    </div>
  )
}

export default BranchPicker
