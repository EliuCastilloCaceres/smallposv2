// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { UserContextProvider } from './Context/UserContext.jsx'
import { PosContextProvider }  from './Context/PosContext.jsx'
import {BranchContextProvider} from './context/BranchContext.jsx'
import App from './components/App.jsx'

import Login              from './components/Login/Login.jsx'
import Dashboard          from './components/Dashboard/Dashboard.jsx'
import Users              from './components/Users/Users'
import Settings           from './components/Settings/Settings.jsx'
import Customers          from './components/Customers/Customers.jsx'
import Layaways           from './components/Layaways/Layaways.jsx'
import Credits            from './components/Credits/Credits.jsx'
import Returns            from './components/Returns/Returns.jsx'
import Products           from './components/Products/Products.jsx'
import Inventory          from './components/Inventory/Inventory.jsx'
import Providers          from './components/Providers/Providers.jsx'
import Pos                from './components/Pos/Pos.jsx'
import Orders from './components/Orders/Orders.jsx'
// Módulos nuevos
//import Reports            from './components/Reports/Reports.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <UserContextProvider>
    <BranchContextProvider>
      {/* PosContext solo envuelve las rutas del POS para no contaminar el resto */}
      <BrowserRouter>
        <Routes>
          <Route path='/' element={<App />}>
            <Route path='pos'                             element={<Pos/>}/>
            <Route path='dashboard'                       element={<Dashboard />} />
            <Route path='orders'                       element={<Orders />} />
            <Route path='products'                        element={<Products/>}/>
            <Route path='inventory'                        element={<Inventory/>}/>
            <Route path='customers'                        element={<Customers/>}/>
            <Route path='layaways'                        element={<Layaways/>}/>
            <Route path='credits'                        element={<Credits/>}/>
            <Route path='returns'                        element={<Returns/>}/>
            <Route path='providers'                        element={<Providers/>}/>
            <Route path='users'                           element={<Users />} />
            <Route path='settings'                        element={<Settings/>}/>
            {/* Módulos nuevos */}
            {/* <Route path='layaways'                        element={<Layaways />} />
            <Route path='credits'                         element={<Credits />} />
            <Route path='reports'                         element={<Reports />} /> */}
          </Route>
          <Route path='/login'                            element={<Login />} />
        </Routes>
      </BrowserRouter>
      </BranchContextProvider>
    </UserContextProvider>
  </React.StrictMode>,
)
