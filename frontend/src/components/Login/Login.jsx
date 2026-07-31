// src/components/Login.jsx
import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useUser } from '../../Context/UserContext'
import './login.css'

const Login = () => {
  const { login, user, isLoading } = useUser()
  const navigate = useNavigate()

  const [username,  setUsername]  = useState('')
  const [password,  setPassword]  = useState('')
  const [showPass,  setShowPass]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)

  // ─── Guards ────────────────────────────────────────────────────────────────
  // Mientras UserContext verifica el refresh token, mostrar el mismo spinner
  // que App.jsx para evitar que flashee el formulario de login.
  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="app-loading__spinner" />
      </div>
    )
  }

  // Si ya hay sesión activa, redirigir directo al dashboard.
  if (user) return <Navigate to="/dashboard" replace />

  // ──────────────────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return

    setLoading(true)
    setError(null)

    try {
      await login({ username: username.trim(), password })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message ?? 'Credenciales incorrectas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-root">
      {/* Panel decorativo – solo visible en desktop */}
      <aside className="login-aside" aria-hidden="true">
        <div className="login-aside__grid" />
        <div className="login-aside__content">
          <div className="login-aside__logo">
            <i className="login-aside__logo-icon ri-store-3-line" />
          </div>
          <h1 className="login-aside__headline">
            Small Pos V 2.0
          </h1>
          <h1 className="login-aside__headline">
            Tu punto de<br />venta, siempre<br />a la mano.
          </h1>
          <p className="login-aside__sub">
            Gestiona ventas, inventario y clientes desde un solo lugar.
          </p>
          <ul className="login-aside__pills" role="list">
            {['Ventas rápidas', 'Control de inventario', 'Reportes en tiempo real'].map(t => (
              <li key={t} className="login-aside__pill">
                <i className="ri-check-line" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Formulario */}
      <main className="login-main">
        <div className="login-card">
          {/* Logo móvil */}
          <div className="login-card__brand" aria-hidden="true">
            <i className="ri-store-3-line" />
          </div>

          <h2 className="login-card__title">Iniciar sesión</h2>
          <p className="login-card__sub">Ingresa tus credenciales para continuar</p>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {/* Usuario */}
            <div className="login-field">
              <label className="login-field__label" htmlFor="username">
                Usuario
              </label>
              <div className="login-field__wrap">
                <i className="login-field__icon ri-user-3-line" aria-hidden="true" />
                <input
                  id="username"
                  type="text"
                  className="login-field__input"
                  placeholder="nombre de usuario"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={e => { setUsername(e.target.value); setError(null) }}
                  disabled={loading}
                  aria-describedby={error ? 'login-error' : undefined}
                />
              </div>
            </div>

            {/* Contraseña */}
            <div className="login-field">
              <label className="login-field__label" htmlFor="password">
                Contraseña
              </label>
              <div className="login-field__wrap">
                <i className="login-field__icon ri-lock-2-line" aria-hidden="true" />
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  className="login-field__input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(null) }}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="login-field__toggle"
                  onClick={() => setShowPass(p => !p)}
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  tabIndex={0}
                >
                  <i className={showPass ? 'ri-eye-off-line' : 'ri-eye-line'} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="login-error" id="login-error" role="alert">
                <i className="ri-error-warning-line" aria-hidden="true" />
                {error}
              </div>
            )}

            {/* Botón */}
            <button
              type="submit"
              className="login-btn"
              disabled={loading || !username.trim() || !password.trim()}
            >
              {loading
                ? <><span className="login-btn__spinner" aria-hidden="true" /> Verificando...</>
                : 'Entrar'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}

export default Login