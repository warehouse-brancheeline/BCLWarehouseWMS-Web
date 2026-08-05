import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getRecentReleaseOrders,
  connectReleaseOrderSheet,
  disconnectReleaseOrderSheet,
  deleteReleaseOrder,
  hasSavedReleaseOrderConnection,
  releaseOrderLogConfigError,
  saveReleaseOrder,
  updateReleaseOrder,
} from '../lib/releaseOrderLog'
import './ReleaseOrderLogPage.css'

const couriers = [
  'ID Express',
  'Instant',
  'INTERNAL',
  'J&T',
  'J&T Cargo',
  'J&T Express',
  'JNE Cargo',
  'JNE Reguler',
  'SPX Standard',
]

function getDateKey(timestamp) {
  const localizedDate = String(timestamp || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (localizedDate) {
    const [, day, month, year] = localizedDate
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'Tanggal tidak diketahui'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateLabel(dateKey) {
  if (dateKey === 'Tanggal tidak diketahui') return dateKey
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function ReleaseOrderLogPage({ loadingLogout, onBack, onLogout }) {
  const [trackingNumber, setTrackingNumber] = useState('')
  const [pickingList, setPickingList] = useState('')
  const [selectedCourier, setSelectedCourier] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('')
  const [recentRows, setRecentRows] = useState([])
  const [allRows, setAllRows] = useState([])
  const [screen, setScreen] = useState('home')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedGroupCourier, setSelectedGroupCourier] = useState('')
  const [googleConnected, setGoogleConnected] = useState(
    () => hasSavedReleaseOrderConnection(),
  )
  const [editingRowNumber, setEditingRowNumber] = useState(null)
  const [editTrackingNumber, setEditTrackingNumber] = useState('')
  const [editCourier, setEditCourier] = useState('')
  const [editPickingList, setEditPickingList] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [expandedPickingLists, setExpandedPickingLists] = useState(() => new Set())
  const inputRef = useRef(null)
  const scanQueueRef = useRef(Promise.resolve())
  const queuedTrackingNumbersRef = useRef(new Set())

  const focusScannerInput = () => {
    window.setTimeout(() => inputRef.current?.focus(), 50)
  }

  const loadRecent = async () => {
    if (releaseOrderLogConfigError || !googleConnected) return
    try {
      const result = await getRecentReleaseOrders(20)
      setRecentRows(result.rows || [])
      setAllRows(result.allRows || [])
      if (screen === 'scan') focusScannerInput()
    } catch {
      // Scan tetap bisa digunakan walaupun riwayat gagal dimuat.
    }
  }

  useEffect(() => {
    inputRef.current?.focus()
    if (googleConnected) window.setTimeout(loadRecent, 0)
    // Pemeriksaan sesi cukup dilakukan sekali saat halaman dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleConnectGoogle = async () => {
    setMessage('')
    try {
      await connectReleaseOrderSheet()
      setGoogleConnected(true)
      const result = await getRecentReleaseOrders(20)
      setRecentRows(result.rows || [])
      setAllRows(result.allRows || [])
      setMessageType('success')
      setMessage('Google Sheet terhubung. Scanner siap digunakan.')
      focusScannerInput()
    } catch (error) {
      setMessageType('error')
      setMessage(error.message)
    }
  }

  const handleChangeGoogleSheet = () => {
    disconnectReleaseOrderSheet()
    setGoogleConnected(false)
    setRecentRows([])
    setAllRows([])
    setMessageType('success')
    setMessage('Sambungan lama dilepas. Klik Hubungkan Google Sheet untuk memilih akun kembali.')
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const cleanTrackingNumber = trackingNumber.trim().toUpperCase()

    if (!cleanTrackingNumber) {
      setMessageType('error')
      setMessage('Nomor resi wajib diisi.')
      focusScannerInput()
      return
    }

    if (!selectedCourier) {
      setMessageType('error')
      setMessage('Pilih kurir terlebih dahulu.')
      focusScannerInput()
      return
    }

    if (!pickingList.trim()) {
      setMessageType('error')
      setMessage('Nomor picking list wajib diisi.')
      focusScannerInput()
      return
    }

    if (queuedTrackingNumbersRef.current.has(cleanTrackingNumber)) {
      setTrackingNumber('')
      setMessageType('error')
      setMessage(`Resi ${cleanTrackingNumber} sudah masuk antrean.`)
      focusScannerInput()
      return
    }

    queuedTrackingNumbersRef.current.add(cleanTrackingNumber)

    const optimisticRow = {
      timestamp: new Date().toISOString(),
      trackingNumber: cleanTrackingNumber,
      source: 'WMS Web',
      courier: selectedCourier,
      pickingList: pickingList.trim().toUpperCase(),
    }

    setTrackingNumber('')
    setMessageType('success')
    setMessage(`Resi ${cleanTrackingNumber} masuk antrean.`)
    setRecentRows((rows) => [optimisticRow, ...rows].slice(0, 20))
    setAllRows((rows) => [...rows, optimisticRow])
    setPendingCount((count) => count + 1)
    focusScannerInput()

    scanQueueRef.current = scanQueueRef.current
      .then(() => saveReleaseOrder({
        trackingNumber: cleanTrackingNumber,
        courier: selectedCourier,
        pickingList: pickingList.trim().toUpperCase(),
      }))
      .then((result) => {
        if (result.rowNumber) {
          setRecentRows((rows) => rows.map((row) => (
            row === optimisticRow ? { ...row, rowNumber: result.rowNumber } : row
          )))
          setAllRows((rows) => rows.map((row) => (
            row === optimisticRow ? { ...row, rowNumber: result.rowNumber } : row
          )))
        }
        setMessageType('success')
        setMessage(result.message || `Resi ${cleanTrackingNumber} berhasil dicatat.`)
      })
      .catch((error) => {
        setRecentRows((rows) => rows.filter(
          (row) => row !== optimisticRow,
        ))
        setAllRows((rows) => rows.filter((row) => row !== optimisticRow))
        setMessageType('error')
        setMessage(error.message)
      })
      .finally(() => {
        setPendingCount((count) => Math.max(0, count - 1))
        focusScannerInput()
      })
  }

  const startEditing = (row) => {
    setEditingRowNumber(row.rowNumber)
    setEditTrackingNumber(row.trackingNumber)
    setEditCourier(row.courier)
    setEditPickingList(row.pickingList || '')
  }

  const handleSaveEdit = async (row) => {
    setActionBusy(true)
    setMessage('')
    try {
      const result = await updateReleaseOrder({
        rowNumber: row.rowNumber,
        oldTrackingNumber: row.trackingNumber,
        trackingNumber: editTrackingNumber,
        courier: editCourier,
        pickingList: editPickingList.trim().toUpperCase(),
      })
      queuedTrackingNumbersRef.current.delete(row.trackingNumber)
      queuedTrackingNumbersRef.current.add(editTrackingNumber.trim().toUpperCase())
      setEditingRowNumber(null)
      setMessageType('success')
      setMessage(result.message)
      await loadRecent()
    } catch (error) {
      setMessageType('error')
      setMessage(error.message)
    } finally {
      setActionBusy(false)
    }
  }

  const handleDelete = async (row) => {
    if (!window.confirm(`Hapus resi ${row.trackingNumber} dari Google Sheet?`)) return
    setActionBusy(true)
    setMessage('')
    try {
      const result = await deleteReleaseOrder({
        rowNumber: row.rowNumber,
        trackingNumber: row.trackingNumber,
      })
      queuedTrackingNumbersRef.current.delete(row.trackingNumber)
      setMessageType('success')
      setMessage(result.message)
      await loadRecent()
    } catch (error) {
      setMessageType('error')
      setMessage(error.message)
    } finally {
      setActionBusy(false)
    }
  }

  const togglePickingListGroup = (pickingListKey) => {
    setExpandedPickingLists((prev) => {
      const next = new Set(prev)
      if (next.has(pickingListKey)) next.delete(pickingListKey)
      else next.add(pickingListKey)
      return next
    })
  }

  // Picking list yang sedang aktif di form scan (live, mengikuti ketikan/scan user).
  const activePickingListKey = pickingList.trim().toUpperCase()

  // Total resi yang sudah tercatat untuk picking list yang sedang dikerjakan (seluruh riwayat, bukan cuma 20 terbaru).
  const activePickingListScanCount = activePickingListKey
    ? allRows.filter((row) => (row.pickingList || '').trim().toUpperCase() === activePickingListKey).length
    : 0

  // Kelompokkan "20 scan terbaru" berdasarkan nomor picking list.
  // Group untuk picking list yang sedang aktif selalu tampil flat (expanded).
  // Group picking list lain otomatis collapse menjadi kartu ringkasan begitu user pindah ke picking list baru.
  const historyGroups = useMemo(() => {
    const order = []
    const map = new Map()
    recentRows.forEach((row) => {
      const key = (row.pickingList || '').trim().toUpperCase() || 'TANPA PICKING LIST'
      if (!map.has(key)) {
        map.set(key, [])
        order.push(key)
      }
      map.get(key).push(row)
    })
    const groups = order.map((key) => ({ pickingList: key, rows: map.get(key) }))
    // Pin picking list aktif ke urutan paling atas, sisanya tetap urut dari yang paling baru discan.
    groups.sort((a, b) => {
      const aActive = activePickingListKey && a.pickingList === activePickingListKey
      const bActive = activePickingListKey && b.pickingList === activePickingListKey
      if (aActive && !bActive) return -1
      if (bActive && !aActive) return 1
      return 0
    })
    return groups
  }, [recentRows, activePickingListKey])

  const dateGroups = [...new Set(allRows.map((row) => getDateKey(row.timestamp)))]
    .sort((a, b) => b.localeCompare(a))
    .map((date) => ({
      date,
      count: allRows.filter((row) => getDateKey(row.timestamp) === date).length,
    }))

  const rowsForSelectedDate = allRows.filter(
    (row) => getDateKey(row.timestamp) === selectedDate,
  )
  const courierGroups = [...new Set(rowsForSelectedDate.map((row) => row.courier || '-'))]
    .sort()
    .map((courier) => ({
      courier,
      count: rowsForSelectedDate.filter((row) => (row.courier || '-') === courier).length,
    }))
  const visibleRows = screen === 'detail'
    ? rowsForSelectedDate
      .filter((row) => (row.courier || '-') === selectedGroupCourier)
      .slice()
      .reverse()
    : recentRows

  const handlePageBack = () => {
    if (screen === 'detail') setScreen('couriers')
    else if (screen === 'couriers' || screen === 'scan') setScreen('home')
    else onBack()
  }

  const renderHistoryRow = (row) => (
    <tr key={`${row.timestamp}-${row.trackingNumber}`}>
      <td>{row.timestamp}</td>
      <td>
        {editingRowNumber === row.rowNumber ? (
          <input className="release-order-edit-input" value={editTrackingNumber}
            onChange={(event) => setEditTrackingNumber(event.target.value.toUpperCase())} />
        ) : <strong>{row.trackingNumber}</strong>}
      </td>
      <td>
        {editingRowNumber === row.rowNumber ? (
          <select className="release-order-edit-select" value={editCourier}
            onChange={(event) => setEditCourier(event.target.value)}>
            {couriers.map((courier) => <option key={courier}>{courier}</option>)}
          </select>
        ) : (row.courier || '-')}
      </td>
      <td>{row.source}</td>
      <td>
        {editingRowNumber === row.rowNumber ? (
          <input className="release-order-edit-input" value={editPickingList}
            onChange={(event) => setEditPickingList(event.target.value.toUpperCase())} />
        ) : (row.pickingList || '-')}
      </td>
      <td>
        <div className="release-order-row-actions">
          {editingRowNumber === row.rowNumber ? (
            <>
              <button type="button" className="row-action save"
                disabled={actionBusy || !editCourier || !editPickingList.trim()}
                onClick={() => handleSaveEdit(row)}>Simpan</button>
              <button type="button" className="row-action" disabled={actionBusy}
                onClick={() => setEditingRowNumber(null)}>Batal</button>
            </>
          ) : (
            <>
              <button type="button" className="row-action" disabled={actionBusy || !row.rowNumber}
                onClick={() => startEditing(row)}>Edit</button>
              <button type="button" className="row-action delete" disabled={actionBusy || !row.rowNumber}
                onClick={() => handleDelete(row)}>Hapus</button>
            </>
          )}
        </div>
      </td>
    </tr>
  )

  const renderGroupedHistoryRows = () => {
    if (!historyGroups.length) {
      return <tr><td colSpan="6" className="release-order-empty">Belum ada data scan.</td></tr>
    }
    return historyGroups.flatMap((group) => {
      const isActiveGroup = Boolean(activePickingListKey) && group.pickingList === activePickingListKey
      const isExpanded = isActiveGroup || expandedPickingLists.has(group.pickingList)
      const groupRow = (
        <tr key={`group-${group.pickingList}`} className={`release-order-group-row${isActiveGroup ? ' active' : ''}`}>
          <td colSpan="6">
            <button
              type="button"
              className="release-order-group-toggle"
              disabled={isActiveGroup}
              onClick={() => togglePickingListGroup(group.pickingList)}
            >
              <span>
                {isActiveGroup ? 'Picklist aktif · ' : ''}
                {group.pickingList}
              </span>
              <span className="release-order-count">{group.rows.length} resi</span>
              {!isActiveGroup ? (
                <span className="release-order-group-caret">{isExpanded ? '▲' : '▼'}</span>
              ) : null}
            </button>
          </td>
        </tr>
      )
      if (!isExpanded) return [groupRow]
      return [groupRow, ...group.rows.map((row) => renderHistoryRow(row))]
    })
  }

  return (
    <main className="release-order-page">
      <header className="release-order-header">
        <div>
          <p className="small-label">ADMIN WEB</p>
          <h1>Release Order Log</h1>
          <p>Scan resi sebelum order diberikan kepada picker.</p>
        </div>
        <div className="release-order-header-actions">
          <button className="secondary-button" type="button" onClick={handlePageBack}>Kembali</button>
          <button className="secondary-button" type="button" disabled={loadingLogout} onClick={onLogout}>
            {loadingLogout ? 'Keluar...' : 'Logout'}
          </button>
        </div>
      </header>

      <section className="release-order-content">
        {screen === 'home' ? (
          <>
            <article className="release-order-overview-card">
              <div>
                <p className="small-label">RELEASE ORDER</p>
                <h2>Hasil Scan Release Order</h2>
                <p>Pilih tanggal untuk melihat hasil scan per ekspedisi.</p>
              </div>
              <div className="release-order-overview-actions">
                {!googleConnected ? (
                  <button className="release-order-google-button" type="button" onClick={handleConnectGoogle}>
                    Hubungkan Google Sheet
                  </button>
                ) : (
                  <button className="secondary-button" type="button" onClick={handleChangeGoogleSheet}>
                    Ganti Google Sheet
                  </button>
                )}
                <button className="primary-button" type="button" disabled={!googleConnected}
                  onClick={() => {
                    setScreen('scan')
                    focusScannerInput()
                  }}>Buat Baru</button>
              </div>
            </article>
            {message ? <div className={`release-order-message ${messageType}`}>{message}</div> : null}
            <div className="release-order-group-list">
              {dateGroups.length ? dateGroups.map((group) => (
                <button className="release-order-group-card" type="button" key={group.date}
                  onClick={() => {
                    setSelectedDate(group.date)
                    setScreen('couriers')
                  }}>
                  <span><strong>{formatDateLabel(group.date)}</strong><small>{group.date}</small></span>
                  <span className="release-order-count">{group.count} resi</span>
                </button>
              )) : (
                <article className="release-order-empty-card">Belum ada hasil scan release order.</article>
              )}
            </div>
          </>
        ) : null}

        {screen === 'couriers' ? (
          <article className="release-order-history-card">
            <div className="release-order-history-title">
              <div><p className="small-label">{formatDateLabel(selectedDate)}</p><h2>List Per Ekspedisi</h2></div>
              <button className="secondary-button" type="button" onClick={loadRecent}>Muat Ulang</button>
            </div>
            <div className="release-order-group-list courier-groups">
              {courierGroups.map((group) => (
                <button className="release-order-group-card" type="button" key={group.courier}
                  onClick={() => {
                    setSelectedGroupCourier(group.courier)
                    setScreen('detail')
                  }}>
                  <strong>{group.courier}</strong>
                  <span className="release-order-count">{group.count} resi</span>
                </button>
              ))}
            </div>
          </article>
        ) : null}

        {screen === 'scan' ? <article className="release-order-scan-card">
          <div className="release-order-step">1</div>
          <div>
            <h2>Scan nomor resi</h2>
            <p>Arahkan scanner ke barcode resi. Data tersimpan saat scanner mengirim Enter.</p>
            {activePickingListKey ? (
              <p className="release-order-picklist-hint">
                Picklist <strong>{activePickingListKey}</strong>: {activePickingListScanCount} resi sudah discan
              </p>
            ) : null}
          </div>
          {!releaseOrderLogConfigError ? (
            googleConnected ? (
              <button className="release-order-google-button" type="button" onClick={handleChangeGoogleSheet}>
                Ganti Google Sheet
              </button>
            ) : (
              <button className="release-order-google-button" type="button" onClick={handleConnectGoogle}>
                Hubungkan Google Sheet
              </button>
            )
          ) : null}
          <form onSubmit={handleSubmit}>
            <div className="release-order-input-row">
              <div className="release-order-field">
                <label htmlFor="release-order-tracking">Nomor resi</label>
                <input ref={inputRef} id="release-order-tracking" value={trackingNumber}
                  placeholder="Scan atau ketik nomor resi" autoComplete="off" autoFocus
                  disabled={Boolean(releaseOrderLogConfigError) || !googleConnected}
                  onChange={(event) => setTrackingNumber(event.target.value)} />
              </div>
              <div className="release-order-field picking-list-field">
                <label htmlFor="release-order-picking-list">Nomor Picking List</label>
                <input id="release-order-picking-list" value={pickingList}
                  placeholder="Masukkan nomor picking list" autoComplete="off"
                  disabled={Boolean(releaseOrderLogConfigError) || !googleConnected}
                  onChange={(event) => setPickingList(event.target.value.toUpperCase())} />
              </div>
              <button className="primary-button" type="submit"
                disabled={Boolean(releaseOrderLogConfigError) || !googleConnected}>
                {pendingCount ? `Antrean ${pendingCount}` : 'Catat Resi'}
              </button>
            </div>
            <div className="release-order-couriers" aria-label="Pilih kurir">
              {couriers.map((courier) => (
                <button
                  className={selectedCourier === courier ? 'courier-button active' : 'courier-button'}
                  type="button"
                  key={courier}
                  aria-pressed={selectedCourier === courier}
                  onClick={() => {
                    setSelectedCourier(courier)
                    setMessage('')
                    focusScannerInput()
                  }}
                >
                  {courier}
                </button>
              ))}
            </div>
          </form>
          {releaseOrderLogConfigError ? (
            <div className="release-order-message error">{releaseOrderLogConfigError}</div>
          ) : null}
          {message ? <div className={`release-order-message ${messageType}`}>{message}</div> : null}
        </article> : null}

        {screen === 'scan' || screen === 'detail' ? <article className="release-order-history-card">
          <div className="release-order-history-title">
            <div>
              <p className="small-label">{screen === 'detail' ? formatDateLabel(selectedDate) : '20 SCAN TERBARU'}</p>
              <h2>{screen === 'detail' ? `Detail ${selectedGroupCourier}` : 'Riwayat Release'}</h2>
            </div>
            <button className="secondary-button" type="button" disabled={!googleConnected} onClick={loadRecent}>Muat Ulang</button>
          </div>
          <div className="release-order-table-wrap">
            <table>
              <thead><tr><th>Waktu</th><th>Nomor Resi</th><th>Kurir</th><th>Sumber</th><th>No. Picking List</th><th>Aksi</th></tr></thead>
              <tbody>
                {screen === 'scan'
                  ? renderGroupedHistoryRows()
                  : (visibleRows.length
                    ? visibleRows.map((row) => renderHistoryRow(row))
                    : <tr><td colSpan="6" className="release-order-empty">Belum ada data scan.</td></tr>)}
              </tbody>
            </table>
          </div>
        </article> : null}
      </section>
    </main>
  )
}

export default ReleaseOrderLogPage
