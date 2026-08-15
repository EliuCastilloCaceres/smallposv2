// src/components/Home/Home.jsx
import { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useUser } from '../../Context/UserContext'
import './home.css'

const greetingWord = (hour) => {
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

// Vista de aterrizaje en "/". Si el usuario tiene permiso de ver el
// dashboard, se le manda directo ahí (misma URL/contenido, sin duplicar
// la lógica de Dashboard.jsx aquí). Si NO lo tiene — típicamente un
// cajero — en vez de una pantalla vacía o "sin acceso", ve un saludo,
// la hora, y un acceso directo a vender.
const Home = () => {
  const { user, hasPermission } = useUser()
  const navigate = useNavigate()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // if (hasPermission('dashboard', 'read')) {
  //   return <Navigate to="/dashboard" replace />
  // }

  const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="home-greeting">
      <span className="home-greeting__time">{timeStr}</span>
      <span className="home-greeting__date">{dateStr}</span>

      <h1 className="home-greeting__title">
        {greetingWord(now.getHours())}, {user.username}
      </h1>
      {user.branch_name && (
        <span className="home-greeting__branch">
          <i className="bi bi-shop" /> {user.branch_name}
        </span>
      )}

      <button className="home-greeting__btn" onClick={() => navigate('/pos')}>
        <i className="bi bi-cart-check" /> Vender
      </button>
    </div>
  )
}

export default Home
