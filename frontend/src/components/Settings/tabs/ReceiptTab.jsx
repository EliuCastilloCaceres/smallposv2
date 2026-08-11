// src/components/Settings/tabs/ReceiptTab.jsx
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '../../../Context/UserContext'
import api from '../../../services/api'

const EMPTY_FORM = {
  store_name: '', address: '', rfc: '', phone: '', footer_text: '', logo_image: '',
}

const ReceiptTab = ({ isCentralAdmin, branchId }) => {
  const { user: currentUser, hasPermission } = useUser()

  // FIX: antes hasPermission('settings','update') — permiso que nunca
  // existió en el seed. La ruta PUT /branches/:id/receipt ahora exige
  // branches.update (ver branch_routes.js), así que la UI debe checar lo
  // mismo para ser congruente con lo que el backend realmente permite.
  const isSuperadmin = currentUser?.role_name === 'superadmin'
  const canEdit = hasPermission('branches', 'update')

  const [branches,       setBranches]       = useState([])
  const [selectedBranch, setSelectedBranch] = useState(isCentralAdmin ? null : branchId)
  const [form,           setForm]           = useState(EMPTY_FORM)
  const [isLoading,      setIsLoading]      = useState(false)
  const [isSaving,       setIsSaving]       = useState(false)
  const [error,          setError]          = useState(null)
  const [success,        setSuccess]        = useState(false)

  // Admin necesita lista de sucursales para seleccionar
  useEffect(() => {
    if (!isCentralAdmin) return
    api.get('branches?is_active=true')
      .then(({ data }) => {
        setBranches(data.data)
        if (data.data.length > 0) setSelectedBranch(data.data[0].branch_id)
      })
      .catch(() => {})
  }, [isCentralAdmin])

  // Cargar recibo cuando cambia la sucursal seleccionada
  const fetchReceipt = useCallback(async () => {
    if (!selectedBranch) return
    setIsLoading(true)
    setError(null)
    setSuccess(false)
    try {
      const { data } = await api.get(`branches/${selectedBranch}`)
      const receipt = data.data.receipt
      setForm(receipt
        ? {
            store_name:  receipt.store_name  ?? '',
            address:     receipt.address     ?? '',
            rfc:         receipt.rfc         ?? '',
            phone:       receipt.phone       ?? '',
            footer_text: receipt.footer_text ?? '',
            logo_image:  receipt.logo_image  ?? '',
          }
        : EMPTY_FORM
      )
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar el recibo')
    } finally {
      setIsLoading(false)
    }
  }, [selectedBranch])

  useEffect(() => { fetchReceipt() }, [fetchReceipt])

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setSuccess(false)
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedBranch) return
    setIsSaving(true)
    setError(null)
    setSuccess(false)
    try {
      await api.put(`branches/${selectedBranch}/receipt`, form)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al guardar el recibo')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="set-section">
      <div className="set-section__head">
        <div>
          <h2 className="set-section__title">Datos del recibo</h2>
          <p className="set-section__sub">Información que aparece en los tickets de venta</p>
        </div>
      </div>

      {/* Selector de sucursal (solo admin) */}
      {isCentralAdmin && branches.length > 0 && (
        <div className="set-field">
          <label className="set-field__label">Sucursal</label>
          <select
            className="set-field__input"
            value={selectedBranch ?? ''}
            onChange={e => setSelectedBranch(Number(e.target.value))}
          >
            {branches.map(b => (
              <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Skeleton */}
      {isLoading ? (
        <div className="set-skeleton">
          {[...Array(4)].map((_, i) => <div key={i} className="set-skeleton__row" />)}
        </div>
      ) : (
        <form className="set-form" onSubmit={handleSubmit}>
          {/* Feedback */}
          {error && (
            <div className="set-alert set-alert--error">
              <i className="bi bi-exclamation-circle" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="set-alert set-alert--success">
              <i className="bi bi-check-circle" />
              <span>Recibo guardado correctamente</span>
            </div>
          )}

          <div className="set-form__grid">
            <div className="set-field set-field--full">
              <label className="set-field__label" htmlFor="store_name">
                Nombre del negocio <span className="set-field__req">*</span>
              </label>
              <input
                id="store_name" name="store_name"
                className="set-field__input"
                value={form.store_name}
                onChange={handleChange}
                placeholder="Mi Tienda S.A."
                disabled={!canEdit}
                required
              />
            </div>

            <div className="set-field">
              <label className="set-field__label" htmlFor="rfc">RFC</label>
              <input
                id="rfc" name="rfc"
                className="set-field__input"
                value={form.rfc}
                onChange={handleChange}
                placeholder="XAXX010101000"
                disabled={!canEdit}
                maxLength={13}
              />
            </div>

            <div className="set-field">
              <label className="set-field__label" htmlFor="phone">Teléfono</label>
              <input
                id="phone" name="phone"
                className="set-field__input"
                value={form.phone}
                onChange={handleChange}
                placeholder="(999) 123-4567"
                disabled={!canEdit}
              />
            </div>

            <div className="set-field set-field--full">
              <label className="set-field__label" htmlFor="address">Dirección</label>
              <input
                id="address" name="address"
                className="set-field__input"
                value={form.address}
                onChange={handleChange}
                placeholder="Calle, número, colonia, ciudad"
                disabled={!canEdit}
              />
            </div>

            <div className="set-field set-field--full">
              <label className="set-field__label" htmlFor="footer_text">
                Texto de pie de ticket
              </label>
              <textarea
                id="footer_text" name="footer_text"
                className="set-field__input set-field__textarea"
                value={form.footer_text}
                onChange={handleChange}
                placeholder="¡Gracias por su compra! Conserve su ticket."
                rows={3}
                disabled={!canEdit}
              />
            </div>

            <div className="set-field set-field--full">
              <label className="set-field__label" htmlFor="logo_image">
                URL del logo
              </label>
              <input
                id="logo_image" name="logo_image"
                className="set-field__input"
                value={form.logo_image}
                onChange={handleChange}
                placeholder="https://..."
                disabled={!canEdit}
              />
              {form.logo_image && (
                <div className="set-logo-preview">
                  <img src={form.logo_image} alt="Logo preview" onError={e => e.target.style.display = 'none'} />
                </div>
              )}
            </div>
          </div>

          {canEdit && (
            <div className="set-form__footer">
              <button
                type="submit"
                className="set-btn set-btn--primary"
                disabled={isSaving || !form.store_name.trim()}
              >
                {isSaving
                  ? <><span className="set-spinner set-spinner--sm" /> Guardando...</>
                  : <><i className="bi bi-floppy" /> Guardar recibo</>
                }
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  )
}

export default ReceiptTab