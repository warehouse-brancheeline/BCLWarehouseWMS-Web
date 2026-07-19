// ============================================================
// BCL Warehouse WMS - DashboardPage
// FIX:
// - isAdmin dan isAdminOrWarehouse sekarang diterima dari App.jsx
// - Tambah menu Master Ekspedisi untuk admin dan admin_warehouse
// ============================================================

function DashboardPage({
  session,
  loading,
  error,
  profile,
  profileLoading,
  isAdmin,
  isAdminOrWarehouse,
  onLogout,
  onOpenBinToBin,
  onOpenStockCount,
  onOpenHandover,
  onOpenScanPack,
  onOpenUserManagement,
  onOpenMasterEkspedisi,
}) {
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
          onClick={onLogout}
        >
          {loading ? 'Keluar...' : 'Logout'}
        </button>
      </header>

      <section className="dashboard-content">
        <article className="welcome-card">
          <p>Login berhasil</p>

          <h2>
            {profileLoading
              ? 'Memuat profil...'
              : profile?.full_name || session.user.email}
          </h2>

          {profile?.full_name ? (
            <p>{session.user.email}</p>
          ) : null}
        </article>

        <div className="menu-grid">
          {/* ── Menu untuk semua user ── */}
          <button
            className="menu-card menu-card-button"
            type="button"
            onClick={onOpenBinToBin}
          >
            <div className="menu-icon">BT</div>
            <h3>Bin to Bin</h3>
            <p>Lihat riwayat perpindahan stok antar lokasi.</p>
          </button>

          <button
            className="menu-card menu-card-button"
            type="button"
            onClick={onOpenStockCount}
          >
            <div className="menu-icon">SC</div>
            <h3>Stock Count</h3>
            <p>Lihat hasil perhitungan fisik dan selisih stok.</p>
          </button>

          <button
            className="menu-card menu-card-button"
            type="button"
            onClick={onOpenHandover}
          >
            <div className="menu-icon">HD</div>
            <h3>Handover</h3>
            <p>Pantau serah terima paket kepada kurir.</p>
          </button>

          <button
            className="menu-card menu-card-button"
            type="button"
            onClick={onOpenScanPack}
          >
            <div className="menu-icon">SP</div>
            <h3>Scan Pack</h3>
            <p>Pantau paket yang telah selesai dipacking.</p>
          </button>

          {/* ── Menu khusus Admin & Admin Warehouse ── */}
          {isAdminOrWarehouse ? (
            <button
              className="menu-card menu-card-button"
              type="button"
              onClick={onOpenMasterEkspedisi}
            >
              <div className="menu-icon">ME</div>
              <h3>Master Ekspedisi</h3>
              <p>Kelola rule prefix dan format resi ekspedisi.</p>
            </button>
          ) : null}

          {/* ── Menu khusus Admin saja ── */}
          {isAdmin ? (
            <button
              className="menu-card menu-card-button"
              type="button"
              onClick={onOpenUserManagement}
            >
              <div className="menu-icon">UM</div>
              <h3>Manajemen User</h3>
              <p>Daftarkan dan lihat akun pengguna WMS.</p>
            </button>
          ) : null}
        </div>

        {error && (
          <div className="error-message">{error}</div>
        )}
      </section>
    </main>
  )
}

export default DashboardPage
