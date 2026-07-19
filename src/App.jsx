import {
  Suspense,
  lazy,
  useEffect,
  useState,
} from 'react'
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import './App.css'
import {
  supabase,
  supabaseConfigError,
} from './lib/supabase'
import ErrorBoundary from './lib/ErrorBoundary'

// ─── Lazy load semua halaman ────────────────────────────────
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const BinToBinPage = lazy(() => import('./pages/BinToBinPage'))
const StockCountPage = lazy(() => import('./pages/StockCountPage'))
const HandoverPage = lazy(() => import('./pages/HandoverPage'))
const ScanPackPage = lazy(() => import('./pages/ScanPackPage'))
const ScanPackHistoryPage = lazy(() => import('./pages/ScanPackHistoryPage'))
const CancelledShipmentsPage = lazy(() => import('./pages/CancelledShipmentsPage'))
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'))
const MasterEkspedisiPage = lazy(() => import('./pages/MasterEkspedisiPage'))

// ─── Loading fallback ────────────────────────────────────────
function PageLoading({ message = 'Memuat halaman...' }) {
  return (
    <main className="page-center">
      <section className="message-card">
        <div className="spinner" />
        <p>{message}</p>
      </section>
    </main>
  )
}

// ─── Guard: harus login ──────────────────────────────────────
function RequireAuth({ session, initializing, children }) {
  if (initializing) {
    return <PageLoading message="Memuat BCL Warehouse WMS..." />
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return children
}

// ─── Guard: harus role tertentu ─────────────────────────────
function RequireRole({ profile, allowedRoles, children }) {
  if (!profile) {
    return <PageLoading message="Memuat profil..." />
  }

  const hasRole = allowedRoles.includes(profile.role) && profile.is_active === true

  if (!hasRole) {
    return <Navigate to="/" replace />
  }

  return children
}

// ─── Guard: sudah login → redirect ke dashboard ─────────────
function RedirectIfLoggedIn({ session, initializing, children }) {
  if (initializing) {
    return <PageLoading message="Memuat BCL Warehouse WMS..." />
  }

  if (session) {
    return <Navigate to="/" replace />
  }

  return children
}

// ─── Halaman Login ───────────────────────────────────────────
function LoginPage({ onLogin, loading, error }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = (event) => {
    event.preventDefault()
    onLogin(email, password)
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="logo-box">BC</div>

        <h1>BCL Warehouse WMS</h1>

        <p className="subtitle">
          Login untuk membuka dashboard warehouse
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>

          <input
            id="email"
            type="email"
            value={email}
            placeholder="nama@email.com"
            autoComplete="email"
            disabled={loading}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label htmlFor="password">Password</label>

          <div className="password-wrapper">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              placeholder="Masukkan password"
              autoComplete="current-password"
              disabled={loading}
              onChange={(event) => setPassword(event.target.value)}
            />

            <button
              className="show-password"
              type="button"
              onClick={() => setShowPassword((c) => !c)}
            >
              {showPassword ? 'Sembunyikan' : 'Lihat'}
            </button>
          </div>

          {error ? (
            <div className="error-message">{error}</div>
          ) : null}

          <button
            className="primary-button"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Memproses...' : 'Login'}
          </button>
        </form>

        <p className="version">BCL Warehouse WMS v1.0</p>
      </section>
    </main>
  )
}

// ─── Inner App (pakai hooks router) ─────────────────────────
function AppRoutes({ session, initializing, profile, profileLoading }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  const isAdmin =
    profile?.role === 'admin' && profile?.is_active === true

  const isAdminOrWarehouse =
    (profile?.role === 'admin' || profile?.role === 'admin_warehouse') &&
    profile?.is_active === true

  const handleLogin = async (email, password) => {
    if (!email.trim()) {
      setLoginError('Email wajib diisi.')
      return
    }

    if (!password) {
      setLoginError('Password wajib diisi.')
      return
    }

    setLoading(true)
    setLoginError('')

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (loginError) {
      const msg = loginError.message.toLowerCase()
      setLoginError(
        msg.includes('invalid login credentials')
          ? 'Email atau password salah.'
          : loginError.message,
      )
    }

    setLoading(false)
  }

  const handleLogout = async () => {
    setLoading(true)
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
    setLoading(false)
  }

  const commonProps = {
    session,
    loadingLogout: loading,
    onLogout: handleLogout,
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          {/* ── Login ── */}
          <Route
            path="/login"
            element={
              <RedirectIfLoggedIn
                session={session}
                initializing={initializing}
              >
                <LoginPage
                  onLogin={handleLogin}
                  loading={loading}
                  error={loginError}
                />
              </RedirectIfLoggedIn>
            }
          />

          {/* ── Dashboard ── */}
          <Route
            path="/"
            element={
              <RequireAuth session={session} initializing={initializing}>
                <DashboardPage
                  session={session}
                  loading={loading}
                  profile={profile}
                  profileLoading={profileLoading}
                  isAdmin={isAdmin}
                  isAdminOrWarehouse={isAdminOrWarehouse}
                  onLogout={handleLogout}
                  onOpenBinToBin={() => navigate('/bin-to-bin')}
                  onOpenStockCount={() => navigate('/stock-count')}
                  onOpenHandover={() => navigate('/handover')}
                  onOpenScanPack={() => navigate('/scan-pack')}
                  onOpenUserManagement={() => navigate('/user-management')}
                  onOpenMasterEkspedisi={() => navigate('/master-ekspedisi')}
                />
              </RequireAuth>
            }
          />

          {/* ── Bin to Bin ── */}
          <Route
            path="/bin-to-bin"
            element={
              <RequireAuth session={session} initializing={initializing}>
                <BinToBinPage
                  {...commonProps}
                  onBack={() => navigate('/')}
                />
              </RequireAuth>
            }
          />

          {/* ── Stock Count ── */}
          <Route
            path="/stock-count"
            element={
              <RequireAuth session={session} initializing={initializing}>
                <StockCountPage
                  {...commonProps}
                  onBack={() => navigate('/')}
                />
              </RequireAuth>
            }
          />

          {/* ── Handover ── */}
          <Route
            path="/handover"
            element={
              <RequireAuth session={session} initializing={initializing}>
                <HandoverPage
                  {...commonProps}
                  onBack={() => navigate('/')}
                />
              </RequireAuth>
            }
          />

          {/* ── Scan Pack ── */}
          <Route
            path="/scan-pack"
            element={
              <RequireAuth session={session} initializing={initializing}>
                <ScanPackPage
                  {...commonProps}
                  onBack={() => navigate('/')}
                  onOpenHistory={() => navigate('/scan-pack/history')}
                  onOpenCancelledShipments={() =>
                    navigate('/scan-pack/cancelled')
                  }
                />
              </RequireAuth>
            }
          />

          {/* ── Scan Pack History ── */}
          <Route
            path="/scan-pack/history"
            element={
              <RequireAuth session={session} initializing={initializing}>
                <ScanPackHistoryPage
                  {...commonProps}
                  onBack={() => navigate('/scan-pack')}
                />
              </RequireAuth>
            }
          />

          {/* ── Cancelled Shipments ── */}
          <Route
            path="/scan-pack/cancelled"
            element={
              <RequireAuth session={session} initializing={initializing}>
                <CancelledShipmentsPage
                  loadingLogout={loading}
                  onBack={() => navigate('/scan-pack')}
                  onLogout={handleLogout}
                />
              </RequireAuth>
            }
          />

          {/* ── User Management (Admin only) ── */}
          <Route
            path="/user-management"
            element={
              <RequireAuth session={session} initializing={initializing}>
                <RequireRole
                  profile={profile}
                  allowedRoles={['admin']}
                >
                  <UserManagementPage
                    profile={profile}
                    loadingLogout={loading}
                    onBack={() => navigate('/')}
                    onLogout={handleLogout}
                  />
                </RequireRole>
              </RequireAuth>
            }
          />

          {/* ── Master Ekspedisi (Admin + Admin Warehouse) ── */}
          <Route
            path="/master-ekspedisi"
            element={
              <RequireAuth session={session} initializing={initializing}>
                <RequireRole
                  profile={profile}
                  allowedRoles={['admin', 'admin_warehouse']}
                >
                  <MasterEkspedisiPage
                    profile={profile}
                    loadingLogout={loading}
                    onBack={() => navigate('/')}
                    onLogout={handleLogout}
                  />
                </RequireRole>
              </RequireAuth>
            }
          />

          {/* ── 404 → redirect ke dashboard ── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

// ─── Root App ────────────────────────────────────────────────
function App() {
  const [session, setSession] = useState(null)
  const [initializing, setInitializing] = useState(true)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)

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
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (active) {
        setSession(currentSession)
        setInitializing(false)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true

    const loadProfile = async () => {
      if (!session?.user?.id || !supabase) {
        if (active) {
          setProfile(null)
          setProfileLoading(false)
        }
        return
      }

      setProfileLoading(true)

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          full_name,
          role,
          is_active,
          warehouse_id
        `)
        .eq('id', session.user.id)
        .maybeSingle()

      if (!active) return

      if (profileError) {
        console.error('Gagal memuat profile:', profileError)
        setProfile(null)
      } else {
        setProfile(data)
      }

      setProfileLoading(false)
    }

    loadProfile()

    return () => {
      active = false
    }
  }, [session])

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

  return (
    <HashRouter>
      <AppRoutes
        session={session}
        initializing={initializing}
        profile={profile}
        profileLoading={profileLoading}
      />
    </HashRouter>
  )
}

export default App
