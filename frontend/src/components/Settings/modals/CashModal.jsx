// src/components/Settings/modals/CashModal.jsx
import { useState, useEffect } from 'react'
import api from '../../../services/api'

const CashModal = ({ register, branchId, onSaved, onClose }) => {
  const isEdit = !!register
  const [name,     setName]     = useState(register?.name ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setIsSaving(true)
    setError(null)
    try {
      const { data } = isEdit
        ? await api.put(`cash-registers/${register.cash_register_id}`, { name: name.trim() })
        : await api.post('cash-registers', { name: name.trim(), branch_id: branchId })
      onSaved(data.data)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al guardar')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="set-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="set-modal set-modal--sm">
        <div className="set-modal__header">
          <h3 className="set-modal__title">
            <i className={`bi ${isEdit ? 'bi-cash-register' : 'bi-plus-square'}`} />
            {isEdit ? 'Editar caja' : 'Nueva caja'}
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
            <label className="set-field__label" htmlFor="cr-name">
              Nombre de la caja <span className="set-field__req">*</span>
            </label>
            <input
              id="cr-name"
              className="set-field__input"
              value={name}
              onChange={e => { setName(e.target.value); setError(null) }}
              placeholder="Caja 1"
              required
              autoFocus
              maxLength={100}
            />
          </div>

          <div className="set-modal__footer">
            <button type="button" className="set-btn set-btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="set-btn set-btn--primary"
              disabled={isSaving || !name.trim()}
            >
              {isSaving
                ? <><span className="set-spinner set-spinner--sm" /> Guardando...</>
                : <><i className="bi bi-floppy" /> {isEdit ? 'Guardar cambios' : 'Crear caja'}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CashModal
