import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { supabase } from '../lib/supabase'
import { useCurrentUser } from '../lib/useCurrentUser'
import { formatDateLong, normalizeUpper } from '../lib/utils'
import {
  addJsonSheet,
  createWorkbook,
  downloadWorkbook,
} from '../lib/excel'
import './ScanPackHistoryPage.css'

function getSourceLabel(value) {
  const source = String(value || '').trim().toUpperCase()

  const labels = {
    MANUAL: 'Manual',
    CAMERA: 'Kamera',
    ZEBRA_DATAWEDGE: 'Zebra PDA',
    HARDWARE_KEYBOARD: 'Scanner Tangan',
  }

  return labels[source] || value || '-'
}

function ScanPackHistoryPage({
  session,
  loadingLogout,
  onBack,
  onLogout,
}) {
  const [tasks, setTasks] = useState([])
  const [selectedTask, setSelectedTask] = useState(null)
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [itemSearch, setItemSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [toast, setToast] = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancellingItemId, setCancellingItemId] = useState(null)
  const [downloading, setDownloading] = useState(false)

  const { getCurrentUserName } = useCurrentUser(session)

  const loadTasks = useCallback(async (searchValue = '') => {
    setLoading(true)
    setError('')

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_scan_pack_history_tasks',
        { p_search: searchValue.trim(), p_limit: 100 },
      )

      if (rpcError) throw rpcError
      setTasks(data ?? [])
    } catch (loadError) {
      console.error('Gagal memuat History Packing:', loadError)
      setError('Gagal memuat History Packing. Silakan coba kembali.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTaskItems = useCallback(async (task) => {
    if (!task?.session_id) return

    setDetailLoading(true)
    setDetailError('')

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_scan_pack_history_task_items',
        { p_session_id: task.session_id },
      )

      if (rpcError) throw rpcError
      setItems(data ?? [])
    } catch (loadError) {
      console.error('Gagal memuat detail History Packing:', loadError)
      setDetailError(
        'Gagal memuat detail Nomor Tugas. Silakan coba kembali.',
      )
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTasks('')
  }, [loadTasks])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(''), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const openTask = async (task) => {
    setSelectedTask(task)
    setItemSearch('')
    setItems([])
    await loadTaskItems(task)
  }

  const closeDetail = () => {
    setSelectedTask(null)
    setItems([])
    setItemSearch('')
    setDetailError('')
    loadTasks(search)
  }

  const handleSearch = async (event) => {
    event?.preventDefault()
    await loadTasks(search)
  }

  const handleReset = async () => {
    setSearch('')
    await loadTasks('')
  }

  const filteredItems = useMemo(() => {
    const keyword = normalizeUpper(itemSearch)
    if (!keyword) return items

    return items.filter((item) => {
      const tracking = normalizeUpper(item.tracking_number)
      const normalized = normalizeUpper(item.normalized_tracking)
      return tracking.includes(keyword) || normalized.includes(keyword)
    })
  }, [itemSearch, items])

  const detailSummary = useMemo(() => {
    const total = items.length
    const cancelled = items.filter((item) => item.is_cancelled === true).length
    return { total, active: total - cancelled, cancelled }
  }, [items])

  const handleMarkCancelled = async () => {
    const item = cancelTarget
    if (!item?.item_id) return

    setCancellingItemId(String(item.item_id))

    try {
      const cancelledByName = await getCurrentUserName()

      const { data, error: rpcError } = await supabase.rpc(
        'mark_scan_pack_item_cancelled',
        {
          p_item_id: item.item_id,
          p_cancelled_by_name: cancelledByName,
        },
      )

      if (rpcError) throw rpcError

      const cancelledAt =
        data?.cancelled_at || data?.cancelledAt || new Date().toISOString()
      const actorName =
        data?.cancelled_by_name || data?.cancelledByName || cancelledByName

      setItems((currentItems) =>
        currentItems.map((currentItem) =>
          String(currentItem.item_id) === String(item.item_id)
            ? {
                ...currentItem,
                is_cancelled: true,
                cancelled_at: cancelledAt,
                cancelled_by_name: actorName,
              }
            : currentItem,
        ),
      )

      setSelectedTask((currentTask) => {
        if (!currentTask) return currentTask
        if (item.is_cancelled === true) return currentTask
        return {
          ...currentTask,
          active_packages: Math.max(
            Number(currentTask.active_packages || 0) - 1,
            0,
          ),
          cancelled_packages: Number(currentTask.cancelled_packages || 0) + 1,
        }
      })

      setCancelTarget(null)
      setToast('Order berhasil ditandai cancel.')
    } catch (cancelError) {
      console.error('Gagal menandai order cancel:', cancelError)
      setToast('Gagal menandai order cancel. Silakan coba kembali.')
    } finally {
      setCancellingItemId(null)
    }
  }

  const downloadTaskList = async () => {
    setDownloading(true)
    try {
      const rows = tasks.map((task) => ({
        'Nomor Tugas': task.task_number || task.session_number || '-',
        Status: task.status || '-',
        'Dibuat Oleh': task.created_by_name || '-',
        'Dipacking Oleh': task.packed_by_name || '-',
        'Waktu Submit': formatDateLong(task.submitted_at),
        'Total Paket': task.total_packages || 0,
        'Paket Aktif': task.active_packages || 0,
        'Order Cancel': task.cancelled_packages || 0,
      }))

      const workbook = await createWorkbook()
      await addJsonSheet(workbook, rows, 'History Packing')
      await downloadWorkbook(workbook, 'History_Packing.xlsx')
    } catch (err) {
      console.error('Gagal download Excel:', err)
      setToast('Gagal mengunduh Excel.')
    } finally {
      setDownloading(false)
    }
  }

  const downloadTaskDetail = async () => {
    if (!selectedTask) return
    setDownloading(true)
    try {
      const rows = items.map((item, index) => ({
        No: item.scan_sequence || index + 1,
        'Nomor Resi': item.tracking_number || '-',
        'Sumber Scan': getSourceLabel(item.scan_source),
        'Waktu Scan': formatDateLong(item.scanned_at),
        'Status Order': item.is_cancelled ? 'ORDER CANCEL' : 'ORDER AKTIF',
        'Ditandai Cancel Oleh': item.cancelled_by_name || '-',
        'Waktu Cancel': formatDateLong(item.cancelled_at),
      }))

      const workbook = await createWorkbook()
      await addJsonSheet(workbook, rows, 'Detail Resi')
      await downloadWorkbook(
        workbook,
        `${selectedTask.task_number || selectedTask.session_number || 'History_Packing'}.xlsx`,
      )
    } catch (err) {
      console.error('Gagal download Excel:', err)
      setToast('Gagal mengunduh Excel.')
    } finally {
      setDownloading(false)
    }
  }

  if (selectedTask) {
    return (
      <main className="sph-page">
        <header className="sph-header">
          <div>
            <p className="small-label">BCL Warehouse WMS</p>
            <h1>Detail History Packing</h1>
            <p className="sph-subtitle">
              Daftar resi berdasarkan Nomor Tugas Packing.
            </p>
          </div>

          <div className="sph-header-actions">
            <button
              className="sph-secondary-button"
              type="button"
              onClick={closeDetail}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Kembali
            </button>

            <button
              className="sph-secondary-button"
              type="button"
              disabled={detailLoading}
              onClick={() => loadTaskItems(selectedTask)}
            >
              {detailLoading ? 'Memuat...' : 'Refresh'}
            </button>

            <button
              className="sph-primary-button"
              type="button"
              disabled={items.length === 0 || downloading}
              onClick={downloadTaskDetail}
            >
              {downloading ? 'Mengunduh...' : 'Download Excel'}
            </button>

            <button
              className="sph-secondary-button"
              type="button"
              disabled={loadingLogout}
              onClick={onLogout}
            >
              {loadingLogout ? 'Keluar...' : 'Logout'}
            </button>
          </div>
        </header>

        <section className="sph-content">
          <div className="sph-summary-grid">
            <article className="sph-summary-card">
              <p>Nomor Tugas</p>
              <strong>
                {selectedTask.task_number || selectedTask.session_number || '-'}
              </strong>
            </article>
            <article className="sph-summary-card">
              <p>Total Paket</p>
              <strong>{detailSummary.total}</strong>
            </article>
            <article className="sph-summary-card">
              <p>Paket Aktif</p>
              <strong>{detailSummary.active}</strong>
            </article>
            <article className="sph-summary-card">
              <p>Order Cancel</p>
              <strong>{detailSummary.cancelled}</strong>
            </article>
            <article className="sph-summary-card">
              <p>Dipacking Oleh</p>
              <strong>
                {selectedTask.packed_by_name || selectedTask.created_by_name || '-'}
              </strong>
            </article>
            <article className="sph-summary-card">
              <p>Waktu Submit</p>
              <strong>{formatDateLong(selectedTask.submitted_at)}</strong>
            </article>
          </div>

          <section className="sph-panel">
            <div className="sph-panel-header">
              <div>
                <h2>Daftar Resi ({filteredItems.length})</h2>
                <p>Cari resi kemudian tandai cancel jika order dibatalkan.</p>
              </div>
              <input
                className="sph-search"
                type="search"
                value={itemSearch}
                placeholder="Cari nomor resi"
                onChange={(event) => setItemSearch(event.target.value)}
              />
            </div>

            {detailError ? (
              <div className="sph-message sph-error">
                <p>{detailError}</p>
                <button
                  className="sph-secondary-button"
                  type="button"
                  onClick={() => loadTaskItems(selectedTask)}
                >
                  Coba Lagi
                </button>
              </div>
            ) : null}

            {detailLoading ? (
              <div className="sph-message">
                <div className="spinner" />
                <p>Memuat daftar resi...</p>
              </div>
            ) : null}

            {!detailLoading && !detailError ? (
              <div className="sph-table-wrapper">
                <table className="sph-table">
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
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td className="sph-empty-table" colSpan="8">
                          Nomor resi tidak ditemukan.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item, index) => (
                        <tr
                          className={item.is_cancelled ? 'sph-cancelled-row' : ''}
                          key={item.item_id}
                        >
                          <td>{item.scan_sequence || index + 1}</td>
                          <td>
                            <strong>{item.tracking_number || '-'}</strong>
                          </td>
                          <td>{getSourceLabel(item.scan_source)}</td>
                          <td>{formatDateLong(item.scanned_at)}</td>
                          <td>
                            <span
                              className={
                                item.is_cancelled
                                  ? 'sph-status-badge sph-status-cancelled'
                                  : 'sph-status-badge sph-status-active'
                              }
                            >
                              {item.is_cancelled ? 'ORDER CANCEL' : 'ORDER AKTIF'}
                            </span>
                          </td>
                          <td>{item.cancelled_by_name || '-'}</td>
                          <td>{formatDateLong(item.cancelled_at)}</td>
                          <td>
                            {!item.is_cancelled ? (
                              <button
                                className="sph-danger-outline-button"
                                type="button"
                                disabled={
                                  cancellingItemId === String(item.item_id)
                                }
                                onClick={() => setCancelTarget(item)}
                              >
                                {cancellingItemId === String(item.item_id)
                                  ? 'Memproses...'
                                  : 'Tandai Cancel'}
                              </button>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </section>

        {cancelTarget ? (
          <div
            className="sph-modal-backdrop"
            role="presentation"
            onClick={() => { if (!cancellingItemId) setCancelTarget(null) }}
          >
            <section
              className="sph-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-pack-title"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 id="cancel-pack-title">Tandai Order Cancel</h2>
              <p>Anda yakin ingin menandai order ini sebagai cancel?</p>
              <div className="sph-modal-reference">
                Nomor Resi:{' '}
                <strong>{cancelTarget.tracking_number || '-'}</strong>
              </div>
              <div className="sph-modal-actions">
                <button
                  className="sph-secondary-button"
                  type="button"
                  disabled={Boolean(cancellingItemId)}
                  onClick={() => setCancelTarget(null)}
                >
                  Tidak
                </button>
                <button
                  className="sph-danger-button"
                  type="button"
                  disabled={Boolean(cancellingItemId)}
                  onClick={handleMarkCancelled}
                >
                  {cancellingItemId ? 'Memproses...' : 'Ya'}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {toast ? <div className="sph-toast">{toast}</div> : null}
      </main>
    )
  }

  return (
    <main className="sph-page">
      <header className="sph-header">
        <div>
          <p className="small-label">BCL Warehouse WMS</p>
          <h1>History Packing</h1>
          <p className="sph-subtitle">
            Riwayat packing berdasarkan Nomor Tugas.
          </p>
        </div>

        <div className="sph-header-actions">
          <button
            className="sph-secondary-button"
            type="button"
            onClick={onBack}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Kembali
          </button>

          <button
            className="sph-secondary-button"
            type="button"
            disabled={loading}
            onClick={() => loadTasks(search)}
          >
            {loading ? 'Memuat...' : 'Refresh'}
          </button>

          <button
            className="sph-primary-button"
            type="button"
            disabled={loading || tasks.length === 0 || downloading}
            onClick={downloadTaskList}
          >
            {downloading ? 'Mengunduh...' : 'Download Excel'}
          </button>

          <button
            className="sph-secondary-button"
            type="button"
            disabled={loadingLogout}
            onClick={onLogout}
          >
            {loadingLogout ? 'Keluar...' : 'Logout'}
          </button>
        </div>
      </header>

      <section className="sph-content">
        <form className="sph-search-panel" onSubmit={handleSearch}>
          <label>
            <span>Cari nomor tugas atau nomor resi</span>
            <input
              className="sph-search"
              type="search"
              value={search}
              placeholder="Masukkan nomor tugas atau resi"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="sph-search-actions">
            <button className="sph-primary-button" type="submit" disabled={loading}>
              Cari
            </button>
            <button
              className="sph-secondary-button"
              type="button"
              disabled={loading}
              onClick={handleReset}
            >
              Reset
            </button>
          </div>
        </form>

        {error ? (
          <div className="sph-message sph-error">
            <p>{error}</p>
            <button
              className="sph-secondary-button"
              type="button"
              onClick={() => loadTasks(search)}
            >
              Coba Lagi
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="sph-message">
            <div className="spinner" />
            <p>Memuat History Packing...</p>
          </div>
        ) : null}

        {!loading && !error && tasks.length === 0 ? (
          <div className="sph-message">Belum ada History Packing.</div>
        ) : null}

        {!loading && !error && tasks.length > 0 ? (
          <section className="sph-panel">
            <div className="sph-panel-header">
              <div>
                <h2>Daftar Nomor Tugas ({tasks.length})</h2>
                <p>Klik Nomor Tugas untuk melihat seluruh resi.</p>
              </div>
            </div>

            <div className="sph-table-wrapper">
              <table className="sph-table">
                <thead>
                  <tr>
                    <th>Nomor Tugas</th>
                    <th>Waktu Submit</th>
                    <th>Dipacking Oleh</th>
                    <th>Total Paket</th>
                    <th>Paket Aktif</th>
                    <th>Order Cancel</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.session_id}>
                      <td>
                        <button
                          className="sph-link-button"
                          type="button"
                          onClick={() => openTask(task)}
                        >
                          {task.task_number || task.session_number || '-'}
                        </button>
                      </td>
                      <td>{formatDateLong(task.submitted_at)}</td>
                      <td>
                        {task.packed_by_name || task.created_by_name || '-'}
                      </td>
                      <td>{task.total_packages || 0}</td>
                      <td>{task.active_packages || 0}</td>
                      <td>
                        <span className="sph-cancel-count">
                          {task.cancelled_packages || 0}
                        </span>
                      </td>
                      <td>
                        <span className="sph-status-badge sph-status-submitted">
                          SELESAI PACKING
                        </span>
                      </td>
                      <td>
                        <button
                          className="sph-secondary-button sph-detail-button"
                          type="button"
                          onClick={() => openTask(task)}
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </section>

      {toast ? <div className="sph-toast">{toast}</div> : null}
    </main>
  )
}

export default ScanPackHistoryPage
