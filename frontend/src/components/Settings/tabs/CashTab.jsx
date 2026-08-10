// src/components/Settings/tabs/CashTab.jsx
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '../../../Context/UserContext'
import api from '../../../services/api'
import CashModal from '../modals/CashModal'
import ConfirmDialog from '../../Common/ConfirmDialog'

const CashTab = ({ isCentralAdmin, branchId }) => {
  const { hasPermission } = useUser()
  const canEdit = hasPermission('settings', 'update')

  const [branches,       setBranches]       = useState([])
  const [selectedBranch, setSelectedBranch] = useState(isCentralAdmin ? null : branchId)
  const [registers,      setRegisters]      = useState([])
  const [isLoading,      setIsLoading]      = useState(false)
  const [error,          setError]          = useState(null)
  const [modal,          setModal]          = useState({ open: false, register: null })
  const [toggling,       setToggling]       = useState(null)
  const [confirmTarget,  setConfirmTarget]  = useState(null) // caja a desactivar

  // Admin: cargar lista de sucursales
  useEffect(() => {
    if (!isCentralAdmin) return
    api.get('branches?is_active=true')
      .then(({ data }) => {
        setBranches(data.data)
        if (data.data.length > 0) setSelectedBranch(data.data[0].branch_id)
      })
      .catch(() => {})
  }, [isCentralAdmin])

  const fetchRegisters = useCallback(async () => {
    if (!selectedBranch) return
    setIsLoading(true)
    setError(null)
    try {
      const { data } = await api.get(`cash-registers?branch_id=${selectedBranch}`)
      setRegisters(data.data)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar cajas')
    } finally {
      setIsLoading(false)
    }
  }, [selectedBranch])

  useEffect(() => { fetchRegisters() }, [fetchRegisters])

 const handleToggleStatus = async (register) => {
    if (register.is_active) {
      setConfirmTarget(register)
      return
    }
   
    await performToggle(register)
  }
 
  const performToggle = async (register) => {
    setToggling(register.cash_register_id)
    setError(null)
    try {
      const { data } = await api.patch(
        `cash-registers/${register.cash_register_id}/status`,
        { is_active: !register.is_active }
      )
      setRegisters(prev => prev.map(r =>
        r.cash_register_id === register.cash_register_id ? data.data : r
      ))
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cambiar estado')
    } finally {
      setToggling(null)
    }
  }

  const handleSaved = (savedRegister) => {
    setRegisters(prev => {
      const exists = prev.find(r => r.cash_register_id === savedRegister.cash_register_id)
      return exists
        ? prev.map(r => r.cash_register_id === savedRegister.cash_register_id ? savedRegister : r)
        : [...prev, savedRegister]
    })
    setModal({ open: false, register: null })
  }

  const activeCount   = registers.filter(r => r.is_active).length
  const openCount     = registers.filter(r => r.is_open).length

  return (
    <div className="set-section">
      <div className="set-section__head">
        <div>
          <h2 className="set-section__title">Cajas registradoras</h2>
          <p className="set-section__sub">
            Administra las cajas disponibles para el punto de venta
          </p>
        </div>
        {canEdit && (
          <button
            className="set-btn set-btn--primary"
            onClick={() => setModal({ open: true, register: null })}
            disabled={!selectedBranch}
          >
            <i className="bi bi-plus-lg" />
            <span>Nueva caja</span>
          </button>
        )}
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

      {/* Resumen rápido */}
      {registers.length > 0 && (
        <div className="set-summary">
          <div className="set-summary__item">
            <span className="set-summary__val">{registers.length}</span>
            <span className="set-summary__label">Total</span>
          </div>
          <div className="set-summary__item">
            <span className="set-summary__val set-summary__val--on">{activeCount}</span>
            <span className="set-summary__label">Activas</span>
          </div>
          <div className="set-summary__item">
            <span className="set-summary__val set-summary__val--open">{openCount}</span>
            <span className="set-summary__label">Abiertas ahora</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="set-alert set-alert--error">
          <i className="bi bi-exclamation-circle" />
          <span>{error}</span>
          <button className="set-alert__close" onClick={() => setError(null)}>
            <i className="bi bi-x" />
          </button>
        </div>
      )}

      {/* Skeleton */}
      {isLoading ? (
        <div className="set-skeleton">
          {[...Array(3)].map((_, i) => <div key={i} className="set-skeleton__row" />)}
        </div>
      ) : registers.length === 0 ? (
        <div className="set-empty">
          <i className="bi bi-cash-register" />
          <span>No hay cajas registradas para esta sucursal</span>
        </div>
      ) : (
        <div className="set-cards">
          {registers.map(register => (
            <div
              key={register.cash_register_id}
              className={`set-card ${!register.is_active ? 'set-card--inactive' : ''}`}
            >
              <span className={`set-card__dot ${register.is_active ? 'set-card__dot--on' : 'set-card__dot--off'}`} />

              <div className="set-card__body">
                <div className="set-card__row">
                  <div className="set-card__info">
                    <span className="set-card__name">{register.name}</span>
                    <span className="set-card__meta">
                      <i className="bi bi-hash" />
                      ID {register.cash_register_id}
                    </span>
                  </div>

                  {/* Estado de apertura */}
                  <span className={`set-badge ${register.is_open ? 'set-badge--open' : 'set-badge--closed'}`}>
                    <i className={`bi ${register.is_open ? 'bi-lock-open' : 'bi-lock'}`} />
                    {register.is_open ? 'Abierta' : 'Cerrada'}
                  </span>
                </div>

                {/* Acciones */}
                {canEdit && (
                  <div className="set-card__actions">
                    <button
                      className="set-btn set-btn--ghost"
                      onClick={() => setModal({ open: true, register })}
                      disabled={register.is_open} // no editar mientras esté abierta
                      title={register.is_open ? 'Cierra la caja antes de editar' : 'Editar'}
                    >
                      <i className="bi bi-pencil" />
                      <span>Editar</span>
                    </button>
                    <button
                      className={`set-btn ${register.is_active ? 'set-btn--danger-ghost' : 'set-btn--ghost'}`}
                      onClick={() => handleToggleStatus(register)}
                      disabled={toggling === register.cash_register_id || register.is_open}
                      title={register.is_open ? 'Cierra la caja antes de desactivar' : ''}
                    >
                      {toggling === register.cash_register_id
                        ? <span className="set-spinner set-spinner--sm" />
                        : <i className={`bi ${register.is_active ? 'bi-slash-circle' : 'bi-check-circle'}`} />
                      }
                      <span>{register.is_active ? 'Desactivar' : 'Activar'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal.open && (
        <CashModal
          register={modal.register}
          branchId={selectedBranch}
          onSaved={handleSaved}
          onClose={() => setModal({ open: false, register: null })}
        />
      )}

      {/* Confirmación de desactivación */}
      {confirmTarget && (
        <ConfirmDialog
          title="Desactivar caja"
          message={`¿Desactivar la caja "${confirmTarget.name}"? No podrá usarse para abrir nuevas sesiones hasta que se reactive.`}
          confirmLabel="Desactivar"
          variant="danger"
          onClose={() => setConfirmTarget(null)}
          onConfirm={async () => {
            await performToggle(confirmTarget)
            setConfirmTarget(null)
          }}
        />
      )}

    </div>
  )
}

export default CashTab