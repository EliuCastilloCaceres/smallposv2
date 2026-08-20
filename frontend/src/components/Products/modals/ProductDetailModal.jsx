// src/components/Products/modals/ProductDetailModal.jsx
import { useState, useEffect } from 'react'
import api from '../../../services/api'
import { getImageUrl } from '../../../utils/imageUrl'
import { StockBadge } from '../Products'

const fmtMXN = (v) =>
  `$${Number(v ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—'

const DetailRow = ({ icon, label, value }) => (
  <div className="prd-detail__row">
    <span className="prd-detail__label"><i className={`bi ${icon}`} />{label}</span>
    <span className="prd-detail__value">{value ?? '—'}</span>
  </div>
)

const ProductDetailModal = ({ productId, canEdit, branchId, onClose, onEdit }) => {
  const [product,   setProduct]   = useState(null)
  const [variants,  setVariants]  = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => {
    const fetch = async () => {
      setIsLoading(true)
      try {
        const { data } = await api.get(`products/${productId}?branch_id=${branchId}`)
        setProduct(data.data)

        if (data.data.is_variable) {
          const vRes = await api.get(`products/${productId}/variants?branch_id=${branchId}`)
          setVariants(vRes.data.data)
        }
      } catch (err) {
        setError(err.response?.data?.message ?? 'Error al cargar el producto')
      } finally {
        setIsLoading(false)
      }
    }
    fetch()
  }, [productId])

  const margin = product
    ? (((product.sale_price - product.purchase_price) / product.sale_price) * 100).toFixed(1)
    : null

  return (
    <div className="prd-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="prd-modal prd-modal--lg">
        <div className="prd-modal__header">
          <h3 className="prd-modal__title">
            <i className="bi bi-box-seam" />Detalle del producto
          </h3>
          <button className="prd-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="prd-modal__body">
          {isLoading && (
            <div className="prd-skeleton">
              {[...Array(4)].map((_, i) => <div key={i} className="prd-skeleton__row" />)}
            </div>
          )}
          {error && (
            <div className="prd-alert">
              <i className="bi bi-exclamation-circle" /><span>{error}</span>
            </div>
          )}

          {product && !isLoading && (
            <>
              {/* Hero */}
              <div className="prd-detail__hero">
                <div className="prd-detail__hero-img">
                  {product.image
                    ? <img src={getImageUrl(product.image)} alt={product.name}
                        onError={e => e.target.style.display = 'none'} />
                    : <i className="bi bi-box-seam" />
                  }
                </div>
                <div className="prd-detail__hero-info">
                  <h4 className="prd-detail__name">{product.name}</h4>
                  {product.sku && <span className="prd-sku">SKU: {product.sku}</span>}
                  <div className="prd-detail__hero-badges">
                    <span className={`prd-status ${product.is_active ? 'prd-status--on' : 'prd-status--off'}`}>
                      <span className="prd-status__dot" />
                      {product.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                    {!!product.is_variable && (
                      <span className="prd-badge-variable">
                        <i className="bi bi-layers" />Variable
                      </span>
                    )}
                    {product.category_name && (
                      <span className="prd-cat-badge" style={{
                        background: product.category_color
                          ? `${product.category_color}20`
                          : 'var(--prd-accent-bg)',
                        color: product.category_color ?? 'var(--prd-accent)',
                      }}>
                        {product.category_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Sección: información */}
              <div className="prd-detail__section">
                <span className="prd-detail__section-title">Información</span>
                <DetailRow icon="bi-person-workspace" label="Proveedor"  value={product.provider_name} />
                <DetailRow icon="bi-rulers"           label="UOM"        value={product.uom} />
                <DetailRow icon="bi-palette"          label="Color"      value={product.color} />
                {product.description && (
                  <DetailRow icon="bi-text-left"      label="Descripción" value={product.description} />
                )}
              </div>

              {/* Sección: precios */}
              <div className="prd-detail__section">
                <span className="prd-detail__section-title">Precios</span>
                <DetailRow icon="bi-cart-dash" label="Compra"  value={fmtMXN(product.purchase_price)} />
                <DetailRow icon="bi-cart-plus" label="Venta"   value={fmtMXN(product.sale_price)} />
                {margin !== null && (
                  <DetailRow icon="bi-percent" label="Margen"  value={`${margin}%`} />
                )}
              </div>

              {/* Sección: variantes */}
              <div className="prd-detail__section">
                <span className="prd-detail__section-title">
                  {product.is_variable ? 'Variantes' : ''}
                </span>

                {product.is_variable ? (
                  variants.length === 0 ? (
                    <p className="prd-muted" style={{ padding: '8px 0' }}>Sin variantes activas</p>
                  ) : (
                    <div className="prd-variants-table">
                      <div className="prd-variants-table__head">
                        <span>Variante</span>
                        <span>SKU</span>
                      </div>
                      {variants.map(v => (
                        <div key={v.variant_id} className="prd-variants-table__row">
                          <span className="prd-detail__value">{v.label}</span>
                          <span className="prd-muted">{v.sku ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="prd-detail__row">
                    <span className="prd-detail__label">
                      <i className="bi bi-box" />Sin variantes
                    </span>
                  </div>
                )}
              </div>

              {/* Sección: sistema */}
              <div className="prd-detail__section">
                <span className="prd-detail__section-title">Sistema</span>
                <DetailRow icon="bi-hash"           label="ID"           value={`#${product.product_id}`} />
                <DetailRow icon="bi-calendar"       label="Creado"       value={fmtDate(product.created_at)} />
                <DetailRow icon="bi-pencil-square"  label="Actualizado"  value={fmtDate(product.updated_at)} />
              </div>

              {/* Acciones */}
              {canEdit && (
                <div className="prd-detail__actions">
                  <button className="prd-btn prd-btn--primary"
                    onClick={() => { onClose(); onEdit(product) }}>
                    <i className="bi bi-pencil" /><span>Editar producto</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProductDetailModal