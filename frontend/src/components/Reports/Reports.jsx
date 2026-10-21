// src/components/Reports/Reports.jsx
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useUser } from '../../context/UserContext'
import CashSessionsTab from './tabs/CashSessionsTab'
import ProfitTab from './tabs/ProfitTab'
import { getVisibleReportTabs } from './reportTabs'
import './reports.css'

// Contenido de cada pestaña de reportTabs.js
const TAB_CONTENT = {
  'cash-sessions': CashSessionsTab,
  profit:          ProfitTab,
}

const Reports = () => {
  const { hasPermission } = useUser()
  const tabs = getVisibleReportTabs(hasPermission)
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? null)

  // Igual que el Dashboard sin dashboard.read: sin ningún permiso de
  // reportes se manda al inicio
  if (tabs.length === 0) return <Navigate to="/" replace />

  const currentTab = tabs.some(tab => tab.id === activeTab) ? activeTab : tabs[0].id
  const Content = TAB_CONTENT[currentTab]

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
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={currentTab === tab.id}
            className={`rpt-tab ${currentTab === tab.id ? 'rpt-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <i className={`bi ${tab.icon}`} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Contenido ── */}
      <div className="rpt-tab-content">
        <Content />
      </div>
    </div>
  )
}

export default Reports
