// src/components/Settings/tabs/BranchesTab.jsx
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '../../../Context/UserContext'
import api from '../../../services/api'
import BranchModal from '../modals/BranchModal'
import BranchCategoriesModal from '../modals/BranchCategoriesModal'
import ConfirmDialog from '../../Common/ConfirmDialog'

const BranchesTab = ({ isCentralAdmin }) => {
  const { user, hasPermission } = useUser()
  const canEdit = hasPermission('settings', 'update')

  const [branches,   setBranches]   = useState([])
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)
  const [modal,      setModal]      = useState({ open: false, branch: null }) // branch=null → crear
  const [catModal,   setCatModal]   = useState({ open: false, branch: null })
  const [toggling,   setToggling]   = useState(null) // branch_id en proceso
  const [confirmTarget, setConfirmTarget] = useState(null) // sucursal a desactivar

  const fetchBranches = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data } = await api.get('branches')
      setBranches(data.data)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar sucursales')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchBranches() }, [fetchBranches])

  const handleToggleStatus = async (branch) => {
    if (branch.is_active) {
      setConfirmTarget(branch)
      return
    }
    await performToggle(branch)
  }

  const performToggle = async (branch) => {
    setToggling(branch.branch_id)
    try {
      const { data } = await api.patch(`branches/${branch.branch_id}/status`, {
        is_active: !branch.is_active,
      })
      setBranches(prev => prev.map(b =>
        b.branch_id === branch.branch_id ? data.data : b
      ))
      // Mostrar warning si viene en la respuesta
      if (data.data.warning) setError(data.data.warning)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cambiar estado')
    } finally {
      setToggling(null)
    }
  }

  const handleSaved = (savedBranch) => {
    setBranches(prev => {
      const exists = prev.find(b => b.branch_id === savedBranch.branch_id)
      return exists
        ? prev.map(b => b.branch_id === savedBranch.branch_id ? savedBranch : b)
        : [savedBranch, ...prev]
    })
    setModal({ open: false, branch: null })
  }

  // ── Skeleton ──
  if (isLoading) return (
    <div className="set-skeleton">
      {[...Array(3)].map((_, i) => <div key={i} className="set-skeleton__row" />)}
    </div>
  )

  return (
    <div className="set-section">
      {/* Header de sección */}
      <div className="set-section__head">
        <div>
          <h2 className="set-section__title">Sucursales</h2>
          <p className="set-section__sub">
            {isCentralAdmin
              ? 'Administra todas las sucursales del negocio'
              : 'Información de tu sucursal'}
          </p>
        </div>
        {isCentralAdmin && canEdit && (
          <button
            className="set-btn set-btn--primary"
            onClick={() => setModal({ open: true, branch: null })}
          >
            <i className="bi bi-plus-lg" />
            <span>Nueva sucursal</span>
          </button>
        )}
      </div>

      {/* Warning / Error */}
      {error && (
        <div className="set-alert set-alert--warn">
          <i className="bi bi-exclamation-triangle" />
          <span>{error}</span>
          <button className="set-alert__close" onClick={() => setError(null)}>
            <i className="bi bi-x" />
          </button>
        </div>
      )}

      {/* Lista de sucursales */}
      {branches.length === 0 ? (
        <div className="set-empty">
          <i className="bi bi-building" />
          <span>No hay sucursales registradas</span>
        </div>
      ) : (
        <div className="set-cards">
          {branches.map(branch => (
            <div
              key={branch.branch_id}
              className={`set-card ${!branch.is_active ? 'set-card--inactive' : ''}`}
            >
              {/* Indicador de estado */}
              <span className={`set-card__dot ${branch.is_active ? 'set-card__dot--on' : 'set-card__dot--off'}`} />

              <div className="set-card__body">
                <div className="set-card__row">
                  <div className="set-card__info">
                    <span className="set-card__name">{branch.name}</span>
                    {branch.city && (
                      <span className="set-card__meta">
                        <i className="bi bi-geo-alt" />
                        {[branch.city, branch.state].filter(Boolean).join(', ')}
                      </span>
                    )}
                    {branch.phone_number && (
                      <span className="set-card__meta">
                        <i className="bi bi-telephone" />
                        {branch.phone_number}
                      </span>
                    )}
                  </div>

                  {/* Recibo badge */}
                  <span className={`set-badge ${branch.receipt ? 'set-badge--on' : 'set-badge--off'}`}>
                    <i className={`bi ${branch.receipt ? 'bi-receipt-cutoff' : 'bi-receipt'}`} />
                    {branch.receipt ? 'Recibo configurado' : 'Sin recibo'}
                  </span>
                </div>

                {/* Acciones */}
                {(canEdit && (isCentralAdmin || user?.branch_id === branch.branch_id)) && (
                  <div className="set-card__actions">
                    <button
                      className="set-btn set-btn--ghost"
                      onClick={() => setCatModal({ open: true, branch })}
                    >
                      <i className="bi bi-bookmark-star" />
                      <span>Categorías POS</span>
                    </button>

                    {isCentralAdmin && (
                      <>
                        <button
                          className="set-btn set-btn--ghost"
                          onClick={() => setModal({ open: true, branch })}
                        >
                          <i className="bi bi-pencil" />
                          <span>Editar</span>
                        </button>
                        <button
                          className={`set-btn ${branch.is_active ? 'set-btn--danger-ghost' : 'set-btn--ghost'}`}
                          onClick={() => handleToggleStatus(branch)}
                          disabled={toggling === branch.branch_id}
                        >
                          {toggling === branch.branch_id
                            ? <span className="set-spinner set-spinner--sm" />
                            : <i className={`bi ${branch.is_active ? 'bi-slash-circle' : 'bi-check-circle'}`} />
                          }
                          <span>{branch.is_active ? 'Desactivar' : 'Activar'}</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal crear / editar */}
      {modal.open && (
        <BranchModal
          branch={modal.branch}
          onSaved={handleSaved}
          onClose={() => setModal({ open: false, branch: null })}
        />
      )}
       {/* Modal categorías POS */}
      {catModal.open && catModal.branch && (
        <BranchCategoriesModal
          branch={catModal.branch}
          onClose={() => setCatModal({ open: false, branch: null })}
        />
      )}
      {/* Confirmación de desactivación */}
      {confirmTarget && (
        <ConfirmDialog
          title="Desactivar sucursal"
          message={`¿Desactivar la sucursal "${confirmTarget.name}"? No podrá usarse para nuevas operaciones hasta que se reactive.`}
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

export default BranchesTab