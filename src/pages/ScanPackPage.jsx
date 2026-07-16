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
            ORDER CANCEL
          </p>

          <strong>
            Pengelolaan Order Cancel
          </strong>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={onOpenCancelledShipments}
        >
          Input Resi Cancel
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
