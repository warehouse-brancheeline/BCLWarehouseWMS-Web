import {
  useEffect,
  useState,
} from 'react'
import './App.css'
import {
  supabase,
  supabaseConfigError,
} from './lib/supabase'
import BinToBinPage from './pages/BinToBinPage'
import DashboardPage from './pages/DashboardPage'
import StockCountPage from './pages/StockCountPage'

function App() {
  const [session, setSession] =
    useState(null)

  const [initializing, setInitializing] =
    useState(true)

  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [
    showPassword,
    setShowPassword,
  ] = useState(false)

  const [loading, setLoading] =
    useState(false)

  const [error, setError] =
    useState('')

  const [
    currentPage,
    setCurrentPage,
  ] = useState('dashboard')

  useEffect(() => {
    if (!supabase) {
      setInitializing(false)
      return
    }

    let active = true

    const restoreSession = async () => {
      const {
        data: {
          session: currentSession,
        },
      } =
        await supabase.auth.getSession()

      if (active) {
        setSession(currentSession)
        setInitializing(false)
      }
    }

    restoreSession()

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (_event, currentSession) => {
          if (active) {
            setSession(currentSession)
            setInitializing(false)

            if (!currentSession) {
              setCurrentPage(
                'dashboard',
              )
            }
          }
        },
      )

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const handleLogin = async (event) => {
    event.preventDefault()

    if (!email.trim()) {
      setError('Email wajib diisi.')
      return
    }

    if (!password) {
      setError(
        'Password wajib diisi.',
      )
      return
    }

    setLoading(true)
    setError('')

    const { error: loginError } =
      await supabase.auth
        .signInWithPassword({
          email: email.trim(),
          password,
        })

    if (loginError) {
      const errorMessage =
        loginError.message
          .toLowerCase()

      if (
        errorMessage.includes(
          'invalid login credentials',
        )
      ) {
        setError(
          'Email atau password salah.',
        )
      } else {
        setError(loginError.message)
      }
    }

    setLoading(false)
  }

  const handleLogout = async () => {
    setLoading(true)
    setError('')

    const { error: logoutError } =
      await supabase.auth.signOut()

    if (logoutError) {
      setError('Logout gagal.')
    } else {
      setCurrentPage('dashboard')
    }

    setLoading(false)
  }

  if (supabaseConfigError) {
    return (
      <main className="page-center">
        <section className="message-card">
          <h1>
            Konfigurasi Belum Lengkap
          </h1>

          <p>
            {supabaseConfigError}
          </p>
        </section>
      </main>
    )
  }

  if (initializing) {
    return (
      <main className="page-center">
        <section className="message-card">
          <div className="spinner" />

          <p>
            Memuat BCL Warehouse WMS...
          </p>
        </section>
      </main>
    )
  }

  if (session) {
    if (
      currentPage === 'bin-to-bin'
    ) {
      return (
        <BinToBinPage
          session={session}
          loadingLogout={loading}
          onBack={() =>
            setCurrentPage(
              'dashboard',
            )
          }
          onLogout={handleLogout}
        />
      )
    }

    if (
      currentPage === 'stock-count'
    ) {
      return (
        <StockCountPage
          session={session}
          loadingLogout={loading}
          onBack={() =>
            setCurrentPage(
              'dashboard',
            )
          }
          onLogout={handleLogout}
        />
      )
    }

    return (
      <DashboardPage
        session={session}
        loading={loading}
        error={error}
        onLogout={handleLogout}
        onOpenBinToBin={() =>
          setCurrentPage(
            'bin-to-bin',
          )
        }
        onOpenStockCount={() =>
          setCurrentPage(
            'stock-count',
          )
        }
      />
    )
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="logo-box">
          BC
        </div>

        <h1>
          BCL Warehouse WMS
        </h1>

        <p className="subtitle">
          Login untuk membuka dashboard
          warehouse
        </p>

        <form onSubmit={handleLogin}>
          <label htmlFor="email">
            Email
          </label>

          <input
            id="email"
            type="email"
            value={email}
            placeholder="nama@email.com"
            autoComplete="email"
            disabled={loading}
            onChange={(event) =>
              setEmail(
                event.target.value,
              )
            }
          />

          <label htmlFor="password">
            Password
          </label>

          <div className="password-wrapper">
            <input
              id="password"
              type={
                showPassword
                  ? 'text'
                  : 'password'
              }
              value={password}
              placeholder="Masukkan password"
              autoComplete="current-password"
              disabled={loading}
              onChange={(event) =>
                setPassword(
                  event.target.value,
                )
              }
            />

            <button
              className="show-password"
              type="button"
              onClick={() =>
                setShowPassword(
                  (current) =>
                    !current,
                )
              }
            >
              {showPassword
                ? 'Sembunyikan'
                : 'Lihat'}
            </button>
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            className="primary-button"
            type="submit"
            disabled={loading}
          >
            {loading
              ? 'Memproses...'
              : 'Login'}
          </button>
        </form>

        <p className="version">
          BCL Warehouse WMS v1.0
        </p>
      </section>
    </main>
  )
}

export default App
