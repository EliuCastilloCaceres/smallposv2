// src/components/Pos/UserMenu.jsx
// Dropdown en el header del POS con el nombre del cajero. Reemplaza el botón
// suelto de "Cerrar caja". Items: Movimientos de efectivo, Corte de caja,
// Salir temporalmente (navega al home de la app SIN hacer corte — el carrito
// activo y los suspendidos se conservan gracias a la persistencia agregada
// en PosContext).

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../../Context/UserContext'

const UserMenu = ({ onOpenMovements, onOpenClose }) => {
  const { user } = useUser()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleExitTemp = () => {
    setOpen(false)
    // El carrito activo y los suspendidos ya se persisten en localStorage
    // (ver PosContext) — no se pierde nada al navegar fuera del POS.
    navigate('/dashboard')
  }

  return (
    <div className="pos-usermenu" ref={rootRef}>
      <button
        type="button"
        className="pos-usermenu__trigger"
        onClick={() => setOpen(o => !o)}
      >
        <span className="pos-usermenu__avatar">
          <i className="bi bi-person-circle" />
        </span>
        <span className="pos-usermenu__name">{user?.username}</span>
        <i className={`bi bi-chevron-${open ? 'up' : 'down'} pos-usermenu__chevron`} />
      </button>

      {open && (
        <div className="pos-usermenu__panel">
          <button
            type="button"
            className="pos-usermenu__item"
            onClick={() => { setOpen(false); onOpenMovements() }}
          >
            <i className="bi bi-cash-stack" />
            <span>Movimientos de efectivo</span>
          </button>

          <button
            type="button"
            className="pos-usermenu__item"
            onClick={() => { setOpen(false); onOpenClose() }}
          >
            <i className="bi bi-calculator" />
            <span>Corte de caja</span>
          </button>

          <div className="pos-usermenu__divider" />

          <button
            type="button"
            className="pos-usermenu__item pos-usermenu__item--muted"
            onClick={handleExitTemp}
          >
            <i className="bi bi-box-arrow-left" />
            <span>Salir temporalmente</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default UserMenu
