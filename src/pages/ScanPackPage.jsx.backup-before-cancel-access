import ScanPackHistoryPage from './ScanPackHistoryPage'
import './ScanPackPage.css'

function ScanPackPage({
  session,
  isAdmin,
  loadingLogout,
  onBack,
  onOpenCancelledShipments,
  onLogout,
}) {
  return (
    <div className="scan-pack-history-entry">
      {isAdmin ? (
        <div className="scan-pack-history-admin-bar">
          <div>
            <p className="scan-pack-history-admin-label">
              ADMIN SCAN PACK
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
      ) : null}

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
