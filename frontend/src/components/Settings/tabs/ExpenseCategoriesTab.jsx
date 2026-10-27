// src/components/Settings/tabs/ExpenseCategoriesTab.jsx
// Categorías de gasto (specs/12-modulo-de-gastos.md, requisito 3): se crean,
// se editan y se activan o desactivan, pero no se borran. Esta pestaña solo
// la ve quien tiene expenses.categories (Settings.jsx), así que todas las
// acciones están disponibles.
import { useState, useEffect, useCallback } from 'react'
import api from '../../../services/api'
import ExpenseCategoryModal from '../modals/ExpenseCategoryModal'
import ConfirmDialog from '../../Common/ConfirmDialog'

const fmtExpenses = (n) => `${n} gasto${n !== 1 ? 's' : ''}`

const ExpenseCategoriesTab = () => {
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
      const { data } = await api.get('expense-categories')
      setCategories(data.data)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar las categorías de gasto')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  const performToggle = async (category) => {
    setToggling(category.expense_category_id)
    setError(null)
    try {
      const { data } = await api.patch(
        `expense-categories/${category.expense_category_id}/status`,
        { is_active: !category.is_active }
      )
      setCategories(prev => prev.map(c =>
        c.expense_category_id === category.expense_category_id ? data.data : c
      ))
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cambiar el estado')
    } finally {
      setToggling(null)
    }
  }

  const handleToggleStatus = (category) => {
    if (category.is_active) setConfirmTarget(category)
    else performToggle(category)
  }

  const handleSaved = (saved) => {
    setCategories(prev => prev.some(c => c.expense_category_id === saved.expense_category_id)
      ? prev.map(c => c.expense_category_id === saved.expense_category_id ? saved : c)
      : [saved, ...prev])
    setModal({ open: false, category: null })
  }

  const activeCount = categories.filter(c => c.is_active).length

  if (isLoading) return (
    <div className="set-skeleton">
      {[...Array(4)].map((_, i) => <div key={i} className="set-skeleton__row" style={{ height: '72px' }} />)}
    </div>
  )

  return (
    <div className="set-section">
      <div className="set-section__head">
        <div>
          <h2 className="set-section__title">Categorías de gasto</h2>
          <p className="set-section__sub">Globales — para los gastos de todas las sucursales</p>
        </div>
        <button className="set-btn set-btn--primary" onClick={() => setModal({ open: true, category: null })}>
          <i className="bi bi-plus-lg" />
          <span>Nueva categoría</span>
        </button>
      </div>

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
            <span className="set-summary__val" style={{ color: 'var(--set-muted)' }}>{categories.length - activeCount}</span>
            <span className="set-summary__label">Inactivas</span>
          </div>
        </div>
      )}

      {error && (
        <div className="set-alert set-alert--warn">
          <i className="bi bi-exclamation-triangle" />
          <span>{error}</span>
          <button className="set-alert__close" onClick={() => setError(null)} aria-label="Cerrar aviso">
            <i className="bi bi-x" />
          </button>
        </div>
      )}

      {categories.length === 0 ? (
        <div className="set-empty">
          <i className="bi bi-wallet2" />
          <span>No hay categorías de gasto registradas</span>
        </div>
      ) : (
        <div className="set-cat-grid">
          {categories.map(category => (
            <div
              key={category.expense_category_id}
              className={`set-card set-cat-card ${!category.is_active ? 'set-card--inactive' : ''}`}
            >
              <span
                className="set-card__dot"
                style={{ background: category.is_active ? 'var(--set-green)' : 'var(--set-border)' }}
              />
              <div className="set-card__body">
                <div className="set-card__row">
                  <div className="set-card__info">
                    <span className="set-card__name">{category.name}</span>
                    <span className="set-card__meta">
                      {category.counts_in_net_profit
                        ? 'Cuenta en la utilidad neta'
                        : 'No cuenta en la utilidad neta'}
                    </span>
                  </div>
                  <span className={`set-badge ${category.expense_count > 0 ? 'set-badge--open' : 'set-badge--off'}`}>
                    <i className="bi bi-receipt" />
                    {fmtExpenses(category.expense_count)}
                  </span>
                </div>

                <div className="set-card__actions">
                  <button
                    className="set-btn set-btn--ghost"
                    onClick={() => setModal({ open: true, category })}
                    aria-label={`Editar ${category.name}`}
                  >
                    <i className="bi bi-pencil" />
                    <span>Editar</span>
                  </button>
                  <button
                    className={`set-btn ${category.is_active ? 'set-btn--danger-ghost' : 'set-btn--ghost'}`}
                    onClick={() => handleToggleStatus(category)}
                    disabled={toggling === category.expense_category_id}
                    aria-label={`${category.is_active ? 'Desactivar' : 'Activar'} ${category.name}`}
                  >
                    {toggling === category.expense_category_id
                      ? <span className="set-spinner set-spinner--sm" />
                      : <i className={`bi ${category.is_active ? 'bi-slash-circle' : 'bi-check-circle'}`} />
                    }
                    <span>{category.is_active ? 'Desactivar' : 'Activar'}</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <ExpenseCategoryModal
          category={modal.category}
          onSaved={handleSaved}
          onClose={() => setModal({ open: false, category: null })}
        />
      )}

      {confirmTarget && (
        <ConfirmDialog
          title="Desactivar categoría de gasto"
          message={`¿Desactivar "${confirmTarget.name}"? Ya no se podrá usar en un gasto nuevo; los gastos que ya la tienen la conservan.`}
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

export default ExpenseCategoriesTab
