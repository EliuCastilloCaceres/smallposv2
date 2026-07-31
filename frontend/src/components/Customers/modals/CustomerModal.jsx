// src/components/Customers/modals/CustomerModal.jsx
import { useState, useEffect, useRef } from 'react'
import api from '../../../services/api'

const EMPTY = {
  first_name:   '',
  last_name:    '',
  phone_number: '',
  email:        '',
  rfc:          '',
  address:      '',
  state:        '',
  city:         '',
  zip_code:     '',
  credit_limit: '',
}

const CustomerModal = ({ customer, canEditCredit, onSaved, onClose }) => {
  const isEdit = !!customer

  const [form,     setForm]     = useState(EMPTY)
  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)
  const bodyRef = useRef(null)

  // Cerrar con Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  useEffect(() => {
    if (customer) {
      setForm({
        first_name:   customer.first_name   ?? '',
        last_name:    customer.last_name    ?? '',
        phone_number: customer.phone_number ?? '',
        email:        customer.email        ?? '',
        rfc:          customer.rfc          ?? '',
        address:      customer.address      ?? '',
        state:        customer.state        ?? '',
        city:         customer.city         ?? '',
        zip_code:     customer.zip_code     ?? '',
        credit_limit: customer.credit_limit ?? '',
      })
    }
  }, [customer])

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
        first_name:   form.first_name.trim()   || null,
        last_name:    form.last_name.trim()    || null,
        phone_number: form.phone_number.trim() || null,
        email:        form.email.trim()        || null,
        rfc:          form.rfc.trim()          || null,
        address:      form.address.trim()      || null,
        state:        form.state.trim()        || null,
        city:         form.city.trim()         || null,
        zip_code:     form.zip_code.trim()     || null,
        ...(canEditCredit && form.credit_limit !== '' && {
          credit_limit: Number(form.credit_limit)
        }),
      }
      const { data } = isEdit
        ? await api.put(`customers/${customer.customer_id}`, payload)
        : await api.post('customers', payload)
      onSaved(data.data)
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Error al guardar'
      setError(msg)
      // Scroll al top del modal para que el error sea visible
      bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="cst-overlay">
      <div className="cst-modal">
        <div className="cst-modal__header">
          <h3 className="cst-modal__title">
            <i className={`bi ${isEdit ? 'bi-person-gear' : 'bi-person-plus'}`} />
            {isEdit ? 'Editar cliente' : 'Nuevo cliente'}
          </h3>
          <button className="cst-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <form className="cst-modal__body" onSubmit={handleSubmit} ref={bodyRef}>
          {/* ── Datos personales ── */}
          <div className="cst-form-section">
            <span className="cst-form-section__label">Datos personales</span>
            <div className="cst-form-grid">
              <div className="cst-field">
                <label className="cst-field__label" htmlFor="cm-first">Nombre</label>
                <input id="cm-first" name="first_name" className="cst-field__input"
                  value={form.first_name} onChange={handleChange}
                  placeholder="Juan" autoFocus />
              </div>
              <div className="cst-field">
                <label className="cst-field__label" htmlFor="cm-last">Apellido</label>
                <input id="cm-last" name="last_name" className="cst-field__input"
                  value={form.last_name} onChange={handleChange}
                  placeholder="Pérez" />
              </div>
              <div className="cst-field">
                <label className="cst-field__label" htmlFor="cm-phone">Teléfono</label>
                <input id="cm-phone" name="phone_number" className="cst-field__input"
                  value={form.phone_number} onChange={handleChange}
                  placeholder="(999) 123-4567" />
              </div>
              <div className="cst-field">
                <label className="cst-field__label" htmlFor="cm-email">Email</label>
                <input id="cm-email" name="email" type="email" className="cst-field__input"
                  value={form.email} onChange={handleChange}
                  placeholder="correo@ejemplo.com" />
              </div>
            </div>
          </div>

          {/* ── Datos fiscales ── */}
          <div className="cst-form-section">
            <span className="cst-form-section__label">Datos fiscales</span>
            <div className="cst-form-grid">
              <div className="cst-field cst-field--full">
                <label className="cst-field__label" htmlFor="cm-rfc">RFC</label>
                <input id="cm-rfc" name="rfc" className="cst-field__input"
                  value={form.rfc} onChange={handleChange}
                  placeholder="XAXX010101000" maxLength={13} />
              </div>
            </div>
          </div>

          {/* ── Dirección ── */}
          <div className="cst-form-section">
            <span className="cst-form-section__label">Dirección</span>
            <div className="cst-form-grid">
              <div className="cst-field cst-field--full">
                <label className="cst-field__label" htmlFor="cm-address">Calle y número</label>
                <input id="cm-address" name="address" className="cst-field__input"
                  value={form.address} onChange={handleChange}
                  placeholder="Calle 60 #123, Col. Centro" />
              </div>
              <div className="cst-field">
                <label className="cst-field__label" htmlFor="cm-state">Estado</label>
                <input id="cm-state" name="state" className="cst-field__input"
                  value={form.state} onChange={handleChange} placeholder="Yucatán" />
              </div>
              <div className="cst-field">
                <label className="cst-field__label" htmlFor="cm-city">Ciudad</label>
                <input id="cm-city" name="city" className="cst-field__input"
                  value={form.city} onChange={handleChange} placeholder="Mérida" />
              </div>
              <div className="cst-field">
                <label className="cst-field__label" htmlFor="cm-zip">Código postal</label>
                <input id="cm-zip" name="zip_code" className="cst-field__input"
                  value={form.zip_code} onChange={handleChange}
                  placeholder="97000" maxLength={10} />
              </div>
            </div>
          </div>

          {/* ── Crédito — solo si tiene permiso ── */}
          {canEditCredit && (
            <div className="cst-form-section">
              <span className="cst-form-section__label">Crédito</span>
              <div className="cst-form-grid">
                <div className="cst-field cst-field--full">
                  <label className="cst-field__label" htmlFor="cm-credit">
                    Límite de crédito
                    <span className="cst-field__hint"> — 0 para deshabilitar crédito</span>
                  </label>
                  <div className="cst-field__wrap">
                    <span className="cst-field__prefix">$</span>
                    <input id="cm-credit" name="credit_limit"
                      type="number" min="0" step="0.01"
                      className="cst-field__input cst-field__input--prefix"
                      value={form.credit_limit}
                      onChange={handleChange}
                      placeholder="0.00" />
                  </div>
                  {isEdit && customer.credit_balance > 0 && (
                    <span className="cst-field__hint cst-field__hint--warn">
                      <i className="bi bi-exclamation-triangle" />
                      Saldo actual: ${Number(customer.credit_balance).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Footer ── */}
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
            <button type="submit" className="cst-btn cst-btn--primary"
              disabled={isSaving}>
              {isSaving
                ? <><span className="cst-spinner cst-spinner--white" /> Guardando...</>
                : <><i className="bi bi-floppy" /> {isEdit ? 'Guardar cambios' : 'Crear cliente'}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CustomerModal