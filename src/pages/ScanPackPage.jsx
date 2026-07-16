import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  utils,
  writeFileXLSX,
} from 'xlsx'
import { supabase } from '../lib/supabase'
import './ScanPackPage.css'

function formatDate(value) {
  if (!value) return '-'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Makassar',
  }).format(date)
}

function getStatusLabel(status) {
  const value = String(status || '').toUpperCase()

  if (value === 'SUBMITTED') return 'Submitted'
  if (value === 'DRAFT') return 'Draft'

  return status || '-'
}

function getSourceLabel(source) {
  const value = String(source || '').toUpperCase()

  const labels = {
    MANUAL: 'Manual',
    CAMERA: 'Kamera',
    ZEBRA_DATAWEDGE: 'Zebra PDA',
    HARDWARE_KEYBOARD: 'Scanner Tangan',
  }

  return labels[value] || source || '-'
}

function ScanPackPage({
  session,
  isAdmin,
  loadingLogout,
  onBack,
  onOpenHistory,
  onOpenCancelledShipments,
  onLogout,
}) {
  const [sessions, setSessions] = useState([])
  const [selectedSessionId, setSelectedSessionId] =
    useState(null)

  const [search, setSearch] = useState('')
  const [detailSearch, setDetailSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cancelTarget, setCancelTarget] =
    useState(null)

  const [
    cancellingItemId,
    setCancellingItemId,
  ] = useState(null)

  const [cancelToast, setCancelToast] =
    useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [sessionResult, itemResult] =
        await Promise.all([
          supabase
            .from('scan_pack_sessions')
            .select('*')
            .order('created_at', {
              ascending: false,
            }),

          supabase
            .from('scan_pack_items')
            .select('*')
            .order('scan_sequence', {
              ascending: true,
            }),
        ])

      if (sessionResult.error) {
        throw sessionResult.error
      }

      if (itemResult.error) {
        throw itemResult.error
      }

      const itemsBySession = new Map()

      ;(itemResult.data ?? []).forEach((item) => {
        const sessionId = String(
          item.session_id || '',
        )

        if (!sessionId) return

        if (!itemsBySession.has(sessionId)) {
          itemsBySession.set(sessionId, [])
        }

        itemsBySession.get(sessionId).push(item)
      })

      const result = (sessionResult.data ?? []).map(
        (session) => ({
          ...session,
          items:
            itemsBySession.get(String(session.id)) ??
            [],
        }),
      )

      setSessions(result)
    } catch (loadError) {
      console.error(
        'Gagal memuat Scan Pack:',
        loadError,
      )

      setError(
        'Gagal memuat data Scan Pack.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!cancelToast) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setCancelToast('')
    }, 3000)

    return () =>
      window.clearTimeout(timer)
  }, [cancelToast])

  const filteredSessions = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) {
      return sessions
    }

    return sessions.filter((session) => {
      const sessionNumber = String(
        session.session_number || '',
      ).toLowerCase()

      const createdBy = String(
        session.created_by_name || '',
      ).toLowerCase()

      const trackingMatch =
        (session.items || []).some((item) =>
          String(item.tracking_number || '')
            .toLowerCase()
            .includes(keyword),
        )

      return (
        sessionNumber.includes(keyword) ||
        createdBy.includes(keyword) ||
        trackingMatch
      )
    })
  }, [search, sessions])

  const selectedSession = useMemo(() => {
    return sessions.find(
      (session) =>
        String(session.id) === selectedSessionId,
    ) || null
  }, [selectedSessionId, sessions])

  const filteredItems = useMemo(() => {
    if (!selectedSession) return []

    const keyword =
      detailSearch.trim().toLowerCase()

    if (!keyword) {
      return selectedSession.items || []
    }

    return (selectedSession.items || []).filter(
      (item) =>
        String(item.tracking_number || '')
          .toLowerCase()
          .includes(keyword),
    )
  }, [detailSearch, selectedSession])

  const summary = useMemo(() => {
    return {
      totalSessions: filteredSessions.length,
      totalPackages: filteredSessions.reduce(
        (total, session) =>
          total +
          Number(
            session.total_packages ||
            session.items?.length ||
            0,
          ),
        0,
      ),
      submitted: filteredSessions.filter(
        (session) =>
          String(session.status || '')
            .toUpperCase() === 'SUBMITTED',
      ).length,
      uniqueTracking: new Set(
        filteredSessions.flatMap((session) =>
          (session.items || []).map((item) =>
            String(
              item.normalized_tracking ||
              item.tracking_number ||
              '',
            ),
          ),
        ),
      ).size,
    }
  }, [filteredSessions])

  const downloadExcel = () => {
    const workbook = utils.book_new()

    const rows = filteredSessions.flatMap(
      (session) =>
        (session.items || []).map(
          (item, index) => ({
            'Nomor Session':
              session.session_number || '-',
            Status:
              getStatusLabel(session.status),
            'Dibuat Oleh':
              session.created_by_name || '-',
            'Waktu Submit':
              formatDate(
                session.submitted_at ||
                session.created_at,
              ),
            No:
              item.scan_sequence ||
              index + 1,
            'Nomor Resi':
              item.tracking_number || '-',
            'Sumber Scan':
              getSourceLabel(item.scan_source),
            'Waktu Scan':
              formatDate(item.scanned_at),
          }),
        ),
    )

    const sheet = utils.json_to_sheet(rows)

    utils.book_append_sheet(
      workbook,
      sheet,
      'Scan Pack',
    )

    writeFileXLSX(
      workbook,
      'Scan_Pack.xlsx',
    )
  }

  const getCurrentUserName = async () => {
    const fallback =
      session?.user?.user_metadata?.full_name ||
      session?.user?.user_metadata?.name ||
      session?.user?.email ||
      'User Warehouse'

    if (!session?.user?.id) {
      return fallback
    }

    const {
      data,
      error: profileError,
    } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', session.user.id)
      .maybeSingle()

    if (profileError) {
      console.error(
        'Gagal membaca profile user:',
        profileError,
      )

      return fallback
    }

    return (
      data?.full_name ||
      data?.email ||
      fallback
    )
  }

  const handleMarkCancelled = async () => {
    const item = cancelTarget

    if (!item?.id) {
      return
    }

    setCancellingItemId(
      String(item.id),
    )

    try {
      const userName =
        await getCurrentUserName()

      const {
        data,
        error: cancelError,
      } = await supabase.rpc(
        'mark_scan_pack_item_cancelled',
        {
          p_item_id: item.id,
          p_cancelled_by_name: userName,
        },
      )

      if (cancelError) {
        throw cancelError
      }

      const cancelledAt =
        data?.cancelled_at ||
        data?.cancelledAt ||
        new Date().toISOString()

      const cancelledByName =
        data?.cancelled_by_name ||
        data?.cancelledByName ||
        userName

      setSessions((currentSessions) =>
        currentSessions.map(
          (currentSession) => {
            if (
              String(currentSession.id) !==
              String(selectedSession.id)
            ) {
              return currentSession
            }

            return {
              ...currentSession,
              items: (
                currentSession.items || []
              ).map((currentItem) =>
                String(currentItem.id) ===
                String(item.id)
                  ? {
                      ...currentItem,
                      is_cancelled: true,
                      cancelled_at:
                        cancelledAt,
                      cancelled_by_name:
                        cancelledByName,
                    }
                  : currentItem,
              ),
            }
          },
        ),
      )

      setCancelTarget(null)

      setCancelToast(
        'Order berhasil ditandai cancel.',
      )
    } catch (cancelError) {
      console.error(
        'Gagal menandai order cancel:',
        cancelError,
      )

      setCancelToast(
        'Gagal menandai order cancel. Silakan coba kembali.',
      )
    } finally {
      setCancellingItemId(null)
    }
  }

  if (selectedSession) {
    return (
      <main className="scan-pack-page">
        <header className="scan-pack-header">
          <div>
            <p className="small-label">
              BCL Warehouse WMS
            </p>
            <h1>Detail Scan Pack</h1>
          </div>

          <div className="scan-pack-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setSelectedSessionId(null)
                setDetailSearch('')
              }}
            >
              Kembali
            </button>

            <button
              className="secondary-button"
              type="button"
              onClick={loadData}
            >
              Refresh
            </button>

            <button
              className="primary-button"
              type="button"
              onClick={downloadExcel}
            >
              Download Excel
            </button>

            <button
              className="secondary-button"
              type="button"
              disabled={loadingLogout}
              onClick={onLogout}
            >
              {loadingLogout
                ? 'Keluar...'
                : 'Logout'}
            </button>
          </div>
        </header>

        <section className="scan-pack-content">
          <div className="scan-pack-summary">
            <article className="scan-pack-card">
              <p>Nomor Session</p>
              <strong>
                {selectedSession.session_number || '-'}
              </strong>
            </article>

            <article className="scan-pack-card">
              <p>Total Paket</p>
              <strong>
                {selectedSession.total_packages ||
                  selectedSession.items?.length ||
                  0}
              </strong>
            </article>

            <article className="scan-pack-card">
              <p>Dibuat Oleh</p>
              <strong>
                {selectedSession.created_by_name || '-'}
              </strong>
            </article>

            <article className="scan-pack-card">
              <p>Status</p>
              <strong>
                {getStatusLabel(
                  selectedSession.status,
                )}
              </strong>
            </article>
          </div>

          <section className="scan-pack-panel">
            <div className="scan-pack-panel-header">
              <h2>
                Daftar Resi ({filteredItems.length})
              </h2>

              <input
                type="search"
                value={detailSearch}
                placeholder="Cari nomor resi..."
                onChange={(event) =>
                  setDetailSearch(
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="scan-pack-table-wrapper">
              <table className="scan-pack-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Nomor Resi</th>
                    <th>Sumber Scan</th>
                    <th>Waktu Scan</th>
                    <th>Status Order</th>
                    <th>Ditandai Oleh</th>
                    <th>Waktu Cancel</th>
                    <th>Aksi</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredItems.map(
                    (item, index) => (
                      <tr
                        className={
                          item.is_cancelled
                            ? 'scan-pack-cancelled-row'
                            : ''
                        }
                        key={item.id}
                      >
                        <td>
                          {item.scan_sequence ||
                            index + 1}
                        </td>
                        <td>
                          {item.tracking_number || '-'}
                        </td>
                        <td>
                          {getSourceLabel(
                            item.scan_source,
                          )}
                        </td>
                        <td>
                          {formatDate(
                            item.scanned_at,
                          )}
                        </td>

                        <td>
                          <span
                            className={
                              item.is_cancelled
                                ? 'scan-pack-order-badge scan-pack-order-cancelled'
                                : 'scan-pack-order-badge scan-pack-order-active'
                            }
                          >
                            {item.is_cancelled
                              ? 'ORDER CANCEL'
                              : 'ORDER AKTIF'}
                          </span>
                        </td>

                        <td>
                          {item.cancelled_by_name ||
                            '-'}
                        </td>

                        <td>
                          {formatDate(
                            item.cancelled_at,
                          )}
                        </td>

                        <td>
                          {!item.is_cancelled ? (
                            <button
                              className="scan-pack-cancel-button"
                              type="button"
                              disabled={
                                cancellingItemId ===
                                String(item.id)
                              }
                              onClick={() =>
                                setCancelTarget(item)
                              }
                            >
                              {cancellingItemId ===
                              String(item.id)
                                ? 'Memproses...'
                                : 'Tandai Cancel'}
                            </button>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>

        {cancelTarget ? (
          <div
            className="scan-pack-cancel-backdrop"
            role="presentation"
            onClick={() => {
              if (!cancellingItemId) {
                setCancelTarget(null)
              }
            }}
          >
            <section
              className="scan-pack-cancel-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="scan-pack-cancel-title"
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <h2 id="scan-pack-cancel-title">
                Tandai Order Cancel
              </h2>

              <p>
                Anda yakin ingin menandai order
                ini sebagai cancel?
              </p>

              <div className="scan-pack-cancel-reference">
                Nomor Resi:{' '}
                <strong>
                  {cancelTarget.tracking_number ||
                    '-'}
                </strong>
              </div>

              <div className="scan-pack-cancel-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={Boolean(
                    cancellingItemId,
                  )}
                  onClick={() =>
                    setCancelTarget(null)
                  }
                >
                  Tidak
                </button>

                <button
                  className="scan-pack-danger-button"
                  type="button"
                  disabled={Boolean(
                    cancellingItemId,
                  )}
                  onClick={handleMarkCancelled}
                >
                  {cancellingItemId
                    ? 'Memproses...'
                    : 'Ya'}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {cancelToast ? (
          <div className="scan-pack-toast">
            {cancelToast}
          </div>
        ) : null}
      </main>
    )
  }

  return (
    <main className="scan-pack-page">
      <header className="scan-pack-header">
        <div>
          <p className="small-label">
            BCL Warehouse WMS
          </p>
          <h1>Scan Pack</h1>
          <p className="scan-pack-subtitle">
            Monitoring paket yang telah selesai
            dipacking.
          </p>
        </div>

        <div className="scan-pack-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onBack}
          >
            Kembali
          </button>

          <button
            className="secondary-button"
            type="button"
            onClick={loadData}
            disabled={loading}
          >
            {loading ? 'Memuat...' : 'Refresh'}
          </button>

          {isAdmin ? (
            <button
              className="secondary-button"
              type="button"
              onClick={onOpenCancelledShipments}
            >
              Input Resi Cancel
            </button>
          ) : null}

          <button
            className="secondary-button"
            type="button"
            onClick={onOpenHistory}
          >
            History Packing
          </button>

          <button
            className="primary-button"
            type="button"
            onClick={downloadExcel}
            disabled={
              loading ||
              filteredSessions.length === 0
            }
          >
            Download Excel
          </button>

          <button
            className="secondary-button"
            type="button"
            disabled={loadingLogout}
            onClick={onLogout}
          >
            {loadingLogout
              ? 'Keluar...'
              : 'Logout'}
          </button>
        </div>
      </header>

      <section className="scan-pack-content">
        <div className="scan-pack-summary">
          <article className="scan-pack-card">
            <p>Total Session</p>
            <strong>{summary.totalSessions}</strong>
          </article>

          <article className="scan-pack-card">
            <p>Submitted</p>
            <strong>{summary.submitted}</strong>
          </article>

          <article className="scan-pack-card">
            <p>Total Paket</p>
            <strong>{summary.totalPackages}</strong>
          </article>

          <article className="scan-pack-card">
            <p>Resi Unik</p>
            <strong>{summary.uniqueTracking}</strong>
          </article>
        </div>

        <section className="scan-pack-panel">
          <div className="scan-pack-search-row">
            <input
              type="search"
              value={search}
              placeholder="Cari session, resi, atau staff..."
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />

            <button
              className="secondary-button"
              type="button"
              onClick={() => setSearch('')}
            >
              Reset
            </button>
          </div>
        </section>

        {error ? (
          <section className="scan-pack-message">
            <p>{error}</p>

            <button
              className="secondary-button"
              type="button"
              onClick={loadData}
            >
              Coba Lagi
            </button>
          </section>
        ) : null}

        {loading ? (
          <section className="scan-pack-message">
            <div className="spinner" />
            <p>Memuat data Scan Pack...</p>
          </section>
        ) : null}

        {!loading &&
        !error &&
        filteredSessions.length === 0 ? (
          <section className="scan-pack-message">
            Belum ada data Scan Pack.
          </section>
        ) : null}

        {!loading &&
        !error &&
        filteredSessions.length > 0 ? (
          <section className="scan-pack-panel">
            <div className="scan-pack-table-wrapper">
              <table className="scan-pack-table">
                <thead>
                  <tr>
                    <th>Nomor Session</th>
                    <th>Waktu Submit</th>
                    <th>Total Paket</th>
                    <th>Dibuat Oleh</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredSessions.map(
                    (session) => (
                      <tr key={session.id}>
                        <td>
                          <button
                            className="scan-pack-link"
                            type="button"
                            onClick={() =>
                              setSelectedSessionId(
                                String(
                                  session.id,
                                ),
                              )
                            }
                          >
                            {session.session_number ||
                              '-'}
                          </button>
                        </td>

                        <td>
                          {formatDate(
                            session.submitted_at ||
                            session.created_at,
                          )}
                        </td>

                        <td>
                          {session.total_packages ||
                            session.items?.length ||
                            0}
                        </td>

                        <td>
                          {session.created_by_name ||
                            '-'}
                        </td>

                        <td>
                          {getStatusLabel(
                            session.status,
                          )}
                        </td>

                        <td>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              setSelectedSessionId(
                                String(
                                  session.id,
                                ),
                              )
                            }
                          >
                            Detail
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  )
}

export default ScanPackPage