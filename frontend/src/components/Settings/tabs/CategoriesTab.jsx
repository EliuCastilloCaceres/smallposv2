// src/components/Settings/tabs/CategoriesTab.jsx
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '../../../Context/UserContext'
import api from '../../../services/api'
import CategoryModal from '../modals/CategoryModal'
import ConfirmDialog from '../../Common/ConfirmDialog'

const CategoriesTab = ({ isCentralAdmin }) => {
  const { hasPermission } = useUser()
  const canEdit = isCentralAdmin && hasPermission('products', 'update')

  const [categories,    setCategories]    = useState([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [error,         setError]         = useState(null)
  const [modal,         setModal]         = useState({ open: false, category: null })
  const [toggling,      setToggling]      = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null)

  const fetchCategories = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data } = await api.get('categories')
      setCategories(data.data)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar categorías')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  const handleToggleStatus = (category) => {
    if (category.is_active) {
      setConfirmTarget(category)
      return
    }
    performToggle(category)
  }

  const performToggle = async (category) => {
    setToggling(category.category_id)
    setError(null)
    try {
      const { data } = await api.patch(
        `categories/${category.category_id}/status`,
        { is_active: !category.is_active }
      )
      setCategories(prev => prev.map(c =>
        c.category_id === category.category_id ? data.data : c
      ))
      if (data.data.warning) setError(data.data.warning)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cambiar estado')
    } finally {
      setToggling(null)
    }
  }

  const handleSaved = (savedCategory) => {
    setCategories(prev => {
      const exists = prev.find(c => c.category_id === savedCategory.category_id)
      return exists
        ? prev.map(c => c.category_id === savedCategory.category_id ? savedCategory : c)
        : [savedCategory, ...prev]
    })
    setModal({ open: false, category: null })
  }

  // ── Contadores para el summary ──
  const activeCount   = categories.filter(c => c.is_active).length
  const inactiveCount = categories.length - activeCount

  // ── Skeleton ──
  if (isLoading) return (
    <div className="set-skeleton">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="set-skeleton__row" style={{ height: '72px' }} />
      ))}
    </div>
  )

  return (
    <div className="set-section">
      {/* ── Header ── */}
      <div className="set-section__head">
        <div>
          <h2 className="set-section__title">Categorías de productos</h2>
          <p className="set-section__sub">
            Globales — disponibles para todas las sucursales
          </p>
        </div>
        {canEdit && (
          <button
            className="set-btn set-btn--primary"
            onClick={() => setModal({ open: true, category: null })}
          >
            <i className="bi bi-plus-lg" />
            <span>Nueva categoría</span>
          </button>
        )}
      </div>

      {/* ── Summary ── */}
      {categories.length > 0 && (
        <div className="set-summary">
          <div className="set-summary__item">
            <span className="set-summary__val">{categories.length}</span>
            <span className="set-summary__label">Total</span>
          </div>
          <div className="set-summary__item">
            <span className="set-summary__val set-summary__val--on">{activeCount}</span>
            <span className="set-summary__label">Activas</span>
          </div>
          <div className="set-summary__item">
            <span className="set-summary__val" style={{ color: 'var(--set-muted)' }}>{inactiveCount}</span>
            <span className="set-summary__label">Inactivas</span>
          </div>
        </div>
      )}

      {/* ── Warning / Error ── */}
      {error && (
        <div className="set-alert set-alert--warn">
          <i className="bi bi-exclamation-triangle" />
          <span>{error}</span>
          <button className="set-alert__close" onClick={() => setError(null)}>
            <i className="bi bi-x" />
          </button>
        </div>
      )}

      {/* ── Grid de categorías ── */}
      {categories.length === 0 ? (
        <div className="set-empty">
          <i className="bi bi-tag" />
          <span>No hay categorías registradas</span>
        </div>
      ) : (
        <div className="set-cat-grid">
          {categories.map(category => (
            <div
              key={category.category_id}
              className={`set-card set-cat-card ${!category.is_active ? 'set-card--inactive' : ''}`}
            >
              {/* Barra lateral con color personalizado o verde/gris según estado */}
              <span
                className="set-card__dot"
                style={{
                  background: category.is_active
                    ? (category.color ?? 'var(--set-green)')
                    : 'var(--set-border)',
                }}
              />

              <div className="set-card__body">
                <div className="set-card__row">
                  <div className="set-card__info">
                    {/* Nombre con swatch de color */}
                    <div className="set-cat-name">
                      {category.color && (
                        <span
                          className="set-cat-swatch"
                          style={{ background: category.color }}
                          title={category.color}
                        />
                      )}
                      <span className="set-card__name">{category.name}</span>
                    </div>

                    {category.description && (
                      <span className="set-card__meta">{category.description}</span>
                    )}
                  </div>

                  {/* Badge de productos */}
                  <span className={`set-badge ${category.product_count > 0 ? 'set-badge--open' : 'set-badge--off'}`}>
                    <i className="bi bi-box-seam" />
                    {category.product_count} {category.product_count === 1 ? 'producto' : 'productos'}
                  </span>
                </div>

                {/* Acciones — solo admin */}
                {canEdit && (
                  <div className="set-card__actions">
                    <button
                      className="set-btn set-btn--ghost"
                      onClick={() => setModal({ open: true, category })}
                    >
                      <i className="bi bi-pencil" />
                      <span>Editar</span>
                    </button>
                    <button
                      className={`set-btn ${category.is_active ? 'set-btn--danger-ghost' : 'set-btn--ghost'}`}
                      onClick={() => handleToggleStatus(category)}
                      disabled={toggling === category.category_id}
                    >
                      {toggling === category.category_id
                        ? <span className="set-spinner set-spinner--sm" />
                        : <i className={`bi ${category.is_active ? 'bi-slash-circle' : 'bi-check-circle'}`} />
                      }
                      <span>{category.is_active ? 'Desactivar' : 'Activar'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal crear / editar ── */}
      {modal.open && (
        <CategoryModal
          category={modal.category}
          onSaved={handleSaved}
          onClose={() => setModal({ open: false, category: null })}
        />
      )}

      {/* ── Confirmación desactivar ── */}
      {confirmTarget && (
        <ConfirmDialog
          title="Desactivar categoría"
          message={
            confirmTarget.product_count > 0
              ? `¿Desactivar "${confirmTarget.name}"? Tiene ${confirmTarget.product_count} producto(s) activo(s) asignado(s). Los productos no serán afectados pero perderán visibilidad de categoría.`
              : `¿Desactivar la categoría "${confirmTarget.name}"?`
          }
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

export default CategoriesTab