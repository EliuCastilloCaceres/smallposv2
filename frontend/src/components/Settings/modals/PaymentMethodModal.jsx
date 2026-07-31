// src/components/Settings/modals/PaymentMethodModal.jsx
import { useState, useEffect } from 'react'
import api from '../../../services/api'

const EMPTY = { code: '', name: '' }

const PaymentMethodModal = ({ method, onSaved, onClose }) => {
  const isEdit = !!method

  const [form,     setForm]     = useState(EMPTY)
  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    if (method) setForm({ code: method.code ?? '', name: method.name ?? '' })
  }, [method])

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)
    try {
      const { data } = isEdit
        ? await api.put(`payment-methods/${method.payment_method_id}`, { name: form.name.trim() })
        : await api.post('payment-methods', { code: form.code.trim(), name: form.name.trim() })
      onSaved(data.data)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al guardar')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="set-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="set-modal">
        <div className="set-modal__header">
          <h3 className="set-modal__title">
            <i className={`bi ${isEdit ? 'bi-credit-card' : 'bi-credit-card-2-front'}`} />
            {isEdit ? 'Editar método de pago' : 'Nuevo método de pago'}
          </h3>
          <button className="set-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <form className="set-modal__body" onSubmit={handleSubmit}>
          <div className="set-form__grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="set-field">
              <label className="set-field__label" htmlFor="pm-code">
                Código <span className="set-field__req">*</span>
              </label>
              <input
                id="pm-code"
                name="code"
                className="set-field__input"
                value={form.code}
                onChange={handleChange}
                placeholder="Ej: cash, card, transfer"
                maxLength={30}
                required
                disabled={isEdit}
                autoFocus={!isEdit}
              />
              {isEdit ? (
                <span className="set-section__sub" style={{ margin: 0 }}>
                  El código no se puede editar una vez creado — el resto del sistema depende de él.
                </span>
              ) : (
                <span className="set-section__sub" style={{ margin: 0 }}>
                  Minúsculas, números y guion bajo, empezando con letra. No se podrá cambiar después.
                </span>
              )}
            </div>

            <div className="set-field">
              <label className="set-field__label" htmlFor="pm-name">
                Nombre <span className="set-field__req">*</span>
              </label>
              <input
                id="pm-name"
                name="name"
                className="set-field__input"
                value={form.name}
                onChange={handleChange}
                placeholder="Ej: Efectivo"
                maxLength={50}
                required
                autoFocus={isEdit}
              />
            </div>
          </div>

          {error && (
            <div className="set-alert set-alert--error">
              <i className="bi bi-exclamation-circle" />
              <span>{error}</span>
              <button type="button" className="set-alert__close" onClick={() => setError(null)}>
                <i className="bi bi-x" />
              </button>
            </div>
          )}

          <div className="set-modal__footer">
            <button type="button" className="set-btn set-btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="set-btn set-btn--primary"
              disabled={isSaving || !form.name.trim() || !form.code.trim()}
            >
              {isSaving
                ? <><span className="set-spinner set-spinner--sm" />Guardando...</>
                : <><i className="bi bi-floppy" />{isEdit ? 'Guardar cambios' : 'Crear método'}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PaymentMethodModal
