// src/components/Sales/Sales.jsx
import { useState } from 'react'
import SalesTab        from './tabs/SalesTab'
import SoldProductsTab from './tabs/SoldProductsTab'
import './orders.css'

const TABS = [
  { id: 'sales',         icon: 'bi-receipt',    label: 'Ventas' },
  { id: 'sold-products', icon: 'bi-bag-check',  label: 'Productos vendidos' },
]

// Contenedor de la sección Ventas — el estado de cada pestaña vive dentro
// de su propio componente (filtros, fechas, paginación no se comparten
// entre "Ventas" y "Productos vendidos" porque responden preguntas
// distintas: una lista órdenes, la otra agrega por producto).
const Orders = () => {
  const [activeTab, setActiveTab] = useState('sales')

  return (
    <div className="sls-root">
      {/* ── Header ── */}
      <div className="sls-header">
        <div>
          <h1 className="sls-header__title">Ventas</h1>
          <span className="sls-header__sub">Historial de ventas y productos vendidos</span>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="sls-tabs" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`sls-tab ${activeTab === tab.id ? 'sls-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <i className={`bi ${tab.icon}`} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Contenido ── */}
      <div className="sls-tab-content">
        {activeTab === 'sales'         && <SalesTab />}
        {activeTab === 'sold-products' && <SoldProductsTab />}
      </div>
    </div>
  )
}

export default Orders