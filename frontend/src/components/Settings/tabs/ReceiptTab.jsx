// src/components/Settings/tabs/ReceiptTab.jsx
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '../../../context/UserContext'
import api from '../../../services/api'
import { getImageUrl } from '../../../utils/imageUrl'

// Debe coincidir con ALLOWED_EXT/ALLOWED_MIME en uploadImage.js del backend
// (mismas constantes que ProductModal.jsx, límite distinto: 2 MB para recibos
// vs 5 MB para productos — ver uploadReceiptImage en uploadImage.js).
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_SIZE_MB = 2

const EMPTY_FORM = {
  store_name: '', address: '', rfc: '', phone: '', footer_text: '',
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
  const [logoFile,       setLogoFile]       = useState(null) // File nuevo seleccionado, o null
  const [existingLogo,   setExistingLogo]   = useState(null) // ruta que ya viene del recibo (logo actual)
  const [previewUrl,     setPreviewUrl]     = useState(null) // URL a mostrar en el preview (local u origen)

  // Genera/limpia el preview: si hay un File nuevo, usamos un object URL local;
  // si no, mostramos el logo existente del recibo (si lo hay). Mismo patrón
  // que ProductModal.jsx.
  useEffect(() => {
    if (logoFile) {
      const objectUrl = URL.createObjectURL(logoFile)
      setPreviewUrl(objectUrl)
      return () => URL.revokeObjectURL(objectUrl) // liberar memoria al cambiar/desmontar
    }
    setPreviewUrl(existingLogo ? getImageUrl(existingLogo) : null)
  }, [logoFile, existingLogo])

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError('Solo se permiten imágenes JPG, PNG o WEBP')
      e.target.value = '' // limpiar el input para poder reintentar con el mismo archivo si corrige
      return
    }
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      setError(`La imagen no puede superar ${MAX_IMAGE_SIZE_MB} MB`)
      e.target.value = ''
      return
    }

    setError(null)
    setLogoFile(file)
  }

  // Cancela el archivo NUEVO seleccionado y vuelve a mostrar el logo existente.
  // No borra el logo del recibo: el backend, cuando no llega archivo, deja
  // el logo actual intacto (ver upsertReceipt en branchController.js).
  const clearNewLogo = () => {
    setLogoFile(null)
  }

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
          }
        : EMPTY_FORM
      )
      setExistingLogo(receipt?.logo_image ?? null)
      setLogoFile(null) // por si se cambió de sucursal con un archivo nuevo sin guardar
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
      // multipart/form-data: todo viaja como texto excepto el archivo del logo.
      const fd = new FormData()
      fd.append('store_name', form.store_name.trim())
      fd.append('address', form.address.trim())
      fd.append('rfc', form.rfc.trim())
      fd.append('phone', form.phone.trim())
      fd.append('footer_text', form.footer_text.trim())
      if (logoFile) fd.append('logo_image', logoFile) // el nombre "logo_image" debe coincidir con upload.single('logo_image')

      // Ojo: NO se setea Content-Type a mano — axios/el navegador arman el
      // multipart/form-data con el boundary correcto solo si se lo dejamos.
      await api.put(`branches/${selectedBranch}/receipt`, fd)
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
                Logo del ticket
              </label>

              {canEdit && (
                <label className="set-file-picker" htmlFor="logo_image">
                  <i className="bi bi-cloud-arrow-up" />
                  <span>
                    {logoFile ? logoFile.name : 'Elegir imagen…'}
                    <span className="set-file-picker__hint">
                      JPG, PNG o WEBP · máx. {MAX_IMAGE_SIZE_MB} MB
                    </span>
                  </span>
                  <input id="logo_image" name="logo_image" type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleLogoChange} />
                </label>
              )}

              {previewUrl && (
                <div className="set-logo-preview">
                  <img src={previewUrl} alt="Logo preview"
                    onError={e => e.target.style.display = 'none'} />
                  {canEdit && (
                    <div className="set-logo-preview__info">
                      <span className="set-muted">
                        {logoFile ? 'Nuevo logo (sin guardar)' : 'Logo actual'}
                      </span>
                      {logoFile && (
                        <button type="button" className="set-btn set-btn--ghost"
                          onClick={clearNewLogo}>
                          <i className="bi bi-arrow-counterclockwise" /> Cancelar cambio
                        </button>
                      )}
                    </div>
                  )}
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