// src/components/Products/modals/ProductModal.jsx
import { useState, useEffect, useRef } from 'react'
import api from '../../../services/api'

const UOM_OPTIONS = ['pza', 'kg', 'g', 'lt', 'ml', 'mt', 'cm', 'par', 'cja', 'paq']

const EMPTY = {
  name:           '',
  sku:            '',
  description:    '',
  category_id:    '',
  provider_id:    '',
  purchase_price: '',
  sale_price:     '',
  uom:            'pza',
  color:          '',
  image:          '',
  is_variable:    false,
}

const EMPTY_VARIANT = { label: '', sku: '' }

const ProductModal = ({ product, categories, branchId, providers, onSaved, onClose }) => {
  const isEdit = !!product

  const [form,      setForm]      = useState(EMPTY)
  const [variants,  setVariants]  = useState([{ ...EMPTY_VARIANT }])
  const [isSaving,  setIsSaving]  = useState(false)
  const [error,     setError]     = useState(null)
  const [focusIdx,  setFocusIdx]  = useState(null) // fila que debe recibir foco tras insertarse
  const bodyRef   = useRef(null)
  const labelRefs = useRef([])

  // Cerrar con Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  useEffect(() => {
    if (product) {
      setForm({
        name:           product.name           ?? '',
        sku:            product.sku            ?? '',
        description:    product.description    ?? '',
        category_id:    product.category_id    ?? '',
        provider_id:    product.provider_id    ?? '1',
        purchase_price: product.purchase_price ?? '',
        sale_price:     product.sale_price     ?? '',
        uom:            product.uom            ?? 'pza',
        color:          product.color          ?? '',
        image:          product.image          ?? '',
        is_variable:    Boolean(product.is_variable),
      })
      // Cargar variantes existentes en edición
      if (product.is_variable) {
        api.get(`products/${product.product_id}/variants?branch_id=${branchId}`)
          .then(({ data }) => {
            if (data.data?.length > 0) {
              setVariants(data.data.map(v => ({
                variant_id: v.variant_id,
                label:      v.label ?? '',
                sku:        v.sku   ?? '',
                stock:      v.stock ?? 0,
              })))
            }
          })
          .catch(() => {})
      }
    }
  }, [product])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    console.log(`Name: ${name}, Value: ${value}`);
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    setError(null)
  }

  // ── Margen calculado en tiempo real ──
  const margin = (() => {
    const buy  = parseFloat(form.purchase_price)
    const sell = parseFloat(form.sale_price)
    if (!buy || !sell || sell === 0) return null
    return (((sell - buy) / sell) * 100).toFixed(1)
  })()

  const marginLevel = margin === null ? null
    : margin < 0  ? 'neg'
    : margin < 20 ? 'low'
    : margin < 40 ? 'ok'
    : 'high'

  // ── Variantes ──
  const addVariant = (afterIdx = variants.length - 1) => {
    setVariants(prev => {
      const next = [...prev]
      next.splice(afterIdx + 1, 0, { ...EMPTY_VARIANT })
      return next
    })
    setFocusIdx(afterIdx + 1)
  }

  // Mover el foco a la etiqueta de la fila recién insertada
  useEffect(() => {
    if (focusIdx !== null) {
      labelRefs.current[focusIdx]?.focus()
      setFocusIdx(null)
    }
  }, [variants, focusIdx])

  const removeVariant = (idx) => {
    if (variants.length === 1) return
    setVariants(prev => prev.filter((_, i) => i !== idx))
  }

  const updateVariant = (idx, field, value) => {
    setVariants(prev => prev.map((v, i) => i === idx ? { ...v, [field]: value } : v))
  }

  const handleSubmit = async (e) => {
    console.log(form)
    e.preventDefault()
    setError(null)

    // ── Limpiar y validar variantes ──
    let cleanVariants = []
    if (form.is_variable) {
      // Descartar en silencio filas totalmente vacías (p. ej. una fila de
      // más que quedó del Enter, sin llenar)
      cleanVariants = variants.filter(v => v.label.trim() || v.sku.trim())

      if (cleanVariants.length === 0) {
        setError('Agrega al menos una variante')
        bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      if (cleanVariants.some(v => !v.label.trim())) {
        setError('Todas las variantes deben tener una etiqueta')
        bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
    }

    setIsSaving(true)

    try {
      const payload = {
        name:           form.name.trim(),
        sku:            form.sku.trim()      || null,
        description:    form.description.trim() || null,
        category_id:    form.category_id    || null,
        provider_id:    form.provider_id    || "1", //si no se seleccionó proveedor se selecciona el proveedor generico
        purchase_price: Number(form.purchase_price),
        sale_price:     Number(form.sale_price),
        uom:            form.uom,
        color:          form.color.trim()   || null,
        image:          form.image.trim()   || null,
        is_variable:    form.is_variable,
        variants: form.is_variable
          ? cleanVariants.map(v => ({
              ...(v.variant_id && { variant_id: v.variant_id }),
              label: v.label.trim(),
              sku:   v.sku.trim() || null,
              stock: Number(v.stock) || 0,
            }))
          : [],
      }

      console.log('payload',payload)
      const { data } = isEdit
        ? await api.put(`products/${product.product_id}?branch_id=${branchId}`, payload)
        : await api.post(`products?branch_id=${branchId}`, payload)

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
    <div className="prd-overlay">
      <div className="prd-modal prd-modal--lg">
        {/* ── Header ── */}
        <div className="prd-modal__header">
          <h3 className="prd-modal__title">
            <i className={`bi ${isEdit ? 'bi-box-seam' : 'bi-plus-square'}`} />
            {isEdit ? 'Editar producto' : 'Nuevo producto'}
          </h3>
          <button className="prd-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        {/* ── Body ── */}
        <form className="prd-modal__body" onSubmit={handleSubmit} ref={bodyRef}>

          {/* ── Sección: información básica ── */}
          <div className="prd-form-section">
            <span className="prd-form-section__label">Información básica</span>
            <div className="prd-form-grid">
              <div className="prd-field prd-field--full">
                <label className="prd-field__label" htmlFor="pm-name">
                  Nombre <span className="prd-field__req">*</span>
                </label>
                <input id="pm-name" name="name" className="prd-field__input"
                  value={form.name} onChange={handleChange}
                  placeholder="Nombre del producto" autoFocus required />
              </div>

              <div className="prd-field">
                <label className="prd-field__label" htmlFor="pm-sku">SKU</label>
                <input id="pm-sku" name="sku" className="prd-field__input"
                  value={form.sku} onChange={handleChange}
                  placeholder="COD-001" />
              </div>

              <div className="prd-field">
                <label className="prd-field__label" htmlFor="pm-uom">Unidad de medida</label>
                <select id="pm-uom" name="uom" className="prd-field__input prd-field__select"
                  value={form.uom} onChange={handleChange}>
                  {UOM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              <div className="prd-field">
                <label className="prd-field__label" htmlFor="pm-cat">Categoría</label>
                <select id="pm-cat" name="category_id" className="prd-field__input prd-field__select"
                  value={form.category_id} onChange={handleChange}>
                  <option value="">Sin categoría</option>
                  {categories.map(c => (
                    <option key={c.category_id} value={c.category_id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="prd-field">
                <label className="prd-field__label" htmlFor="pm-prov">Proveedor</label>
                <select id="pm-prov" name="provider_id" className="prd-field__input prd-field__select"
                  value={form.provider_id} onChange={handleChange}>
                   <option value="" disabled>Seleccione un proveedor</option>
                  {providers.map(p => (
                    <option key={p.provider_id} value={p.provider_id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="prd-field">
                <label className="prd-field__label" htmlFor="pm-color">Color</label>
                <input id="pm-color" name="color" className="prd-field__input"
                  value={form.color} onChange={handleChange}
                  placeholder="Rojo, Azul..." />
              </div>

              <div className="prd-field prd-field--full">
                <label className="prd-field__label" htmlFor="pm-desc">Descripción</label>
                <textarea id="pm-desc" name="description"
                  className="prd-field__input prd-field__textarea"
                  value={form.description} onChange={handleChange}
                  placeholder="Descripción del producto..." rows={2} />
              </div>
            </div>
          </div>

          {/* ── Sección: precios ── */}
          <div className="prd-form-section">
            <span className="prd-form-section__label">Precios</span>
            <div className="prd-form-grid">
              <div className="prd-field">
                <label className="prd-field__label" htmlFor="pm-buy">
                  Precio de compra <span className="prd-field__req">*</span>
                </label>
                <div className="prd-field__wrap">
                  <span className="prd-field__prefix">$</span>
                  <input id="pm-buy" name="purchase_price" type="number"
                    min="0" step="0.01"
                    className="prd-field__input prd-field__input--prefix"
                    value={form.purchase_price} onChange={handleChange}
                    placeholder="0.00" required />
                </div>
              </div>

              <div className="prd-field">
                <label className="prd-field__label" htmlFor="pm-sell">
                  Precio de venta <span className="prd-field__req">*</span>
                </label>
                <div className="prd-field__wrap">
                  <span className="prd-field__prefix">$</span>
                  <input id="pm-sell" name="sale_price" type="number"
                    min="0" step="0.01"
                    className="prd-field__input prd-field__input--prefix"
                    value={form.sale_price} onChange={handleChange}
                    placeholder="0.00" required />
                </div>
              </div>

              {/* Margen calculado */}
              {margin !== null && (
                <div className="prd-field prd-field--full">
                  <div className={`prd-margin prd-margin--${marginLevel}`}>
                    <i className={`bi ${
                      marginLevel === 'neg'  ? 'bi-arrow-down-circle' :
                      marginLevel === 'high' ? 'bi-arrow-up-circle'   :
                      'bi-dash-circle'
                    }`} />
                    <span>Margen: <strong>{margin}%</strong></span>
                    <span className="prd-margin__label">
                      {marginLevel === 'neg'  ? 'Vendiendo a pérdida'    :
                       marginLevel === 'low'  ? 'Margen bajo'            :
                       marginLevel === 'ok'   ? 'Margen saludable'       :
                                               'Margen alto'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Sección: imagen ── */}
          <div className="prd-form-section">
            <span className="prd-form-section__label">Imagen</span>
            <div className="prd-form-grid">
              <div className="prd-field prd-field--full">
                <label className="prd-field__label" htmlFor="pm-img">
                  URL de imagen
                </label>
                <div className="prd-field__wrap">
                  <i className="bi bi-image prd-field__icon" />
                  <input id="pm-img" name="image"
                    className="prd-field__input prd-field__input--icon"
                    value={form.image} onChange={handleChange}
                    placeholder="https://..." />
                </div>
                {form.image && (
                  <div className="prd-img-preview">
                    <img src={form.image} alt="Preview"
                      onError={e => e.target.style.display = 'none'} />
                    <span className="prd-muted">Vista previa</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Sección: variantes ── */}
          <div className="prd-form-section">
            <div className="prd-form-section__head">
              <span className="prd-form-section__label">Variantes</span>
              <label className="prd-toggle">
                <input type="checkbox" name="is_variable"
                  checked={form.is_variable} onChange={handleChange} />
                <span className="prd-toggle__track">
                  <span className="prd-toggle__thumb" />
                </span>
                <span className="prd-toggle__label">
                  {form.is_variable ? 'Producto variable' : 'Producto simple'}
                </span>
              </label>
            </div>

            {form.is_variable && (
              <div className="prd-variants">
                <div className="prd-variants__header">
                  <span className="prd-muted">Etiqueta</span>
                  <span className="prd-muted">SKU variante</span>
                  <span />
                </div>

                {variants.map((v, idx) => (
                  <div key={idx} className="prd-variant-row">
                    <input
                      ref={el => labelRefs.current[idx] = el}
                      className="prd-field__input"
                      value={v.label}
                      onChange={e => updateVariant(idx, 'label', e.target.value)}
                      placeholder="Talla S, Color Rojo..."
                      //required={form.is_variable}
                    />
                    <input
                      className="prd-field__input"
                      value={v.sku}
                      onChange={e => updateVariant(idx, 'sku', e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); addVariant(idx) }
                      }}
                      placeholder="SKU-S"
                    />
                    <button
                      type="button"
                      className="prd-variant-remove"
                      onClick={() => removeVariant(idx)}
                      disabled={variants.length === 1}
                      title="Eliminar variante"
                    >
                      <i className="bi bi-trash" />
                    </button>
                  </div>
                ))}

                <button type="button" className="prd-btn prd-btn--ghost prd-variants__add"
                  onClick={() => addVariant()}>
                  <i className="bi bi-plus-lg" />
                  <span>Agregar variante</span>
                </button>
              </div>
            )}
          </div>

          {/* ── Error sticky + Footer ── */}
          {error && (
            <div className="prd-alert prd-alert--sticky">
              <i className="bi bi-exclamation-circle" />
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)}>
                <i className="bi bi-x" />
              </button>
            </div>
          )}
          <div className="prd-modal__footer">
            <button type="button" className="prd-btn prd-btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="prd-btn prd-btn--primary"
              disabled={isSaving || !form.name.trim()}>
              {isSaving
                ? <><span className="prd-spinner prd-spinner--white" /> Guardando...</>
                : <><i className="bi bi-floppy" /> {isEdit ? 'Guardar cambios' : 'Crear producto'}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProductModal