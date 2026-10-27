// src/components/Reports/components/ProductEdit.jsx
// Editar un producto desde un reporte con el mismo formulario de Productos:
// Valuación (specs/07, requisito 33) y Rotación (specs/10, requisito 37). El
// formulario necesita el producto completo, como al editar desde Productos;
// al guardar se cierra y la pestaña vuelve a pedir su reporte (onSaved).
import { useState } from 'react'
import api from '../../../services/api'
import ProductModal from '../../Products/modals/ProductModal'
// Estilos del formulario de producto; sus variables viven en .prd-root
import '../../Products/products.css'

export const EditButton = ({ name, onClick }) => (
  <button
    type="button" className="rpt-btn rpt-btn--ghost rpt-btn--icon rpt-row-edit"
    aria-label={`Editar ${name}`} title="Editar producto"
    onClick={onClick}
  >
    <i className="bi bi-pencil" />
  </button>
)

// openEdit(productId) abre el formulario; editForm se dibuja en la pestaña
export const useProductEdit = ({ categories, providers, onSaved, onError }) => {
  const [editing, setEditing] = useState(null)

  const openEdit = (productId) => {
    api.get(`products/${productId}`)
      .then(({ data }) => setEditing(data.data))
      .catch((err) => onError(err.response?.data?.message ?? 'No se pudo abrir el producto'))
  }

  const editForm = editing && (
    <div className="prd-root">
      <ProductModal
        product={editing}
        categories={categories}
        providers={providers}
        onSaved={() => { setEditing(null); onSaved() }}
        onClose={() => setEditing(null)}
      />
    </div>
  )

  return { openEdit, editForm }
}
