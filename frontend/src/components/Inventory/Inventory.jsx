// src/components/Inventory/Inventory.jsx
import { useState } from 'react'
import { useUser } from '../../context/UserContext'
import StockTab      from './tabs/StockTab'
import MovementsTab  from './tabs/MovementsTab'
import TransfersTab  from './tabs/TransfersTab'
import { useBranch } from '../../context/BranchContext'
import BranchGate    from '../Common/BranchGate'
import './inventory.css'


const Inventory = () => {
  const { hasPermission, isAdmin } = useUser()
  const {selectedBranch} = useBranch()

  const tabs = [
    { id: 'stock',     icon: 'bi-boxes',          label: 'Stock',       show: hasPermission('inventory', 'read')     },
    { id: 'movements', icon: 'bi-arrow-left-right',label: 'Movimientos', show: hasPermission('inventory', 'read')     },
    { id: 'transfers', icon: 'bi-shuffle',         label: 'Traspasos',   show: hasPermission('inventory', 'transfer') },
  ].filter(t => t.show)

  const [activeTab, setActiveTab] = useState(tabs[0]?.id)

  return (
    <BranchGate
      title="Selecciona una sucursal"
      description="El inventario de productos es diferente por sucursal."
    >
         <div className="inv-root">
      {/* ── Header ── */}
      <div className="inv-header">
        <div>
          <h1 className="inv-header__title">Inventario</h1>
          <span className="inv-header__sub">Gestión de stock y movimientos</span>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="inv-tabs" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`inv-tab ${activeTab === tab.id ? 'inv-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <i className={`bi ${tab.icon}`} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Contenido ── */}
      <div className="inv-content">
        {activeTab === 'stock'     && <StockTab     canAdjust={hasPermission('inventory', 'adjust')} isAdmin={isAdmin} branchId={selectedBranch?.branch_id}/>}
        {activeTab === 'movements' && <MovementsTab branchId={selectedBranch?.branch_id} />}
        {activeTab === 'transfers' && <TransfersTab isAdmin={isAdmin} branchId={selectedBranch?.branch_id} />}
      </div>
    </div>
    </BranchGate>
   
  )
}

export default Inventory