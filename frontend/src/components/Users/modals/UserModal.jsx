// src/components/Users/modals/UserModal.jsx
import { useState, useEffect } from 'react'
import api from '../../../services/api'

const EMPTY = {
  first_name:    '',
  last_name:     '',
  username:      '',
  password:      '',
  role_id:       '',
  branch_id:     '',
  position:      '',
  phone_number:  '',
  profile_image: '',
  address:       '',
  state:         '',
  city:          '',
  zip_code:      '',
}

const UserModal = ({ user, roles, branches, isAdmin, onSaved, onClose }) => {
  const isEdit = !!user

  const [form,     setForm]     = useState(EMPTY)
  const [showPass, setShowPass] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)

  // Cerrar con Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  useEffect(() => {
    if (user) {
      setForm({
        first_name:    user.first_name    ?? '',
        last_name:     user.last_name     ?? '',
        username:      user.username      ?? '',
        password:      '', // nunca se precarga
        role_id:       user.role_id       ?? '',
        branch_id:     user.branch_id     ?? '',
        position:      user.position      ?? '',
        phone_number:  user.phone_number  ?? '',
        profile_image: user.profile_image ?? '',
        address:       user.address       ?? '',
        state:         user.state         ?? '',
        city:          user.city          ?? '',
        zip_code:      user.zip_code      ?? '',
      })
    }
  }, [user])

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
        first_name:    form.first_name.trim()    || null,
        last_name:     form.last_name.trim()     || null,
        username:      form.username.trim(),
        role_id:       Number(form.role_id),
        branch_id:     form.branch_id !== '' ? Number(form.branch_id) : null,
        position:      form.position.trim()      || null,
        phone_number:  form.phone_number.trim()  || null,
        profile_image: form.profile_image.trim() || null,
        address:       form.address.trim()       || null,
        state:         form.state.trim()         || null,
        city:          form.city.trim()          || null,
        zip_code:      form.zip_code.trim()      || null,
        // En edición: solo enviar password si el admin quiere cambiarlo
        // En creación: enviar si se escribió, si no el backend genera uno temporal
        ...(form.password && { password: form.password }),
      }

      const { data } = isEdit
        ? await api.put(`users/${user.user_id}`, payload)
        : await api.post('users', payload)

      onSaved(data.data)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al guardar')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="usr-overlay">
      <div className="usr-modal">
        {/* ── Header ── */}
        <div className="usr-modal__header">
          <h3 className="usr-modal__title">
            <i className={`bi ${isEdit ? 'bi-person-gear' : 'bi-person-plus'}`} />
            {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
          </h3>
          <button className="usr-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        {/* ── Body ── */}
        <form className="usr-modal__body" onSubmit={handleSubmit}>
          {error && (
            <div className="usr-alert">
              <i className="bi bi-exclamation-circle" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Sección: datos personales ── */}
          <div className="usr-form-section">
            <span className="usr-form-section__label">Datos personales</span>
            <div className="usr-form-grid">
              <div className="usr-field">
                <label className="usr-field__label" htmlFor="um-first">Nombre</label>
                <input
                  id="um-first" name="first_name"
                  className="usr-field__input"
                  value={form.first_name}
                  onChange={handleChange}
                  placeholder="Juan"
                  autoFocus
                />
              </div>

              <div className="usr-field">
                <label className="usr-field__label" htmlFor="um-last">Apellido</label>
                <input
                  id="um-last" name="last_name"
                  className="usr-field__input"
                  value={form.last_name}
                  onChange={handleChange}
                  placeholder="Pérez"
                />
              </div>

              <div className="usr-field">
                <label className="usr-field__label" htmlFor="um-phone">Teléfono</label>
                <input
                  id="um-phone" name="phone_number"
                  className="usr-field__input"
                  value={form.phone_number}
                  onChange={handleChange}
                  placeholder="(999) 123-4567"
                />
              </div>

              <div className="usr-field">
                <label className="usr-field__label" htmlFor="um-position">Cargo</label>
                <input
                  id="um-position" name="position"
                  className="usr-field__input"
                  value={form.position}
                  onChange={handleChange}
                  placeholder="Cajero, Supervisor..."
                />
              </div>

              {/* Foto de perfil — full width con preview */}
              <div className="usr-field usr-field--full">
                <label className="usr-field__label" htmlFor="um-img">
                  Foto de perfil
                  <span className="usr-field__hint"> — URL de imagen</span>
                </label>
                <div className="usr-field__wrap">
                  <i className="bi bi-image usr-field__icon" />
                  <input
                    id="um-img" name="profile_image"
                    className="usr-field__input usr-field__input--icon"
                    value={form.profile_image}
                    onChange={handleChange}
                    placeholder="https://..."
                  />
                </div>
                {/* Preview */}
                {form.profile_image && (
                  <div className="usr-img-preview">
                    <img
                      src={form.profile_image}
                      alt="Preview"
                      onError={e => e.target.style.display = 'none'}
                    />
                    <span className="usr-img-preview__label">Vista previa</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Sección: acceso al sistema ── */}
          <div className="usr-form-section">
            <span className="usr-form-section__label">Acceso al sistema</span>
            <div className="usr-form-grid">
              <div className="usr-field usr-field--full">
                <label className="usr-field__label" htmlFor="um-username">
                  Usuario <span className="usr-field__req">*</span>
                </label>
                <div className="usr-field__wrap">
                  <i className="bi bi-at usr-field__icon" />
                  <input
                    id="um-username" name="username"
                    className="usr-field__input usr-field__input--icon"
                    value={form.username}
                    onChange={handleChange}
                    placeholder="nombre.usuario"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                  />
                </div>
              </div>

              <div className="usr-field usr-field--full">
                <label className="usr-field__label" htmlFor="um-pass">
                  Contraseña
                  {!isEdit && <span className="usr-field__hint"> — dejar vacío para generar una temporal</span>}
                  {isEdit  && <span className="usr-field__hint"> — dejar vacío para no cambiarla</span>}
                </label>
                <div className="usr-field__wrap">
                  <i className="bi bi-lock usr-field__icon" />
                  <input
                    id="um-pass" name="password"
                    type={showPass ? 'text' : 'password'}
                    className="usr-field__input usr-field__input--icon usr-field__input--toggle"
                    value={form.password}
                    onChange={handleChange}
                    placeholder={isEdit ? '••••••••' : 'Dejar vacío para contraseña temporal'}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="usr-field__toggle"
                    onClick={() => setShowPass(p => !p)}
                    aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    <i className={`bi ${showPass ? 'bi-eye-slash' : 'bi-eye'}`} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Sección: rol y sucursal ── */}
          <div className="usr-form-section">
            <span className="usr-form-section__label">Rol y sucursal</span>
            <div className="usr-form-grid">
              <div className="usr-field">
                <label className="usr-field__label" htmlFor="um-role">
                  Rol <span className="usr-field__req">*</span>
                </label>
                <select
                  id="um-role" name="role_id"
                  className="usr-field__input usr-field__select"
                  value={form.role_id}
                  onChange={handleChange}
                  required
                >
                  <option value="">Seleccionar rol...</option>
                  {roles.map(r => (
                    <option key={r.role_id} value={r.role_id}>{r.name}</option>
                  ))}
                </select>
              </div>

              {/* Sucursal — solo admin puede asignar */}
              {isAdmin && (
                <div className="usr-field">
                  <label className="usr-field__label" htmlFor="um-branch">Sucursal</label>
                  <select
                    id="um-branch" name="branch_id"
                    className="usr-field__input usr-field__select"
                    value={form.branch_id}
                    onChange={handleChange}
                  >
                    <option value="">Sin sucursal (central)</option>
                    {branches.map(b => (
                      <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* ── Sección: dirección ── */}
          <div className="usr-form-section">
            <span className="usr-form-section__label">Dirección</span>
            <div className="usr-form-grid">
              <div className="usr-field usr-field--full">
                <label className="usr-field__label" htmlFor="um-address">Calle y número</label>
                <input
                  id="um-address" name="address"
                  className="usr-field__input"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="Calle 60 #123, Col. Centro"
                />
              </div>

              <div className="usr-field">
                <label className="usr-field__label" htmlFor="um-state">Estado</label>
                <input
                  id="um-state" name="state"
                  className="usr-field__input"
                  value={form.state}
                  onChange={handleChange}
                  placeholder="Yucatán"
                />
              </div>

              <div className="usr-field">
                <label className="usr-field__label" htmlFor="um-city">Ciudad</label>
                <input
                  id="um-city" name="city"
                  className="usr-field__input"
                  value={form.city}
                  onChange={handleChange}
                  placeholder="Mérida"
                />
              </div>

              <div className="usr-field">
                <label className="usr-field__label" htmlFor="um-zip">Código postal</label>
                <input
                  id="um-zip" name="zip_code"
                  className="usr-field__input"
                  value={form.zip_code}
                  onChange={handleChange}
                  placeholder="97000"
                  maxLength={10}
                />
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="usr-modal__footer">
            <button type="button" className="usr-btn usr-btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="usr-btn usr-btn--primary"
              disabled={isSaving || !form.username.trim() || !form.role_id}
            >
              {isSaving
                ? <><span className="usr-spinner" style={{ borderTopColor: '#fff' }} /> Guardando...</>
                : <><i className="bi bi-floppy" /> {isEdit ? 'Guardar cambios' : 'Crear usuario'}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default UserModal