// src/components/Common/BranchGate.jsx
import { useUser }   from '../../Context/UserContext'
import { useBranch } from '../../Context/BranchContext'
import BranchPicker  from './BranchPicker'

/**
 * BranchGate — wrapper para módulos que requieren una sucursal seleccionada.
 *
 * Uso:
 *   <BranchGate>
 *     <Products />
 *   </BranchGate>
 *
 * Props opcionales:
 *   title       — título del picker (string)
 *   description — descripción del picker (string)
 *
 * Comportamiento:
 *   - Usuario normal  → pasa directo (su branch viene del token)
 *   - Admin con rama  → pasa directo + muestra chip para cambiar
 *   - Admin sin rama  → muestra BranchPicker
 */
const BranchGate = ({ children, title, description }) => {
  const { isCentralAdmin }        = useUser()
  const { selectedBranch, clearBranch } = useBranch()

  // Usuarios sin alcance central siempre tienen branch asignada (vía
  // branches/me en BranchContext) — pasan directo, sin importar su rol.
  if (!isCentralAdmin) return children

  // Admin central sin sucursal seleccionada → picker
  if (!selectedBranch) {
    return <BranchPicker title={title} description={description} />
  }

  // Admin con sucursal → renderizar módulo + chip de cambio
  return (
    <>
      <div className="bp-active-bar">
        <div className="bp-active-bar__info">
          <i className="bi bi-building-check" />
          <span className="bp-active-bar__name">{selectedBranch.name}</span>
        </div>
        <button className="bp-active-bar__change" onClick={clearBranch}>
          <i className="bi bi-arrow-left-right" />
          <span>Cambiar</span>
        </button>
      </div>
      {children}
    </>
  )
}

export default BranchGate