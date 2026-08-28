// src/components/Inventory/tabs/TransfersTab.jsx
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '../../../Context/UserContext'
import api from '../../../services/api'
import TransferModal from '../modals/TransferModal'
import ConfirmDialog from '../../Common/ConfirmDialog'
import { fmtDateTime } from '../../../utils/dateFormatter'

const PAGE_SIZE = 20

const STATUS_MAP = {
  pending:   { label: 'Pendiente',  cls: 'inv-status-badge--warn'  },
  confirmed: { label: 'Confirmado', cls: 'inv-status-badge--green' },
  cancelled: { label: 'Cancelado',  cls: 'inv-status-badge--muted' },
}

const StatusBadge = ({ status }) => {
  const { label, cls } = STATUS_MAP[status] ?? { label: status, cls: '' }
  return <span className={`inv-status-badge ${cls}`}>{label}</span>
}

const TransfersTab = ({ isAdmin, branchId}) => {
  const { hasPermission } = useUser()
  const canTransfer = hasPermission('inventory', 'transfer')

  const [transfers,   setTransfers]   = useState([])
  const [pagination,  setPagination]  = useState({ total: 0, page: 1, totalPages: 1 })
  const [isLoading,   setIsLoading]   = useState(true)
  const [error,       setError]       = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [page,        setPage]        = useState(1)

  const [modalOpen,     setModalOpen]     = useState(false)
  const [confirmTarget, setConfirmTarget] = useState(null) // { transfer, action: 'confirm'|'cancel' }
  const [processing,    setProcessing]    = useState(null)

  const fetchTransfers = useCallback(async (currentPage = 1) => {
     if (!branchId) return 
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: currentPage, limit: PAGE_SIZE, branch_id: branchId })
      if (filterStatus) params.set('status', filterStatus)
      const { data } = await api.get(`inventory/transfers?${params}`)
      setTransfers(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar traspasos')
    } finally {
      setIsLoading(false)
    }
  }, [filterStatus])

  useEffect(() => { fetchTransfers(page) }, [page, fetchTransfers])

  const handleAction = (transfer, action) => {
    setConfirmTarget({ transfer, action })
  }

  const performAction = async () => {
    if (!confirmTarget) return
    const { transfer, action } = confirmTarget
    setProcessing(transfer.transfer_id)
    setConfirmTarget(null)
    try {
      const endpoint = `inventory/transfers/${transfer.transfer_id}/${action}?branch_id=${branchId}`
      const { data } = await api.patch(endpoint)
      setTransfers(prev => prev.map(t =>
        t.transfer_id === transfer.transfer_id ? { ...t, status: data.data.status } : t
      ))
    } catch (err) {
      setError(err.response?.data?.message ?? `Error al ${action === 'confirm' ? 'confirmar' : 'cancelar'} el traspaso`)
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div className="inv-section">
      {/* ── Toolbar ── */}
      <div className="inv-toolbar">
        <select className="inv-select" value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
          <option value="">Todos los estados</option>
          <option value="pending">Pendientes</option>
          <option value="confirmed">Confirmados</option>
          <option value="cancelled">Cancelados</option>
        </select>

        {canTransfer && (
          <button className="inv-btn inv-btn--primary" onClick={() => setModalOpen(true)}>
            <i className="bi bi-shuffle" /><span>Nuevo traspaso</span>
          </button>
        )}
      </div>

      {error && (
        <div className="inv-alert">
          <i className="bi bi-exclamation-circle" /><span>{error}</span>
          <button onClick={() => setError(null)}><i className="bi bi-x" /></button>
        </div>
      )}

      {isLoading ? (
        <div className="inv-skeleton">
          {[...Array(4)].map((_, i) => <div key={i} className="inv-skeleton__row" />)}
        </div>
      ) : transfers.length === 0 ? (
        <div className="inv-empty">
          <i className="bi bi-shuffle" />
          <span>No hay traspasos registrados</span>
        </div>
      ) : (
        <>
          {/* ── Tabla (desktop) ── */}
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Producto</th>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th className="num">Cantidad</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  {canTransfer && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {transfers.map(t => (
                  <tr key={t.transfer_id}>
                    <td className="inv-td-muted">#{t.transfer_id}</td>
                    <td>
                      <div className="inv-mov-product">
                        <span className="inv-product-name">{t.product_name}</span>
                        {t.variant_label && <span className="inv-text-muted">{t.variant_label}</span>}
                      </div>
                    </td>
                    <td className="inv-td-muted">{t.from_branch_name}</td>
                    <td className="inv-td-muted">{t.to_branch_name}</td>
                    <td className="num"><strong>{t.quantity}</strong></td>
                    <td><StatusBadge status={t.status} /></td>
                    <td className="inv-td-muted">{fmtDateTime(t.created_at)}</td>
                    {canTransfer && (
                      <td>
                        {t.status === 'pending' && (
                          <div className="inv-actions">
                            <button
                              className="inv-action-btn inv-action-btn--confirm"
                              title="Confirmar traspaso"
                              onClick={() => handleAction(t, 'confirm')}
                              disabled={processing === t.transfer_id}
                            >
                              {processing === t.transfer_id
                                ? <span className="inv-spinner" />
                                : <i className="bi bi-check-lg" />
                              }
                            </button>
                            <button
                              className="inv-action-btn inv-action-btn--danger"
                              title="Cancelar traspaso"
                              onClick={() => handleAction(t, 'cancel')}
                              disabled={processing === t.transfer_id}
                            >
                              <i className="bi bi-x-lg" />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Cards (móvil) ── */}
          <div className="inv-cards">
            {transfers.map(t => (
              <div key={t.transfer_id} className="inv-transfer-card">
                <div className="inv-transfer-card__top">
                  <span className="inv-muted">Traspaso #{t.transfer_id}</span>
                  <StatusBadge status={t.status} />
                </div>
                <div className="inv-mov-product">
                  <span className="inv-product-name">{t.product_name}</span>
                  {t.variant_label && <span className="inv-muted"> · {t.variant_label}</span>}
                </div>
                <div className="inv-transfer-card__route">
                  <span className="inv-transfer-card__branch">{t.from_branch_name}</span>
                  <i className="bi bi-arrow-right inv-muted" />
                  <span className="inv-transfer-card__branch">{t.to_branch_name}</span>
                </div>
                <div className="inv-transfer-card__meta">
                  <span className="inv-muted">
                    <i className="bi bi-boxes" />{t.quantity} unidades
                  </span>
                  <span className="inv-muted">
                    <i className="bi bi-calendar" />{fmtDateTime(t.created_at)}
                  </span>
                </div>
                {t.notes && <p className="inv-muted" style={{ fontSize: '12px' }}>{t.notes}</p>}
                {canTransfer && t.status === 'pending' && (
                  <div className="inv-transfer-card__actions">
                    <button
                      className="inv-btn inv-btn--ghost"
                      onClick={() => handleAction(t, 'cancel')}
                      disabled={processing === t.transfer_id}
                    >
                      <i className="bi bi-x-lg" /><span>Cancelar</span>
                    </button>
                    <button
                      className="inv-btn inv-btn--primary"
                      onClick={() => handleAction(t, 'confirm')}
                      disabled={processing === t.transfer_id}
                    >
                      {processing === t.transfer_id
                        ? <span className="inv-spinner inv-spinner--white" />
                        : <i className="bi bi-check-lg" />
                      }
                      <span>Confirmar</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Paginación ── */}
          {pagination.totalPages > 1 && (
            <div className="inv-pagination">
              <button className="inv-btn inv-btn--ghost inv-btn--icon"
                onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                <i className="bi bi-chevron-left" />
              </button>
              <span className="inv-pagination__info">
                Página <strong>{page}</strong> de <strong>{pagination.totalPages}</strong>
              </span>
              <button className="inv-btn inv-btn--ghost inv-btn--icon"
                onClick={() => setPage(p => p + 1)} disabled={page === pagination.totalPages}>
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Modal nuevo traspaso ── */}
      {modalOpen && (
        <TransferModal
          onSaved={() => { setModalOpen(false); fetchTransfers(1) }}
          onClose={() => setModalOpen(false)}
        />
      )}

      {/* ── Confirmación ── */}
      {confirmTarget && (
        <ConfirmDialog
          title={confirmTarget.action === 'confirm' ? 'Confirmar traspaso' : 'Cancelar traspaso'}
          message={
            confirmTarget.action === 'confirm'
              ? `¿Confirmar el traspaso de ${confirmTarget.transfer.quantity} unidades de "${confirmTarget.transfer.product_name}" de ${confirmTarget.transfer.from_branch_name} a ${confirmTarget.transfer.to_branch_name}? Se descontará el stock del origen.`
              : `¿Cancelar el traspaso #${confirmTarget.transfer.transfer_id}? Esta acción no se puede deshacer.`
          }
          confirmLabel={confirmTarget.action === 'confirm' ? 'Confirmar' : 'Cancelar traspaso'}
          variant={confirmTarget.action === 'confirm' ? 'default' : 'danger'}
          onClose={() => setConfirmTarget(null)}
          onConfirm={performAction}
        />
      )}
    </div>
  )
}

export default TransfersTab