// src/components/Purchases/modals/PurchaseFormModal.jsx
// Nueva compra (specs/14-modulo-de-compras.md, requisitos 1–7, 14 y 33). Las
// listas vienen de GET /purchases/options: métodos de pago sin Crédito,
// proveedores activos y cajas abiertas. Las líneas, de PurchaseLines.
//
// "Pagado desde caja" solo aparece con Efectivo; entonces pide la caja
// abierta de la sucursal y la fecha queda en hoy.
//
// Desde el POS (requisito 27) se abre con posRegister ({ branchId,
// cashRegisterId, name }): la compra queda fija en Efectivo, pagada desde la
// caja del POS, de hoy y de su sucursal.
import { useMemo, useState } from 'react'
import api from '../../../services/api'
import { todayInAppTimezone } from '../../../utils/dateRanges'
import PurchaseLines from '../PurchaseLines'
import {
  RECEIPT_ACCEPT, MAX_RECEIPT_MB, receiptError, buildPurchaseFormData, linesError, purchaseTotal, money,
} from '../purchaseForm'
import '../purchases.css'

const PurchaseFormModal = ({ options, isCentralAdmin, posRegister = null, onSaved, onClose }) => {
  const today = todayInAppTimezone()
  const fromPos = posRegister !== null
  const cashMethod = options.payment_methods.find(m => m.code === 'cash')

  const [branchId,         setBranchId]         = useState('')
  const [providerId,       setProviderId]       = useState('')
  const [purchaseDate,     setPurchaseDate]     = useState(today)
  const [paymentMethodId,  setPaymentMethodId]  = useState('')
  const [paidFromRegister, setPaidFromRegister] = useState(false)
  const [cashRegisterId,   setCashRegisterId]   = useState('')
  const [folio,            setFolio]            = useState('')
  const [notes,            setNotes]            = useState('')
  const [receipt,          setReceipt]          = useState(null)
  const [lines,            setLines]            = useState([])
  const [isSaving,         setIsSaving]         = useState(false)
  const [error,            setError]            = useState(null)

  const method = options.payment_methods.find(m => String(m.payment_method_id) === paymentMethodId)
  const isCash = method?.code === 'cash'
  const total  = purchaseTotal(lines)

  // Sucursal de la compra: la del POS, la que elige el admin central, o
  // ninguna (el backend usa la del usuario)
  const purchaseBranchId = fromPos ? posRegister.branchId : (isCentralAdmin ? branchId : '')

  // Cajas abiertas de la sucursal de la compra (el usuario de sucursal ya
  // recibe solo las de la suya)
  const registers = useMemo(
    () => options.registers.filter(r => !isCentralAdmin || String(r.branch_id) === branchId),
    [options.registers, isCentralAdmin, branchId]
  )

  const changeMethod = (value) => {
    setPaymentMethodId(value)
    const next = options.payment_methods.find(m => String(m.payment_method_id) === value)
    if (next?.code !== 'cash') { setPaidFromRegister(false); setCashRegisterId('') }
  }

  const changeBranch = (value) => {
    setBranchId(value)
    setCashRegisterId('')
  }

  const changePaidFromRegister = (checked) => {
    setPaidFromRegister(checked)
    if (checked) {
      setPurchaseDate(today)
      if (registers.length === 1) setCashRegisterId(String(registers[0].cash_register_id))
    } else {
      setCashRegisterId('')
    }
  }

  const changeReceipt = (file) => {
    const message = receiptError(file)
    setError(message)
    setReceipt(message ? null : file)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!providerId) { setError('Elige el proveedor'); return }
    const message = linesError(lines)
    if (message) { setError(message); return }
    if (fromPos && !cashMethod) { setError('El método Efectivo no está activo'); return }
    if (!fromPos && paidFromRegister && !cashRegisterId) { setError('Elige la caja de la que sale el efectivo'); return }

    const fields = fromPos
      ? {
        provider_id:        providerId,
        payment_method_id:  cashMethod.payment_method_id,
        paid_from_register: true,
        cash_register_id:   posRegister.cashRegisterId,
      }
      : {
        branch_id:          purchaseBranchId,
        purchase_date:      purchaseDate,
        provider_id:        providerId,
        payment_method_id:  paymentMethodId,
        paid_from_register: paidFromRegister,
        cash_register_id:   paidFromRegister ? cashRegisterId : '',
      }

    setIsSaving(true)
    setError(null)
    try {
      const form = buildPurchaseFormData({ ...fields, folio: folio.trim(), notes: notes.trim() }, lines, receipt)
      const { data } = await api.post('purchases', form)
      onSaved(data.data)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al registrar la compra')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="pur-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <form className="pur-modal pur-modal--wide" role="dialog" aria-label="Nueva compra" onSubmit={handleSubmit}>
        <div className="pur-modal__header">
          <h3 className="pur-modal__title"><i className="bi bi-cart-check" /> Nueva compra</h3>
          <button type="button" className="pur-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="pur-modal__body">
          {error && (
            <div className="pur-alert" role="alert">
              <i className="bi bi-exclamation-circle" /><span>{error}</span>
            </div>
          )}

          {fromPos && (
            <div className="pur-alert pur-alert--info">
              <i className="bi bi-cash-stack" />
              <span>Se paga en efectivo desde {posRegister.name}, con fecha de hoy.</span>
            </div>
          )}

          <div className="pur-form-grid">
            {!fromPos && isCentralAdmin && (
              <div className="pur-field pur-field--full">
                <label className="pur-field__label" htmlFor="pur-branch">
                  Sucursal <span className="pur-field__req">*</span>
                </label>
                <select id="pur-branch" className="pur-field__input" required
                  value={branchId} onChange={e => changeBranch(e.target.value)}>
                  <option value="">Elige la sucursal</option>
                  {(options.branches ?? []).map(b => (
                    <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className={`pur-field ${fromPos ? 'pur-field--full' : ''}`}>
              <label className="pur-field__label" htmlFor="pur-provider">
                Proveedor <span className="pur-field__req">*</span>
              </label>
              <select id="pur-provider" className="pur-field__input" required
                value={providerId} onChange={e => setProviderId(e.target.value)}>
                <option value="">Elige el proveedor</option>
                {options.providers.map(p => (
                  <option key={p.provider_id} value={p.provider_id}>{p.name}</option>
                ))}
              </select>
            </div>

            {!fromPos && (
              <>
                <div className="pur-field">
                  <label className="pur-field__label" htmlFor="pur-date">Fecha de la compra</label>
                  <input id="pur-date" className="pur-field__input" type="date" required
                    max={today} disabled={paidFromRegister}
                    value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
                  {paidFromRegister && <span className="pur-field__hint">Una compra pagada desde caja es de hoy.</span>}
                </div>

                <div className="pur-field">
                  <label className="pur-field__label" htmlFor="pur-method">
                    Método de pago <span className="pur-field__req">*</span>
                  </label>
                  <select id="pur-method" className="pur-field__input" required
                    value={paymentMethodId} onChange={e => changeMethod(e.target.value)}>
                    <option value="">Elige el método</option>
                    {options.payment_methods.map(m => (
                      <option key={m.payment_method_id} value={m.payment_method_id}>{m.name}</option>
                    ))}
                  </select>
                </div>

                {isCash && (
                  <div className="pur-field">
                    <label className="pur-check">
                      <input type="checkbox" checked={paidFromRegister}
                        disabled={registers.length === 0}
                        onChange={e => changePaidFromRegister(e.target.checked)} />
                      <span>
                        <strong>Pagado desde caja</strong>
                        <span className="pur-field__hint">
                          {registers.length === 0
                            ? (isCentralAdmin && !branchId
                              ? 'Elige la sucursal para ver sus cajas abiertas.'
                              : 'No hay cajas abiertas en esta sucursal.')
                            : 'Registra la salida del efectivo en la caja, para que el corte cuadre.'}
                        </span>
                      </span>
                    </label>
                  </div>
                )}

                {paidFromRegister && (
                  <div className="pur-field">
                    <label className="pur-field__label" htmlFor="pur-register">
                      Caja <span className="pur-field__req">*</span>
                    </label>
                    <select id="pur-register" className="pur-field__input" required
                      value={cashRegisterId} onChange={e => setCashRegisterId(e.target.value)}>
                      <option value="">Elige la caja abierta</option>
                      {registers.map(r => (
                        <option key={r.cash_register_id} value={r.cash_register_id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            <div className="pur-field">
              <label className="pur-field__label" htmlFor="pur-folio">Folio (opcional)</label>
              <input id="pur-folio" className="pur-field__input" maxLength={50}
                placeholder="Factura o ticket"
                value={folio} onChange={e => setFolio(e.target.value)} />
            </div>

            <div className="pur-field">
              <label className="pur-field__label" htmlFor="pur-receipt">Comprobante (opcional)</label>
              <input id="pur-receipt" className="pur-field__file" type="file" accept={RECEIPT_ACCEPT}
                onChange={e => changeReceipt(e.target.files?.[0] ?? null)} />
              <span className="pur-field__hint">Foto o PDF de hasta {MAX_RECEIPT_MB} MB.</span>
            </div>

            <div className="pur-field pur-field--full">
              <label className="pur-field__label" htmlFor="pur-notes">Notas (opcional)</label>
              <input id="pur-notes" className="pur-field__input" maxLength={255}
                placeholder="Ej. Entrega incompleta, faltó una caja"
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="pur-section">
            <span className="pur-section__title">Productos</span>
            <PurchaseLines branchId={purchaseBranchId} lines={lines} onChange={setLines} />
          </div>
        </div>

        <div className="pur-modal__footer pur-modal__footer--total">
          <div className="pur-form-total">
            <span>Total de la compra</span>
            <strong aria-label="Total de la compra">{money(total)}</strong>
          </div>
          <div className="pur-modal__footer-actions">
            <button type="button" className="pur-btn pur-btn--ghost" onClick={onClose} disabled={isSaving}>
              Cancelar
            </button>
            <button type="submit" className="pur-btn pur-btn--primary" disabled={isSaving}>
              {isSaving ? <span className="pur-spinner" /> : <><i className="bi bi-check-lg" /> Registrar compra</>}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default PurchaseFormModal
