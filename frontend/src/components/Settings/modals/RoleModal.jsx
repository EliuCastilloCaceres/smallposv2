// src/components/Settings/modals/RoleModal.jsx
import { useState, useEffect } from 'react'
import api from '../../../services/api'

const EMPTY = { name: '', description: '' }

const RoleModal = ({ role, onSaved, onClose }) => {
  const isEdit = !!role

  const [form,     setForm]     = useState(EMPTY)
  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    if (role) setForm({ name: role.name ?? '', description: role.description ?? '' })
  }, [role])

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)
    try {
      const payload = {
        name:        form.name.trim(),
        description: form.description.trim() || null,
      }
      const { data } = isEdit
        ? await api.put(`roles/${role.role_id}`, payload)
        : await api.post('roles', payload)
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
            <i className={`bi ${isEdit ? 'bi-shield-gear' : 'bi-shield-plus'}`} />
            {isEdit ? 'Editar rol' : 'Nuevo rol'}
          </h3>
          <button className="set-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <form className="set-modal__body" onSubmit={handleSubmit}>
          <div className="set-form__grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="set-field">
              <label className="set-field__label" htmlFor="rl-name">
                Nombre <span className="set-field__req">*</span>
              </label>
              <input
                id="rl-name"
                name="name"
                className="set-field__input"
                value={form.name}
                onChange={handleChange}
                placeholder="Ej: supervisor_ventas"
                maxLength={50}
                required
                autoFocus
              />
            </div>

            <div className="set-field">
              <label className="set-field__label" htmlFor="rl-desc">Descripción</label>
              <textarea
                id="rl-desc"
                name="description"
                className="set-field__input set-field__textarea"
                value={form.description}
                onChange={handleChange}
                placeholder="Descripción opcional del rol y sus responsabilidades"
                rows={3}
                maxLength={255}
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
              disabled={isSaving || !form.name.trim()}
            >
              {isSaving
                ? <><span className="set-spinner set-spinner--sm" />Guardando...</>
                : <><i className="bi bi-floppy" />{isEdit ? 'Guardar cambios' : 'Crear rol'}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default RoleModal