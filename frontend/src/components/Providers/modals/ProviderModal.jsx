// src/components/Providers/modals/ProviderModal.jsx
import { useState, useEffect, useRef } from 'react'
import api from '../../../services/api'

const EMPTY = {
  name:        '',
  rfc:         '',
  phone_number:'',
  email:       '',
  address:     '',
  state:       '',
  city:        '',
  zip_code:    '',
}

const ProviderModal = ({ provider, onSaved, onClose }) => {
  const isEdit = !!provider

  const [form,     setForm]     = useState(EMPTY)
  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)
  const bodyRef = useRef(null)

  useEffect(() => {
    if (provider) {
      setForm({
        name:         provider.name         ?? '',
        rfc:          provider.rfc          ?? '',
        phone_number: provider.phone_number ?? '',
        email:        provider.email        ?? '',
        address:      provider.address      ?? '',
        state:        provider.state        ?? '',
        city:         provider.city         ?? '',
        zip_code:     provider.zip_code     ?? '',
      })
    }
  }, [provider])

  // Cerrar con Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('El nombre del proveedor es requerido')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      // El service espera phoneNumber y zipCode en camelCase
      const payload = {
        name:        form.name.trim(),
        rfc:         form.rfc.trim()          || null,
        phoneNumber: form.phone_number.trim() || null,
        email:       form.email.trim()        || null,
        address:     form.address.trim()      || null,
        state:       form.state.trim()        || null,
        city:        form.city.trim()         || null,
        zipCode:     form.zip_code.trim()     || null,
      }
      const { data } = isEdit
        ? await api.put(`providers/${provider.provider_id}`, payload)
        : await api.post('providers', payload)
      onSaved(data.data)
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Error al guardar'
      setError(msg)
      bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="cst-overlay">
      <div className="cst-modal">

        {/* Header */}
        <div className="cst-modal__header">
          <h3 className="cst-modal__title">
            <i className={`bi ${isEdit ? 'bi-pencil-square' : 'bi-truck'}`} />
            {isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}
          </h3>
          <button className="cst-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <form className="cst-modal__body" onSubmit={handleSubmit} ref={bodyRef}>

          {/* ── Datos del proveedor ── */}
          <div className="cst-form-section">
            <span className="cst-form-section__label">Datos generales</span>
            <div className="cst-form-grid">
              <div className="cst-field cst-field--full">
                <label className="cst-field__label" htmlFor="pm-name">
                  Nombre <span style={{ color: 'var(--cst-red)' }}>*</span>
                </label>
                <input
                  id="pm-name" name="name"
                  className="cst-field__input"
                  value={form.name} onChange={handleChange}
                  placeholder="Nombre comercial o razón social"
                  autoFocus
                />
              </div>
              <div className="cst-field">
                <label className="cst-field__label" htmlFor="pm-rfc">RFC</label>
                <input
                  id="pm-rfc" name="rfc"
                  className="cst-field__input"
                  value={form.rfc} onChange={handleChange}
                  placeholder="XAXX010101000" maxLength={13}
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
            </div>
          </div>

          {/* ── Contacto ── */}
          <div className="cst-form-section">
            <span className="cst-form-section__label">Contacto</span>
            <div className="cst-form-grid">
              <div className="cst-field">
                <label className="cst-field__label" htmlFor="pm-phone">Teléfono</label>
                <input
                  id="pm-phone" name="phone_number"
                  className="cst-field__input"
                  value={form.phone_number} onChange={handleChange}
                  placeholder="(999) 123-4567"
                />
              </div>
              <div className="cst-field">
                <label className="cst-field__label" htmlFor="pm-email">Email</label>
                <input
                  id="pm-email" name="email" type="email"
                  className="cst-field__input"
                  value={form.email} onChange={handleChange}
                  placeholder="contacto@proveedor.com"
                />
              </div>
            </div>
          </div>

          {/* ── Dirección ── */}
          <div className="cst-form-section">
            <span className="cst-form-section__label">Dirección</span>
            <div className="cst-form-grid">
              <div className="cst-field cst-field--full">
                <label className="cst-field__label" htmlFor="pm-address">Calle y número</label>
                <input
                  id="pm-address" name="address"
                  className="cst-field__input"
                  value={form.address} onChange={handleChange}
                  placeholder="Calle 60 #123, Col. Centro"
                />
              </div>
              <div className="cst-field">
                <label className="cst-field__label" htmlFor="pm-state">Estado</label>
                <input
                  id="pm-state" name="state"
                  className="cst-field__input"
                  value={form.state} onChange={handleChange}
                  placeholder="Yucatán"
                />
              </div>
              <div className="cst-field">
                <label className="cst-field__label" htmlFor="pm-city">Ciudad</label>
                <input
                  id="pm-city" name="city"
                  className="cst-field__input"
                  value={form.city} onChange={handleChange}
                  placeholder="Mérida"
                />
              </div>
              <div className="cst-field">
                <label className="cst-field__label" htmlFor="pm-zip">Código postal</label>
                <input
                  id="pm-zip" name="zip_code"
                  className="cst-field__input"
                  value={form.zip_code} onChange={handleChange}
                  placeholder="97000" maxLength={10}
                />
              </div>
            </div>
          </div>

          {/* ── Error + Footer ── */}
          {error && (
            <div className="cst-alert cst-alert--sticky">
              <i className="bi bi-exclamation-circle" />
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)}>
                <i className="bi bi-x" />
              </button>
            </div>
          )}

          <div className="cst-modal__footer">
            <button type="button" className="cst-btn cst-btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="cst-btn cst-btn--primary" disabled={isSaving}>
              {isSaving
                ? <><span className="cst-spinner cst-spinner--white" /> Guardando...</>
                : <><i className="bi bi-floppy" /> {isEdit ? 'Guardar cambios' : 'Crear proveedor'}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProviderModal