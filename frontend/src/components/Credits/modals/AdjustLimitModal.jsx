// src/components/Credits/modals/AdjustLimitModal.jsx
import { useState, useRef, useCallback } from 'react'
import api from '../../../services/api'

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const AdjustLimitModal = ({ onClose, onChanged }) => {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef(null)

  const [selected, setSelected] = useState(null)
  const [newLimit, setNewLimit] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)
  const [done,     setDone]     = useState(false)

  const runSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    try {
      const { data } = await api.get('customers', { params: { search: q.trim(), is_active: true, limit: 10 } })
      setResults(data.data ?? [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  const handleQueryChange = (val) => {
    setQuery(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => runSearch(val), 350)
  }

  const pick = (c) => {
    setSelected(c)
    setNewLimit(String(c.credit_limit ?? 0))
    setQuery('')
    setResults([])
  }

  const handleSave = async () => {
    const val = Number(newLimit)
    if (isNaN(val) || val < 0) { setError('Ingresa un límite válido'); return }
    setIsSaving(true)
    setError(null)
    try {
      await api.patch(`credits/customers/${selected.customer_id}/limit`, { creditLimit: val })
      setDone(true)
      onChanged?.()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al actualizar el límite')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="crd-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="crd-modal">
        <div className="crd-modal__header">
          <h3 className="crd-modal__title"><i className="bi bi-sliders" /> Ajustar límite de crédito</h3>
          <button className="crd-modal__close" onClick={onClose}><i className="bi bi-x-lg" /></button>
        </div>

        <div className="crd-modal__body">
          {done ? (
            <div className="crd-detail-loading" style={{ flexDirection: 'column', gap: 10 }}>
              <i className="bi bi-check-circle-fill" style={{ fontSize: 40, color: 'var(--crd-green)' }} />
              <span>Límite actualizado para {selected.first_name} {selected.last_name}</span>
            </div>
          ) : !selected ? (
            <>
              <div className="crd-search">
                <i className="bi bi-search crd-search__icon" />
                <input
                  type="text" className="crd-search__input"
                  placeholder="Buscar cliente por nombre o teléfono..."
                  value={query} onChange={e => handleQueryChange(e.target.value)}
                  autoFocus
                />
                {searching && <span className="crd-spinner crd-spinner--dark" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }} />}
              </div>
              {results.length > 0 && (
                <div className="crd-detail-items">
                  {results.map(c => (
                    <button key={c.customer_id} type="button" className="crd-card" style={{ padding: 10 }} onClick={() => pick(c)}>
                      <div className="crd-card__top">
                        <span className="crd-card__customer">{c.first_name} {c.last_name}</span>
                      </div>
                      <span className="crd-td-muted">Límite actual: {money(c.credit_limit)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {error && <div className="crd-alert"><i className="bi bi-exclamation-circle" /><span>{error}</span></div>}
              <div className="crd-detail__meta">
                <div><span className="crd-td-muted">Cliente</span><strong>{selected.first_name} {selected.last_name}</strong></div>
                <div><span className="crd-td-muted">Usado</span><strong>{money(selected.credit_balance)}</strong></div>
              </div>
              <div className="crd-field">
                <label className="crd-field__label">Nuevo límite</label>
                <input type="number" min="0" step="0.01" className="crd-field__input"
                  value={newLimit} onChange={e => setNewLimit(e.target.value)} autoFocus />
              </div>
            </>
          )}
        </div>

        <div className="crd-modal__footer">
          {done ? (
            <button className="crd-btn crd-btn--primary" style={{ flex: 1 }} onClick={onClose}>Listo</button>
          ) : selected ? (
            <>
              <button className="crd-btn crd-btn--ghost" onClick={() => setSelected(null)} disabled={isSaving}>Atrás</button>
              <button className="crd-btn crd-btn--primary" style={{ flex: 1 }} onClick={handleSave} disabled={isSaving}>
                {isSaving ? <span className="crd-spinner" /> : 'Guardar límite'}
              </button>
            </>
          ) : (
            <button className="crd-btn crd-btn--ghost" onClick={onClose}>Cancelar</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdjustLimitModal