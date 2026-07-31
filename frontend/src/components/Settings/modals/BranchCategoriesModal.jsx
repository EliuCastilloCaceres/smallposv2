// src/components/Settings/modals/BranchCategoriesModal.jsx
import { useState, useEffect } from 'react'
import api from '../../../services/api'

const BranchCategoriesModal = ({ branch, onClose }) => {
  const [categories, setCategories] = useState(null) // null = cargando
  const [isSaving,   setIsSaving]   = useState(false)
  const [error,      setError]      = useState(null)
  const [isDirty,    setIsDirty]    = useState(false)

  useEffect(() => {
    api.get(`categories/branch/${branch.branch_id}`)
      .then(({ data }) => setCategories(data.data))
      .catch(err => setError(err.response?.data?.message ?? 'Error al cargar categorías'))
  }, [branch.branch_id])

  const toggleCategory = (categoryId) => {
    setCategories(prev => prev.map(c =>
      c.category_id === categoryId ? { ...c, visible: !c.visible } : c
    ))
    setIsDirty(true)
    setError(null)
  }

  const handleToggleAll = (visible) => {
    setCategories(prev => prev.map(c => ({ ...c, visible })))
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
      const hidden_category_ids = categories.filter(c => !c.visible).map(c => c.category_id)
      await api.put(`categories/branch/${branch.branch_id}`, { hidden_category_ids })
      onClose()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al guardar')
    } finally {
      setIsSaving(false)
    }
  }

  const visibleCount = categories?.filter(c => c.visible).length ?? 0

  return (
    <div className="set-overlay" onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="set-modal">
        <div className="set-modal__header">
          <h3 className="set-modal__title">
            <i className="bi bi-bookmark-star" />
            Categorías POS — {branch.name}
          </h3>
          <button className="set-modal__close" onClick={handleClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <form className="set-modal__body" onSubmit={handleSubmit}>
          <p className="set-section__sub" style={{ margin: 0 }}>
            Elige qué categorías verá esta sucursal en el punto de venta.
          </p>

          {error && (
            <div className="set-alert set-alert--error">
              <i className="bi bi-exclamation-circle" />
              <span>{error}</span>
              <button type="button" className="set-alert__close" onClick={() => setError(null)}>
                <i className="bi bi-x" />
              </button>
            </div>
          )}

          {categories === null ? (
            <div className="set-skeleton">
              {[...Array(4)].map((_, i) => <div key={i} className="set-skeleton__row" />)}
            </div>
          ) : categories.length === 0 ? (
            <div className="set-empty">
              <i className="bi bi-bookmark" />
              <span>No hay categorías activas para configurar</span>
            </div>
          ) : (
            <>
              <div className="set-card__row" style={{ flexWrap: 'wrap' }}>
                <span className="set-section__sub" style={{ margin: 0 }}>
                  {visibleCount}/{categories.length} visibles
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="set-btn set-btn--ghost" onClick={() => handleToggleAll(true)}>
                    <i className="bi bi-check-all" />
                    <span>Mostrar todas</span>
                  </button>
                  <button type="button" className="set-btn set-btn--ghost" onClick={() => handleToggleAll(false)}>
                    <i className="bi bi-x-lg" />
                    <span>Ocultar todas</span>
                  </button>
                </div>
              </div>

              <div className="set-cards">
                {categories.map(cat => (
                  <label
                    key={cat.category_id}
                    className="set-card"
                    style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={cat.visible}
                      onChange={() => toggleCategory(cat.category_id)}
                      style={{ width: 16, height: 16, accentColor: 'var(--set-accent)', flexShrink: 0 }}
                    />
                    <span
                      style={{
                        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                        background: cat.color || 'var(--set-border)',
                      }}
                    />
                    <span className="set-card__name" style={{ flex: 1 }}>{cat.name}</span>
                    <span className={`set-badge ${cat.visible ? 'set-badge--on' : 'set-badge--off'}`}>
                      {cat.visible ? 'Visible' : 'Oculta'}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

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
              disabled={isSaving || !isDirty || categories === null}
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

export default BranchCategoriesModal
