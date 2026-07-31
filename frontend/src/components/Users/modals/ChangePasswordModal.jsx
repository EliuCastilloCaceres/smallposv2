// src/components/Users/modals/ChangePasswordModal.jsx
import { useState } from 'react'
import api from '../../../services/api'

const ChangePasswordModal = ({ user, isSelf, onClose }) => {
  const [form, setForm] = useState({
    current_password: '',
    new_password:     '',
    confirm_password: '',
  })
  const [show, setShow] = useState({
    current: false,
    new:     false,
    confirm: false,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)
  const [success,  setSuccess]  = useState(false)

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setError(null)
  }

  const toggleShow = (field) => setShow(prev => ({ ...prev, [field]: !prev[field] }))

  // Validaciones en el cliente antes de llamar a la API
  const validate = () => {
    if (isSelf && !form.current_password.trim())
      return 'La contraseña actual es requerida'
    if (!form.new_password)
      return 'La nueva contraseña es requerida'
    if (form.new_password.length < 8)
      return 'La nueva contraseña debe tener al menos 8 caracteres'
    if (!/[A-Z]/.test(form.new_password))
      return 'La nueva contraseña debe tener al menos una mayúscula'
    if (!/[0-9]/.test(form.new_password))
      return 'La nueva contraseña debe tener al menos un número'
    if (form.new_password !== form.confirm_password)
      return 'Las contraseñas no coinciden'
    if (isSelf && form.current_password === form.new_password)
      return 'La nueva contraseña no puede ser igual a la actual'
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setIsSaving(true)
    setError(null)

    try {
      const payload = { new_password: form.new_password }
      if (isSelf) payload.current_password = form.current_password

      await api.patch(`users/${user.user_id}/password`, payload)
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cambiar la contraseña')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Indicador de fortaleza de contraseña ──
  const getStrength = (pwd) => {
    if (!pwd) return null
    let score = 0
    if (pwd.length >= 8)          score++
    if (pwd.length >= 12)         score++
    if (/[A-Z]/.test(pwd))        score++
    if (/[0-9]/.test(pwd))        score++
    if (/[^a-zA-Z0-9]/.test(pwd)) score++
    if (score <= 2) return { label: 'Débil',   level: 1 }
    if (score <= 3) return { label: 'Regular', level: 2 }
    if (score <= 4) return { label: 'Fuerte',  level: 3 }
    return                        { label: 'Muy fuerte', level: 4 }
  }

  const strength = getStrength(form.new_password)

  return (
    <div className="usr-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="usr-modal usr-modal--sm">

        {/* ── Header ── */}
        <div className="usr-modal__header">
          <h3 className="usr-modal__title">
            <i className="bi bi-key" />
            {isSelf ? 'Cambiar mi contraseña' : `Contraseña de @${user.username}`}
          </h3>
          <button className="usr-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="usr-modal__body">

          {/* ── Estado: éxito ── */}
          {success ? (
            <div className="usr-chpw-success">
              <div className="usr-chpw-success__icon">
                <i className="bi bi-check-lg" />
              </div>
              <p className="usr-chpw-success__title">Contraseña actualizada</p>
              <p className="usr-chpw-success__sub">
                {isSelf
                  ? 'Tu contraseña fue cambiada. Tus otras sesiones activas fueron cerradas.'
                  : `La contraseña de @${user.username} fue actualizada correctamente.`
                }
              </p>
              <button className="usr-btn usr-btn--primary" onClick={onClose}>
                Cerrar
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'contents' }}>

              {/* Info — admin cambiando a otro usuario */}
              {!isSelf && (
                <div className="usr-chpw-info">
                  <i className="bi bi-info-circle" />
                  <p>
                    Estás cambiando la contraseña de <strong>@{user.username}</strong>.
                    Se cerrarán todas sus sesiones activas al guardar.
                  </p>
                </div>
              )}

              {/* Contraseña actual — solo si es el propio usuario */}
              {isSelf && (
                <div className="usr-field">
                  <label className="usr-field__label" htmlFor="cp-current">
                    Contraseña actual <span className="usr-field__req">*</span>
                  </label>
                  <div className="usr-field__wrap">
                    <i className="bi bi-lock usr-field__icon" />
                    <input
                      id="cp-current"
                      name="current_password"
                      type={show.current ? 'text' : 'password'}
                      className="usr-field__input usr-field__input--icon usr-field__input--toggle"
                      value={form.current_password}
                      onChange={handleChange}
                      placeholder="Tu contraseña actual"
                      autoComplete="current-password"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="usr-field__toggle"
                      onClick={() => toggleShow('current')}
                      aria-label={show.current ? 'Ocultar' : 'Mostrar'}
                    >
                      <i className={`bi ${show.current ? 'bi-eye-slash' : 'bi-eye'}`} />
                    </button>
                  </div>
                </div>
              )}

              {/* Nueva contraseña */}
              <div className="usr-field">
                <label className="usr-field__label" htmlFor="cp-new">
                  Nueva contraseña <span className="usr-field__req">*</span>
                </label>
                <div className="usr-field__wrap">
                  <i className="bi bi-lock-fill usr-field__icon" />
                  <input
                    id="cp-new"
                    name="new_password"
                    type={show.new ? 'text' : 'password'}
                    className="usr-field__input usr-field__input--icon usr-field__input--toggle"
                    value={form.new_password}
                    onChange={handleChange}
                    placeholder="Mínimo 8 caracteres, 1 mayúscula y 1 número"
                    autoComplete="new-password"
                    autoFocus={!isSelf}
                  />
                  <button
                    type="button"
                    className="usr-field__toggle"
                    onClick={() => toggleShow('new')}
                    aria-label={show.new ? 'Ocultar' : 'Mostrar'}
                  >
                    <i className={`bi ${show.new ? 'bi-eye-slash' : 'bi-eye'}`} />
                  </button>
                </div>

                {/* Indicador de fortaleza */}
                {strength && (
                  <div className="usr-chpw-strength">
                    <div className="usr-chpw-strength__bars">
                      {[1, 2, 3, 4].map(l => (
                        <span
                          key={l}
                          className={`usr-chpw-strength__bar ${l <= strength.level ? `usr-chpw-strength__bar--${strength.level}` : ''}`}
                        />
                      ))}
                    </div>
                    <span className={`usr-chpw-strength__label usr-chpw-strength__label--${strength.level}`}>
                      {strength.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirmar contraseña */}
              <div className="usr-field">
                <label className="usr-field__label" htmlFor="cp-confirm">
                  Confirmar contraseña <span className="usr-field__req">*</span>
                </label>
                <div className="usr-field__wrap">
                  <i className="bi bi-lock-fill usr-field__icon" />
                  <input
                    id="cp-confirm"
                    name="confirm_password"
                    type={show.confirm ? 'text' : 'password'}
                    className={`usr-field__input usr-field__input--icon usr-field__input--toggle
                      ${form.confirm_password && form.new_password !== form.confirm_password
                        ? 'usr-field__input--error' : ''}
                      ${form.confirm_password && form.new_password === form.confirm_password
                        ? 'usr-field__input--ok' : ''}
                    `}
                    value={form.confirm_password}
                    onChange={handleChange}
                    placeholder="Repite la nueva contraseña"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="usr-field__toggle"
                    onClick={() => toggleShow('confirm')}
                    aria-label={show.confirm ? 'Ocultar' : 'Mostrar'}
                  >
                    <i className={`bi ${show.confirm ? 'bi-eye-slash' : 'bi-eye'}`} />
                  </button>
                </div>
                {/* Feedback inline de coincidencia */}
                {form.confirm_password && (
                  <span className={`usr-chpw-match ${form.new_password === form.confirm_password ? 'usr-chpw-match--ok' : 'usr-chpw-match--err'}`}>
                    <i className={`bi ${form.new_password === form.confirm_password ? 'bi-check-circle' : 'bi-x-circle'}`} />
                    {form.new_password === form.confirm_password ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden'}
                  </span>
                )}
              </div>

              {/* Error de API */}
              {error && (
                <div className="usr-alert">
                  <i className="bi bi-exclamation-circle" />
                  <span>{error}</span>
                </div>
              )}

              {/* Footer */}
              <div className="usr-modal__footer">
                <button type="button" className="usr-btn usr-btn--ghost" onClick={onClose}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="usr-btn usr-btn--primary"
                  disabled={
                    isSaving ||
                    !form.new_password ||
                    !form.confirm_password ||
                    (isSelf && !form.current_password)
                  }
                >
                  {isSaving
                    ? <><span className="usr-spinner" style={{ borderTopColor: '#fff' }} /> Guardando...</>
                    : <><i className="bi bi-floppy" /> Cambiar contraseña</>
                  }
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChangePasswordModal
