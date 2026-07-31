// src/components/Pos/modals/CustomerModal.jsx
// Cambiar el cliente del carrito activo. Muestra búsqueda + resumen de
// crédito del cliente seleccionado (límite, usado, disponible, estado,
// últimos abonos) usando /customers y /customers/:id/credits.

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePos } from '../../../Context/PosContext'
import api from '../../../services/api'

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const GENERIC_CUSTOMER = { customer_id: 1, first_name: 'Público', last_name: 'general' }

const CustomerModal = ({ onClose }) => {
  const { cart, setCustomer } = usePos()

  const [query,       setQuery]       = useState('')
  const [results,     setResults]     = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const searchTimer = useRef(null)

  const [selected,    setSelected]    = useState(null) // customer completo
  const [credits,     setCredits]     = useState([])
  const [loadingSel,  setLoadingSel]  = useState(false)
  const [error,       setError]       = useState(null)

  // Cargar el cliente actual del carrito al abrir (para mostrar su resumen ya)
  useEffect(() => {
    if (!cart.customerId) return
    loadCustomerDetail(cart.customerId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadCustomerDetail = async (customerId) => {
    setLoadingSel(true)
    setError(null)
    try {
      const [custRes, creditRes] = await Promise.all([
        api.get(`customers/${customerId}`),
        api.get(`customers/${customerId}/credits`).catch(() => ({ data: { data: [] } })),
      ])
      setSelected(custRes.data.data)
      setCredits(creditRes.data.data ?? [])
    } catch {
      setError('No se pudo cargar la información del cliente')
    } finally {
      setLoadingSel(false)
    }
  }

  const runSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return }
    setIsSearching(true)
    try {
      const { data } = await api.get('customers', { params: { search: q.trim(), is_active: true, limit: 10 } })
      setResults(data.data ?? [])
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleQueryChange = (val) => {
    setQuery(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => runSearch(val), 350)
  }

  const pickCustomer = (customer) => {
    setQuery('')
    setResults([])
    loadCustomerDetail(customer.customer_id)
  }

  const handleConfirm = () => {
    if (!selected) return
    setCustomer(selected.customer_id)
    onClose()
  }

  const available   = selected ? Number(selected.credit_limit) - Number(selected.credit_balance) : 0
  const hasOverdue   = credits.some(c => c.status === 'overdue')
  const isGeneric    = selected?.customer_id === GENERIC_CUSTOMER.customer_id

  return (
    <div className="pos-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pos-modal">
        <div className="pos-modal__header">
          <h3 className="pos-modal__title"><i className="bi bi-person-badge" /> Cliente</h3>
          <button className="pos-modal__close" onClick={onClose} aria-label="Cerrar"><i className="bi bi-x-lg" /></button>
        </div>

        <div className="pos-modal__body">
          {/* Buscador */}
          <div className="pos-search">
            <i className="bi bi-search pos-search__icon" />
            <input
              type="text" className="pos-search__input"
              placeholder="Buscar por nombre, teléfono, email..."
              value={query} onChange={e => handleQueryChange(e.target.value)}
              autoFocus
            />
            {isSearching && <span className="pos-spinner pos-spinner--dark" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }} />}
          </div>

          {/* Resultados de búsqueda */}
          {results.length > 0 && (
            <div className="pos-customer-results">
              <button type="button" className="pos-customer-result" onClick={() => pickCustomer(GENERIC_CUSTOMER)}>
                <i className="bi bi-people" />
                <span>Público general</span>
              </button>
              {results.map(c => (
                <button key={c.customer_id} type="button" className="pos-customer-result" onClick={() => pickCustomer(c)}>
                  <i className="bi bi-person" />
                  <div>
                    <span className="pos-customer-result__name">{c.first_name} {c.last_name}</span>
                    {c.phone_number && <span className="pos-customer-result__meta">{c.phone_number}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {!query && results.length === 0 && (
            <button type="button" className="pos-btn pos-btn--ghost pos-btn--block" onClick={() => pickCustomer(GENERIC_CUSTOMER)}>
              <i className="bi bi-people" /> Usar público general
            </button>
          )}

          {error && (
            <div className="pos-alert pos-alert--error"><i className="bi bi-exclamation-circle" /><span>{error}</span></div>
          )}

          {/* Resumen del cliente seleccionado */}
          {loadingSel ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--pos-muted)', fontSize: 13 }}>
              <span className="pos-spinner pos-spinner--dark" /> Cargando cliente...
            </div>
          ) : selected && (
            <div className="pos-customer-card">
              <div className="pos-customer-card__header">
                <div>
                  <span className="pos-customer-card__name">{selected.first_name} {selected.last_name}</span>
                  {selected.phone_number && <span className="pos-customer-card__phone">{selected.phone_number}</span>}
                </div>
                {!isGeneric && (
                  <span className={`pos-badge ${hasOverdue ? 'pos-badge--closed' : 'pos-badge--open'}`}>
                    {hasOverdue ? 'Crédito vencido' : 'Al día'}
                  </span>
                )}
              </div>

              {!isGeneric && (
                <>
                  <div className="pos-customer-card__credit">
                    <div><span>Límite</span><strong>{money(selected.credit_limit)}</strong></div>
                    <div><span>Usado</span><strong>{money(selected.credit_balance)}</strong></div>
                    <div><span>Disponible</span><strong className={available > 0 ? 'pos-mov--in' : 'pos-mov--out'}>{money(available)}</strong></div>
                  </div>

                  {credits.length > 0 && (
                    <div className="pos-customer-card__history">
                      <span className="pos-customer-card__history-title">Créditos recientes</span>
                      {credits.slice(0, 3).map(c => (
                        <div key={c.credit_sale_id} className="pos-customer-card__history-row">
                          <span>{new Date(c.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</span>
                          <span>{money(c.balance)} pendiente</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="pos-modal__footer">
          <button type="button" className="pos-btn pos-btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="pos-btn pos-btn--primary" onClick={handleConfirm} disabled={!selected}>
            <i className="bi bi-check-lg" /> Usar este cliente
          </button>
        </div>
      </div>
    </div>
  )
}

export default CustomerModal
