import {
  Suspense,
  lazy,
  useEffect,
  useState,
} from 'react'
import './App.css'
import {
  supabase,
  supabaseConfigError,
} from './lib/supabase'

const BinToBinPage = lazy(() => import('./pages/BinToBinPage'))
const CancelledShipmentsPage = lazy(() => import('./pages/CancelledShipmentsPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const HandoverPage = lazy(() => import('./pages/HandoverPage'))
const ScanPackPage = lazy(() => import('./pages/ScanPackPage'))
const ScanPackHistoryPage = lazy(() => import('./pages/ScanPackHistoryPage'))
const StockCountPage = lazy(() => import('./pages/StockCountPage'))
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'))
const MasterEkspedisiPage = lazy(() => import('./pages/MasterEkspedisiPage'))

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

function App() {
  const [session, setSession] = useState(null)
  const [initializing, setInitializing] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState('dashboard')
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

        if (!currentSession) {
          setCurrentPage('dashboard')
        }
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

      if (!active) {
        return
      }

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

  const isAdmin =
    profile?.role === 'admin' &&
    profile?.is_active === true

  const isAdminOrWarehouse =
    (profile?.role === 'admin' ||
      profile?.role === 'admin_warehouse') &&
    profile?.is_active === true

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
      const errorMessage = loginError.message.toLowerCase()

      if (errorMessage.includes('invalid login credentials')) {
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
    } else {
      setCurrentPage('dashboard')
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
    return <PageLoading message="Memuat BCL Warehouse WMS..." />
  }

  if (session) {
    return (
      <Suspense fallback={<PageLoading message="Memuat halaman..." />}>
        {currentPage === 'bin-to-bin' ? (
          <BinToBinPage
            session={session}
            loadingLogout={loading}
            onBack={() => setCurrentPage('dashboard')}
            onLogout={handleLogout}
          />
        ) : currentPage === 'stock-count' ? (
          <StockCountPage
            session={session}
            loadingLogout={loading}
            onBack={() => setCurrentPage('dashboard')}
            onLogout={handleLogout}
          />
        ) : currentPage === 'scan-pack-history' ? (
          <ScanPackHistoryPage
            session={session}
            loadingLogout={loading}
            onBack={() => setCurrentPage('scan-pack')}
            onLogout={handleLogout}
          />
        ) : currentPage === 'cancelled-shipments' ? (
          <CancelledShipmentsPage
            loadingLogout={loading}
            onBack={() => setCurrentPage('scan-pack')}
            onLogout={handleLogout}
          />
        ) : currentPage === 'scan-pack' ? (
          <ScanPackPage
            session={session}
            loadingLogout={loading}
            onOpenHistory={() => setCurrentPage('scan-pack-history')}
            onOpenCancelledShipments={() => setCurrentPage('cancelled-shipments')}
            onBack={() => setCurrentPage('dashboard')}
            onLogout={handleLogout}
          />
        ) : currentPage === 'handover' ? (
          <HandoverPage
            session={session}
            loadingLogout={loading}
            onBack={() => setCurrentPage('dashboard')}
            onLogout={handleLogout}
          />
        ) : currentPage === 'user-management' && isAdmin ? (
          <UserManagementPage
            profile={profile}
            loadingLogout={loading}
            onBack={() => setCurrentPage('dashboard')}
            onLogout={handleLogout}
          />
        ) : currentPage === 'master-ekspedisi' && isAdminOrWarehouse ? (
          <MasterEkspedisiPage
            profile={profile}
            loadingLogout={loading}
            onBack={() => setCurrentPage('dashboard')}
            onLogout={handleLogout}
          />
        ) : (
          <DashboardPage
            session={session}
            loading={loading}
            error={error}
            profile={profile}
            profileLoading={profileLoading}
            isAdmin={isAdmin}
            isAdminOrWarehouse={isAdminOrWarehouse}
            onLogout={handleLogout}
            onOpenBinToBin={() => setCurrentPage('bin-to-bin')}
            onOpenStockCount={() => setCurrentPage('stock-count')}
            onOpenHandover={() => setCurrentPage('handover')}
            onOpenScanPack={() => setCurrentPage('scan-pack')}
            onOpenUserManagement={() => setCurrentPage('user-management')}
            onOpenMasterEkspedisi={() => setCurrentPage('master-ekspedisi')}
          />
        )}
      </Suspense>
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
              onClick={() => setShowPassword((current) => !current)}
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

export default App
