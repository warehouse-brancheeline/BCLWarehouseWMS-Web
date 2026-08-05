import ScanPackHistoryPage from './ScanPackHistoryPage'
import './ScanPackPage.css'

function ScanPackPage({
  session,
  loadingLogout,
  onBack,
  onOpenCancelledShipments,
  onLogout,
}) {
  return (
    <div className="scan-pack-history-entry">
      <div className="scan-pack-history-cancel-bar">
        <div>
          <p className="scan-pack-history-cancel-label">
            PEMBATALAN ORDER
          </p>

          <strong>
            Kelola Pembatalan Order
          </strong>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={onOpenCancelledShipments}
        >
          Catat Resi Batal
        </button>
      </div>

      <ScanPackHistoryPage
        session={session}
        loadingLogout={loadingLogout}
        onBack={onBack}
        onLogout={onLogout}
      />
    </div>
  )
}

export default ScanPackPage
