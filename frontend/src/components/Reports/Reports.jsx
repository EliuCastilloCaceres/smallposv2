// src/components/Reports/Reports.jsx
import { useState } from 'react'
import CashSessionsTab from './tabs/CashSessionsTab'
import './reports.css'

const TABS = [
  { id: 'cash-sessions', icon: 'bi-cash-stack', label: 'Sesiones de caja' },
  // Próximas tabs del módulo: ventas, inventario, crédito/apartados,
  // devoluciones — se agregan aquí conforme se construyan.
]

const Reports = () => {
  const [activeTab, setActiveTab] = useState('cash-sessions')

  return (
    <div className="rpt-root">
      {/* ── Header ── */}
      <div className="rpt-header">
        <div>
          <h1 className="rpt-header__title">Reportes</h1>
          <span className="rpt-header__sub">Sesiones de caja, ventas e inventario</span>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="rpt-tabs" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`rpt-tab ${activeTab === tab.id ? 'rpt-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <i className={`bi ${tab.icon}`} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Contenido ── */}
      <div className="rpt-tab-content">
        {activeTab === 'cash-sessions' && <CashSessionsTab />}
      </div>
    </div>
  )
}

export default Reports
