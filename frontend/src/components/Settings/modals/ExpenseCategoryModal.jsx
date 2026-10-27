// src/components/Settings/modals/ExpenseCategoryModal.jsx
// Crear o editar una categoría de gasto: nombre y la marca "Cuenta en la
// utilidad neta" (specs/12-modulo-de-gastos.md, requisito 3).
import { useState } from 'react'
import api from '../../../services/api'

const ExpenseCategoryModal = ({ category, onSaved, onClose }) => {
  const isEdit = !!category

  const [name,     setName]     = useState(category?.name ?? '')
  const [counts,   setCounts]   = useState(category ? !!category.counts_in_net_profit : true)
  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)
    try {
      const payload = { name: name.trim(), counts_in_net_profit: counts }
      const { data } = isEdit
        ? await api.put(`expense-categories/${category.expense_category_id}`, payload)
        : await api.post('expense-categories', payload)
      onSaved(data.data)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al guardar')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="set-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="set-modal set-modal--sm" role="dialog" aria-label={isEdit ? 'Editar categoría de gasto' : 'Nueva categoría de gasto'}>
        <div className="set-modal__header">
          <h3 className="set-modal__title">
            <i className="bi bi-wallet2" />
            {isEdit ? 'Editar categoría de gasto' : 'Nueva categoría de gasto'}
          </h3>
          <button className="set-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <form className="set-modal__body" onSubmit={handleSubmit}>
          {error && (
            <div className="set-alert set-alert--error">
              <i className="bi bi-exclamation-circle" />
              <span>{error}</span>
            </div>
          )}

          <div className="set-field">
            <label className="set-field__label" htmlFor="exp-cat-name">
              Nombre <span className="set-field__req">*</span>
            </label>
            <input
              id="exp-cat-name"
              className="set-field__input"
              value={name}
              onChange={e => { setName(e.target.value); setError(null) }}
              placeholder="Ej. Renta, Publicidad, Fletes"
              required
              autoFocus
              maxLength={100}
            />
          </div>

          <label className="set-check">
            <input type="checkbox" checked={counts} onChange={e => setCounts(e.target.checked)} />
            <span>
              <strong>Cuenta en la utilidad neta</strong>
              <span className="set-field__hint">
                Apágalo para lo que ya cuenta como costo al vender, como el pago de mercancía a un proveedor.
              </span>
            </span>
          </label>

          <div className="set-modal__footer">
            <button type="button" className="set-btn set-btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="set-btn set-btn--primary" disabled={isSaving || !name.trim()}>
              {isSaving
                ? <><span className="set-spinner set-spinner--sm" /> Guardando...</>
                : <><i className="bi bi-floppy" /> {isEdit ? 'Guardar cambios' : 'Crear categoría'}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ExpenseCategoryModal
