// src/components/Settings/tabs/PaymentMethodsTab.jsx
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '../../../Context/UserContext'
import api from '../../../services/api'
import PaymentMethodModal from '../modals/PaymentMethodModal'
import ConfirmDialog from '../../Common/ConfirmDialog'

const PaymentMethodsTab = ({ isCentralAdmin }) => {
  const { hasPermission } = useUser()
  const canEdit = isCentralAdmin && hasPermission('settings', 'update')

  const [methods,       setMethods]       = useState([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [error,         setError]         = useState(null)
  const [modal,         setModal]         = useState({ open: false, method: null })
  const [toggling,      setToggling]      = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null)

  const fetchMethods = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data } = await api.get('payment-methods')
      setMethods(data.data)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar métodos de pago')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchMethods() }, [fetchMethods])

  const handleToggleStatus = (method) => {
    if (method.is_active) {
      setConfirmTarget(method)
      return
    }
    performToggle(method)
  }

  const performToggle = async (method) => {
    setToggling(method.payment_method_id)
    setError(null)
    try {
      const { data } = await api.patch(`payment-methods/${method.payment_method_id}/status`, {
        is_active: !method.is_active,
      })
      setMethods(prev => prev.map(m => m.payment_method_id === method.payment_method_id ? data.data : m))
      if (data.data.warning) setError(data.data.warning)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cambiar estado')
    } finally {
      setToggling(null)
    }
  }

  const handleSaved = (savedMethod) => {
    setMethods(prev => {
      const exists = prev.find(m => m.payment_method_id === savedMethod.payment_method_id)
      return exists
        ? prev.map(m => m.payment_method_id === savedMethod.payment_method_id ? savedMethod : m)
        : [...prev, savedMethod]
    })
    setModal({ open: false, method: null })
  }

  const activeCount = methods.filter(m => m.is_active).length

  return (
    <div className="set-section">
      <div className="set-section__head">
        <div>
          <h2 className="set-section__title">Métodos de pago</h2>
          <p className="set-section__sub">
            {isCentralAdmin
              ? 'Catálogo de métodos disponibles para el punto de venta y abonos'
              : 'Solo el administrador central puede gestionar métodos de pago'}
          </p>
        </div>
        {canEdit && (
          <button
            className="set-btn set-btn--primary"
            onClick={() => setModal({ open: true, method: null })}
          >
            <i className="bi bi-plus-lg" />
            <span>Nuevo método</span>
          </button>
        )}
      </div>

      {error && (
        <div className="set-alert set-alert--error">
          <i className="bi bi-exclamation-circle" />
          <span>{error}</span>
          <button className="set-alert__close" onClick={() => setError(null)}>
            <i className="bi bi-x" />
          </button>
        </div>
      )}

      {methods.length > 0 && (
        <div className="set-summary">
          <div className="set-summary__item">
            <span className="set-summary__val">{methods.length}</span>
            <span className="set-summary__label">Total</span>
          </div>
          <div className="set-summary__item">
            <span className="set-summary__val set-summary__val--on">{activeCount}</span>
            <span className="set-summary__label">Activos</span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="set-skeleton">
          {[...Array(3)].map((_, i) => <div key={i} className="set-skeleton__row" />)}
        </div>
      ) : methods.length === 0 ? (
        <div className="set-empty">
          <i className="bi bi-credit-card" />
          <span>No hay métodos de pago definidos</span>
        </div>
      ) : (
        <div className="set-cards">
          {methods.map(method => (
            <div
              key={method.payment_method_id}
              className={`set-card ${!method.is_active ? 'set-card--inactive' : ''}`}
            >
              <span className={`set-card__dot ${method.is_active ? 'set-card__dot--on' : 'set-card__dot--off'}`} />

              <div className="set-card__body">
                <div className="set-card__row">
                  <div className="set-card__info">
                    <span className="set-card__name">{method.name}</span>
                    <span className="set-card__meta">
                      <i className="bi bi-hash" />
                      {method.code}
                    </span>
                  </div>
                  <span className={`set-badge ${method.is_active ? 'set-badge--on' : 'set-badge--off'}`}>
                    <i className={`bi ${method.is_active ? 'bi-check-circle' : 'bi-slash-circle'}`} />
                    {method.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                {canEdit && (
                  <div className="set-card__actions">
                    <button
                      className="set-btn set-btn--ghost"
                      onClick={() => setModal({ open: true, method })}
                    >
                      <i className="bi bi-pencil" />
                      <span>Editar</span>
                    </button>
                    <button
                      className={`set-btn ${method.is_active ? 'set-btn--danger-ghost' : 'set-btn--ghost'}`}
                      onClick={() => handleToggleStatus(method)}
                      disabled={toggling === method.payment_method_id}
                    >
                      {toggling === method.payment_method_id
                        ? <span className="set-spinner set-spinner--sm" />
                        : <i className={`bi ${method.is_active ? 'bi-slash-circle' : 'bi-check-circle'}`} />
                      }
                      <span>{method.is_active ? 'Desactivar' : 'Activar'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <PaymentMethodModal
          method={modal.method}
          onSaved={handleSaved}
          onClose={() => setModal({ open: false, method: null })}
        />
      )}

      {confirmTarget && (
        <ConfirmDialog
          title="Desactivar método de pago"
          message={`¿Desactivar "${confirmTarget.name}"? Ya no podrá seleccionarse para nuevos pagos, pero el historial existente no se ve afectado.`}
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

export default PaymentMethodsTab