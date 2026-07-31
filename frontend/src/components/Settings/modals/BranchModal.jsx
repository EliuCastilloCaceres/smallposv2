// src/components/Settings/modals/BranchModal.jsx
import { useState, useEffect } from 'react'
import api from '../../../services/api'

const EMPTY = {
  name: '', address: '', state: '', city: '', zip_code: '', phone_number: '',
}

const BranchModal = ({ branch, onSaved, onClose }) => {
  const isEdit = !!branch
  const [form,     setForm]     = useState(EMPTY)
  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    if (branch) {
      setForm({
        name:         branch.name         ?? '',
        address:      branch.address      ?? '',
        state:        branch.state        ?? '',
        city:         branch.city         ?? '',
        zip_code:     branch.zip_code     ?? '',
        phone_number: branch.phone_number ?? '',
      })
    }
  }, [branch])

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
        ? await api.put(`branches/${branch.branch_id}`, form)
        : await api.post('branches', form)
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
        {/* Header */}
        <div className="set-modal__header">
          <h3 className="set-modal__title">
            <i className={`bi ${isEdit ? 'bi-building-gear' : 'bi-building-add'}`} />
            {isEdit ? 'Editar sucursal' : 'Nueva sucursal'}
          </h3>
          <button className="set-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        {/* Body */}
        <form className="set-modal__body" onSubmit={handleSubmit}>
          {error && (
            <div className="set-alert set-alert--error">
              <i className="bi bi-exclamation-circle" />
              <span>{error}</span>
            </div>
          )}

          <div className="set-form__grid">
            <div className="set-field set-field--full">
              <label className="set-field__label" htmlFor="m-name">
                Nombre <span className="set-field__req">*</span>
              </label>
              <input
                id="m-name" name="name"
                className="set-field__input"
                value={form.name}
                onChange={handleChange}
                placeholder="Sucursal Centro"
                required
                autoFocus
              />
            </div>

            <div className="set-field">
              <label className="set-field__label" htmlFor="m-state">Estado</label>
              <input
                id="m-state" name="state"
                className="set-field__input"
                value={form.state}
                onChange={handleChange}
                placeholder="Yucatán"
              />
            </div>

            <div className="set-field">
              <label className="set-field__label" htmlFor="m-city">Ciudad</label>
              <input
                id="m-city" name="city"
                className="set-field__input"
                value={form.city}
                onChange={handleChange}
                placeholder="Mérida"
              />
            </div>

            <div className="set-field set-field--full">
              <label className="set-field__label" htmlFor="m-address">Dirección</label>
              <input
                id="m-address" name="address"
                className="set-field__input"
                value={form.address}
                onChange={handleChange}
                placeholder="Calle 60 #123, Col. Centro"
              />
            </div>

            <div className="set-field">
              <label className="set-field__label" htmlFor="m-zip">Código postal</label>
              <input
                id="m-zip" name="zip_code"
                className="set-field__input"
                value={form.zip_code}
                onChange={handleChange}
                placeholder="97000"
                maxLength={10}
              />
            </div>

            <div className="set-field">
              <label className="set-field__label" htmlFor="m-phone">Teléfono</label>
              <input
                id="m-phone" name="phone_number"
                className="set-field__input"
                value={form.phone_number}
                onChange={handleChange}
                placeholder="(999) 123-4567"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="set-modal__footer">
            <button type="button" className="set-btn set-btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="set-btn set-btn--primary"
              disabled={isSaving || !form.name.trim()}
            >
              {isSaving
                ? <><span className="set-spinner set-spinner--sm" /> Guardando...</>
                : <><i className="bi bi-floppy" /> {isEdit ? 'Guardar cambios' : 'Crear sucursal'}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default BranchModal
