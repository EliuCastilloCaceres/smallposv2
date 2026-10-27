// src/components/Expenses/modals/ExpenseFormModal.jsx
// Nuevo gasto (specs/12-modulo-de-gastos.md, requisitos 5–11 y 26). Las
// listas vienen de GET /expenses/options: categorías activas, métodos de
// pago sin Crédito, proveedores activos y cajas abiertas.
//
// "Pagado desde caja" solo aparece con Efectivo; entonces pide la caja
// abierta de la sucursal y la fecha queda en hoy.
import { useMemo, useState } from 'react'
import api from '../../../services/api'
import { todayInAppTimezone } from '../../../utils/dateRanges'
import { RECEIPT_ACCEPT, MAX_RECEIPT_MB, receiptError, buildExpenseFormData } from '../expenseForm'

const ExpenseFormModal = ({ options, isCentralAdmin, onSaved, onClose }) => {
  const today = todayInAppTimezone()

  const [branchId,         setBranchId]         = useState('')
  const [expenseDate,      setExpenseDate]      = useState(today)
  const [categoryId,       setCategoryId]       = useState('')
  const [amount,           setAmount]           = useState('')
  const [description,      setDescription]      = useState('')
  const [paymentMethodId,  setPaymentMethodId]  = useState('')
  const [paidFromRegister, setPaidFromRegister] = useState(false)
  const [cashRegisterId,   setCashRegisterId]   = useState('')
  const [providerId,       setProviderId]       = useState('')
  const [folio,            setFolio]            = useState('')
  const [receipt,          setReceipt]          = useState(null)
  const [isSaving,         setIsSaving]         = useState(false)
  const [error,            setError]            = useState(null)

  const method = options.payment_methods.find(m => String(m.payment_method_id) === paymentMethodId)
  const isCash = method?.code === 'cash'

  // Cajas abiertas de la sucursal del gasto (el usuario de sucursal ya
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
      setExpenseDate(today)
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
    const n = Number(amount)
    if (!amount || isNaN(n) || n <= 0) { setError('El monto debe ser mayor a 0'); return }
    if (paidFromRegister && !cashRegisterId) { setError('Elige la caja de la que sale el efectivo'); return }

    setIsSaving(true)
    setError(null)
    try {
      const form = buildExpenseFormData({
        branch_id:           isCentralAdmin ? branchId : '',
        expense_date:        expenseDate,
        expense_category_id: categoryId,
        amount:              n,
        description:         description.trim(),
        payment_method_id:   paymentMethodId,
        provider_id:         providerId,
        folio:               folio.trim(),
        paid_from_register:  paidFromRegister,
        cash_register_id:    paidFromRegister ? cashRegisterId : '',
      }, receipt)
      const { data } = await api.post('expenses', form)
      onSaved(data.data)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al registrar el gasto')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="exp-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <form className="exp-modal" role="dialog" aria-label="Nuevo gasto" onSubmit={handleSubmit}>
        <div className="exp-modal__header">
          <h3 className="exp-modal__title"><i className="bi bi-wallet2" /> Nuevo gasto</h3>
          <button type="button" className="exp-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="exp-modal__body">
          {error && (
            <div className="exp-alert" role="alert">
              <i className="bi bi-exclamation-circle" /><span>{error}</span>
            </div>
          )}

          <div className="exp-form-grid">
            {isCentralAdmin && (
              <div className="exp-field exp-field--full">
                <label className="exp-field__label" htmlFor="exp-branch">
                  Sucursal <span className="exp-field__req">*</span>
                </label>
                <select id="exp-branch" className="exp-field__input" required
                  value={branchId} onChange={e => changeBranch(e.target.value)}>
                  <option value="">Elige la sucursal</option>
                  {(options.branches ?? []).map(b => (
                    <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="exp-field">
              <label className="exp-field__label" htmlFor="exp-category">
                Categoría <span className="exp-field__req">*</span>
              </label>
              <select id="exp-category" className="exp-field__input" required
                value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                <option value="">Elige la categoría</option>
                {options.categories.map(c => (
                  <option key={c.expense_category_id} value={c.expense_category_id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="exp-field">
              <label className="exp-field__label" htmlFor="exp-amount">
                Monto <span className="exp-field__req">*</span>
              </label>
              <input id="exp-amount" className="exp-field__input" type="number" inputMode="decimal"
                min="0.01" step="0.01" required placeholder="0.00"
                value={amount} onChange={e => setAmount(e.target.value)} />
            </div>

            <div className="exp-field exp-field--full">
              <label className="exp-field__label" htmlFor="exp-description">
                Descripción <span className="exp-field__req">*</span>
              </label>
              <input id="exp-description" className="exp-field__input" required maxLength={255}
                placeholder="Ej. Luz de octubre"
                value={description} onChange={e => setDescription(e.target.value)} />
            </div>

            <div className="exp-field">
              <label className="exp-field__label" htmlFor="exp-method">
                Método de pago <span className="exp-field__req">*</span>
              </label>
              <select id="exp-method" className="exp-field__input" required
                value={paymentMethodId} onChange={e => changeMethod(e.target.value)}>
                <option value="">Elige el método</option>
                {options.payment_methods.map(m => (
                  <option key={m.payment_method_id} value={m.payment_method_id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className="exp-field">
              <label className="exp-field__label" htmlFor="exp-date">Fecha del gasto</label>
              <input id="exp-date" className="exp-field__input" type="date" required
                max={today} disabled={paidFromRegister}
                value={expenseDate} onChange={e => setExpenseDate(e.target.value)} />
              {paidFromRegister && <span className="exp-field__hint">Un gasto pagado desde caja es de hoy.</span>}
            </div>

            {isCash && (
              <div className="exp-field exp-field--full">
                <label className="exp-check">
                  <input type="checkbox" checked={paidFromRegister}
                    disabled={registers.length === 0}
                    onChange={e => changePaidFromRegister(e.target.checked)} />
                  <span>
                    <strong>Pagado desde caja</strong>
                    <span className="exp-field__hint">
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
              <div className="exp-field exp-field--full">
                <label className="exp-field__label" htmlFor="exp-register">
                  Caja <span className="exp-field__req">*</span>
                </label>
                <select id="exp-register" className="exp-field__input" required
                  value={cashRegisterId} onChange={e => setCashRegisterId(e.target.value)}>
                  <option value="">Elige la caja abierta</option>
                  {registers.map(r => (
                    <option key={r.cash_register_id} value={r.cash_register_id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="exp-field">
              <label className="exp-field__label" htmlFor="exp-provider">Proveedor (opcional)</label>
              <select id="exp-provider" className="exp-field__input"
                value={providerId} onChange={e => setProviderId(e.target.value)}>
                <option value="">Sin proveedor</option>
                {options.providers.map(p => (
                  <option key={p.provider_id} value={p.provider_id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="exp-field">
              <label className="exp-field__label" htmlFor="exp-folio">Folio (opcional)</label>
              <input id="exp-folio" className="exp-field__input" maxLength={50}
                placeholder="Factura o ticket"
                value={folio} onChange={e => setFolio(e.target.value)} />
            </div>

            <div className="exp-field exp-field--full">
              <label className="exp-field__label" htmlFor="exp-receipt">Comprobante (opcional)</label>
              <input id="exp-receipt" className="exp-field__file" type="file" accept={RECEIPT_ACCEPT}
                onChange={e => changeReceipt(e.target.files?.[0] ?? null)} />
              <span className="exp-field__hint">Foto o PDF de hasta {MAX_RECEIPT_MB} MB.</span>
            </div>
          </div>
        </div>

        <div className="exp-modal__footer">
          <button type="button" className="exp-btn exp-btn--ghost" onClick={onClose} disabled={isSaving}>
            Cancelar
          </button>
          <button type="submit" className="exp-btn exp-btn--primary" disabled={isSaving}>
            {isSaving ? <span className="exp-spinner" /> : <><i className="bi bi-check-lg" /> Registrar gasto</>}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ExpenseFormModal
