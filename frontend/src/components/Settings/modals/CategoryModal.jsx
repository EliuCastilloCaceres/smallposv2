// src/components/Settings/modals/CategoryModal.jsx
import { useState, useEffect, useRef } from 'react'
import api from '../../../services/api'

const EMPTY = { name: '', description: '', color: '' }

// Paleta de colores rápidos para selección touch-friendly
const COLOR_PRESETS = [
  '#4f8ef7', '#16a34a', '#d97706', '#dc2626',
  '#9333ea', '#0891b2', '#db2777', '#65a30d',
  '#ea580c', '#0f172a', '#64748b', '#f59e0b',
]

const CategoryModal = ({ category, onSaved, onClose }) => {
  const isEdit   = !!category
  const colorRef = useRef(null)

  const [form,     setForm]     = useState(EMPTY)
  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    if (category) {
      setForm({
        name:        category.name        ?? '',
        description: category.description ?? '',
        color:       category.color       ?? '',
      })
    }
  }, [category])

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setError(null)
  }

  const handleColorPreset = (hex) => {
    setForm(prev => ({ ...prev, color: hex }))
    setError(null)
  }

  const handleColorInput = (e) => {
    setForm(prev => ({ ...prev, color: e.target.value }))
    setError(null)
  }

  const handleHexText = (e) => {
    let val = e.target.value
    if (val && !val.startsWith('#')) val = `#${val}`
    setForm(prev => ({ ...prev, color: val }))
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
        color:       form.color || null,
      }
      const { data } = isEdit
        ? await api.put(`categories/${category.category_id}`, payload)
        : await api.post('categories', payload)
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
        {/* Header */}
        <div className="set-modal__header">
          <h3 className="set-modal__title">
            <i className={`bi ${isEdit ? 'bi-tag' : 'bi-tag-fill'}`} />
            {isEdit ? 'Editar categoría' : 'Nueva categoría'}
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

          {/* Nombre */}
          <div className="set-field">
            <label className="set-field__label" htmlFor="cat-name">
              Nombre <span className="set-field__req">*</span>
            </label>
            <input
              id="cat-name" name="name"
              className="set-field__input"
              value={form.name}
              onChange={handleChange}
              placeholder="Ej. Bebidas, Ropa, Electrónicos"
              required
              autoFocus
              maxLength={100}
            />
          </div>

          {/* Descripción */}
          <div className="set-field">
            <label className="set-field__label" htmlFor="cat-desc">Descripción</label>
            <textarea
              id="cat-desc" name="description"
              className="set-field__input set-field__textarea"
              value={form.description}
              onChange={handleChange}
              placeholder="Descripción opcional..."
              rows={2}
              maxLength={255}
            />
          </div>

          {/* Color */}
          <div className="set-field">
            <label className="set-field__label">
              Color
              <span className="set-field__hint"> — opcional, para identificar visualmente</span>
            </label>

            {/* Paleta rápida */}
            <div className="set-cat-presets">
              {COLOR_PRESETS.map(hex => (
                <button
                  key={hex}
                  type="button"
                  className={`set-cat-preset ${form.color === hex ? 'set-cat-preset--active' : ''}`}
                  style={{ background: hex }}
                  onClick={() => handleColorPreset(hex)}
                  title={hex}
                  aria-label={`Color ${hex}`}
                />
              ))}
              {/* Botón para limpiar el color */}
              {form.color && (
                <button
                  type="button"
                  className="set-cat-preset set-cat-preset--clear"
                  onClick={() => setForm(prev => ({ ...prev, color: '' }))}
                  title="Sin color"
                  aria-label="Quitar color"
                >
                  <i className="bi bi-x" />
                </button>
              )}
            </div>

            {/* Input hex + color picker nativo */}
            <div className="set-cat-color-row">
              <input
                ref={colorRef}
                type="color"
                className="set-cat-color-native"
                value={form.color || '#4f8ef7'}
                onChange={handleColorInput}
                title="Abrir selector de color"
              />
              <input
                type="text"
                className="set-field__input set-cat-color-hex"
                value={form.color}
                onChange={handleHexText}
                placeholder="#ffffff"
                maxLength={7}
                spellCheck={false}
              />
              {/* Preview */}
              {form.color && (
                <span
                  className="set-cat-color-preview"
                  style={{ background: form.color }}
                />
              )}
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
                : <><i className="bi bi-floppy" /> {isEdit ? 'Guardar cambios' : 'Crear categoría'}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CategoryModal
