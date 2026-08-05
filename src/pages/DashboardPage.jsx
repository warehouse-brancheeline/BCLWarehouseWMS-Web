// ============================================================
// BCL Warehouse WMS - DashboardPage
// FIX:
// - isAdmin dan isAdminOrWarehouse sekarang diterima dari App.jsx
// - Tambah menu Master Ekspedisi untuk admin dan admin_warehouse
// ============================================================

import {
  BinTransferIcon,
  ClipboardCheckIcon,
  TruckIcon,
  PackageIcon,
  SlidersIcon,
  ScanIcon,
  UsersIcon,
} from '../components/MenuIcons'

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
  onOpenReleaseOrderLog,
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
            <div className="menu-icon"><BinTransferIcon /></div>
            <h3>Bin Transfer</h3>
            <p>Pantau riwayat perpindahan stok antar lokasi secara real-time.</p>
          </button>

          <button
            className="menu-card menu-card-button"
            type="button"
            onClick={onOpenStockCount}
          >
            <div className="menu-icon"><ClipboardCheckIcon /></div>
            <h3>Stock Opname</h3>
            <p>Tinjau hasil perhitungan fisik dan selisih stok gudang.</p>
          </button>

          <button
            className="menu-card menu-card-button"
            type="button"
            onClick={onOpenHandover}
          >
            <div className="menu-icon"><TruckIcon /></div>
            <h3>Handover Kurir</h3>
            <p>Monitor serah terima paket ke setiap mitra ekspedisi.</p>
          </button>

          <button
            className="menu-card menu-card-button"
            type="button"
            onClick={onOpenScanPack}
          >
            <div className="menu-icon"><PackageIcon /></div>
            <h3>Packing Station</h3>
            <p>Lacak progres paket yang telah selesai di-packing.</p>
          </button>

          {/* ── Menu khusus Admin & Admin Warehouse ── */}
          {isAdminOrWarehouse ? (
            <button
              className="menu-card menu-card-button"
              type="button"
              onClick={onOpenMasterEkspedisi}
            >
              <div className="menu-icon"><SlidersIcon /></div>
              <h3>Konfigurasi Ekspedisi</h3>
              <p>Atur aturan prefix dan format resi tiap ekspedisi.</p>
            </button>
          ) : null}

          {/* ── Menu khusus Admin saja ── */}
          {isAdmin ? (
            <>
              <button
                className="menu-card menu-card-button"
                type="button"
                onClick={onOpenReleaseOrderLog}
              >
                <div className="menu-icon"><ScanIcon /></div>
                <h3>Release Scan</h3>
                <p>Scan validasi resi sebelum order diserahkan ke picker.</p>
              </button>
              <button
                className="menu-card menu-card-button"
                type="button"
                onClick={onOpenUserManagement}
              >
                <div className="menu-icon"><UsersIcon /></div>
                <h3>Tim &amp; Akses</h3>
                <p>Kelola akun dan hak akses pengguna sistem WMS.</p>
              </button>
            </>
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
