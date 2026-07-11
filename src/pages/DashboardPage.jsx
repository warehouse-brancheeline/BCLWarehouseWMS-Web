function DashboardPage({
  session,
  loading,
  error,
  onLogout,
  onOpenBinToBin,
  onOpenStockCount,
}) {
  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="small-label">
            BCL Warehouse WMS
          </p>

          <h1>
            Dashboard Warehouse
          </h1>
        </div>

        <button
          className="secondary-button"
          type="button"
          disabled={loading}
          onClick={onLogout}
        >
          {loading
            ? 'Keluar...'
            : 'Logout'}
        </button>
      </header>

      <section className="dashboard-content">
        <article className="welcome-card">
          <p>Login berhasil</p>
          <h2>{session.user.email}</h2>
        </article>

        <div className="menu-grid">
          <button
            className="menu-card menu-card-button"
            type="button"
            onClick={onOpenBinToBin}
          >
            <div className="menu-icon">
              BT
            </div>

            <h3>Bin to Bin</h3>

            <p>
              Lihat riwayat perpindahan stok
              antar lokasi.
            </p>
          </button>

          <button
            className="menu-card menu-card-button"
            type="button"
            onClick={onOpenStockCount}
          >
            <div className="menu-icon">
              SC
            </div>

            <h3>Stock Count</h3>

            <p>
              Lihat hasil perhitungan fisik
              dan selisih stok.
            </p>
          </button>
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

export default DashboardPage
