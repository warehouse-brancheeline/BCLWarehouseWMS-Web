import { useEffect, useState } from 'react'
import './App.css'
import {
  supabase,
  supabaseConfigError,
} from './lib/supabase'

function App() {
  const [session, setSession] = useState(null)
  const [initializing, setInitializing] =
    useState(true)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] =
    useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) {
      setInitializing(false)
      return
    }

    let active = true

    const restoreSession = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession()

      if (active) {
        setSession(currentSession)
        setInitializing(false)
      }
    }

    restoreSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        if (active) {
          setSession(currentSession)
          setInitializing(false)
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
      setError('Password wajib diisi.')
      return
    }

    setLoading(true)
    setError('')

    const { error: loginError } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

    if (loginError) {
      const errorMessage =
        loginError.message.toLowerCase()

      if (
        errorMessage.includes(
          'invalid login credentials',
        )
      ) {
        setError('Email atau password salah.')
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
    }

    setLoading(false)
  }

  if (supabaseConfigError) {
    return (
      <main className="page-center">
        <section className="message-card">
          <h1>Konfigurasi Belum Lengkap</h1>
          <p>{supabaseConfigError}</p>
        </section>
      </main>
    )
  }

  if (initializing) {
    return (
      <main className="page-center">
        <section className="message-card">
          <div className="spinner" />
          <p>Memuat BCL Warehouse WMS...</p>
        </section>
      </main>
    )
  }

  if (session) {
    return (
      <main className="dashboard-page">
        <header className="dashboard-header">
          <div>
            <p className="small-label">
              BCL Warehouse WMS
            </p>
            <h1>Dashboard Warehouse</h1>
          </div>

          <button
            className="secondary-button"
            type="button"
            disabled={loading}
            onClick={handleLogout}
          >
            {loading ? 'Keluar...' : 'Logout'}
          </button>
        </header>

        <section className="dashboard-content">
          <article className="welcome-card">
            <p>Login berhasil</p>
            <h2>{session.user.email}</h2>
          </article>

          <div className="menu-grid">
            <article className="menu-card">
              <div className="menu-icon">BT</div>
              <h3>Bin to Bin</h3>
              <p>
                Riwayat perpindahan stok antar
                lokasi.
              </p>
            </article>

            <article className="menu-card">
              <div className="menu-icon">SC</div>
              <h3>Stock Count</h3>
              <p>
                Hasil perhitungan dan selisih stok.
              </p>
            </article>
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </section>
      </main>
    )
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="logo-box">BC</div>

        <h1>BCL Warehouse WMS</h1>

        <p className="subtitle">
          Login untuk membuka dashboard warehouse
        </p>

        <form onSubmit={handleLogin}>
          <label htmlFor="email">Email</label>

          <input
            id="email"
            type="email"
            value={email}
            placeholder="nama@email.com"
            autoComplete="email"
            disabled={loading}
            onChange={(event) =>
              setEmail(event.target.value)
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
                setPassword(event.target.value)
              }
            />

            <button
              className="show-password"
              type="button"
              onClick={() =>
                setShowPassword(
                  (current) => !current,
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
