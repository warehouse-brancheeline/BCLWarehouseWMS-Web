import { useEffect, useRef, useState } from 'react'
import {
  getRecentReleaseOrders,
  connectReleaseOrderSheet,
  releaseOrderLogConfigError,
  saveReleaseOrder,
} from '../lib/releaseOrderLog'
import './ReleaseOrderLogPage.css'

function ReleaseOrderLogPage({ loadingLogout, onBack, onLogout }) {
  const [trackingNumber, setTrackingNumber] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('')
  const [recentRows, setRecentRows] = useState([])
  const [googleConnected, setGoogleConnected] = useState(false)
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
      focusScannerInput()
    } catch {
      // Scan tetap bisa digunakan walaupun riwayat gagal dimuat.
    }
  }

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleConnectGoogle = async () => {
    setMessage('')
    try {
      await connectReleaseOrderSheet()
      setGoogleConnected(true)
      const result = await getRecentReleaseOrders(20)
      setRecentRows(result.rows || [])
      setMessageType('success')
      setMessage('Google Sheet terhubung. Scanner siap digunakan.')
      focusScannerInput()
    } catch (error) {
      setMessageType('error')
      setMessage(error.message)
    }
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

    if (queuedTrackingNumbersRef.current.has(cleanTrackingNumber)) {
      setTrackingNumber('')
      setMessageType('error')
      setMessage(`Resi ${cleanTrackingNumber} sudah masuk antrean.`)
      focusScannerInput()
      return
    }

    queuedTrackingNumbersRef.current.add(cleanTrackingNumber)

    const optimisticRow = {
      timestamp: new Date().toLocaleString('id-ID'),
      trackingNumber: cleanTrackingNumber,
      source: 'WMS Web',
    }

    setTrackingNumber('')
    setMessageType('success')
    setMessage(`Resi ${cleanTrackingNumber} masuk antrean.`)
    setRecentRows((rows) => [optimisticRow, ...rows].slice(0, 20))
    setPendingCount((count) => count + 1)
    focusScannerInput()

    scanQueueRef.current = scanQueueRef.current
      .then(() => saveReleaseOrder({ trackingNumber: cleanTrackingNumber }))
      .then((result) => {
        setMessageType('success')
        setMessage(result.message || `Resi ${cleanTrackingNumber} berhasil dicatat.`)
      })
      .catch((error) => {
        setRecentRows((rows) => rows.filter(
          (row) => row !== optimisticRow,
        ))
        setMessageType('error')
        setMessage(error.message)
      })
      .finally(() => {
        setPendingCount((count) => Math.max(0, count - 1))
        focusScannerInput()
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
          <button className="secondary-button" type="button" onClick={onBack}>Kembali</button>
          <button className="secondary-button" type="button" disabled={loadingLogout} onClick={onLogout}>
            {loadingLogout ? 'Keluar...' : 'Logout'}
          </button>
        </div>
      </header>

      <section className="release-order-content">
        <article className="release-order-scan-card">
          <div className="release-order-step">1</div>
          <div>
            <h2>Scan nomor resi</h2>
            <p>Arahkan scanner ke barcode resi. Data tersimpan saat scanner mengirim Enter.</p>
          </div>
          {!googleConnected && !releaseOrderLogConfigError ? (
            <button className="release-order-google-button" type="button" onClick={handleConnectGoogle}>
              Hubungkan Google Sheet
            </button>
          ) : null}
          <form onSubmit={handleSubmit}>
            <label htmlFor="release-order-tracking">Nomor resi</label>
            <div className="release-order-input-row">
              <input ref={inputRef} id="release-order-tracking" value={trackingNumber}
                placeholder="Scan atau ketik nomor resi" autoComplete="off" autoFocus
                disabled={Boolean(releaseOrderLogConfigError) || !googleConnected}
                onChange={(event) => setTrackingNumber(event.target.value)}
                onBlur={() => {
                  if (googleConnected) focusScannerInput()
                }} />
              <button className="primary-button" type="submit"
                disabled={Boolean(releaseOrderLogConfigError) || !googleConnected}>
                {pendingCount ? `Antrean ${pendingCount}` : 'Catat Resi'}
              </button>
            </div>
          </form>
          {releaseOrderLogConfigError ? (
            <div className="release-order-message error">{releaseOrderLogConfigError}</div>
          ) : null}
          {message ? <div className={`release-order-message ${messageType}`}>{message}</div> : null}
        </article>

        <article className="release-order-history-card">
          <div className="release-order-history-title">
            <div><p className="small-label">20 SCAN TERBARU</p><h2>Riwayat Release</h2></div>
            <button className="secondary-button" type="button" disabled={!googleConnected} onClick={loadRecent}>Muat Ulang</button>
          </div>
          <div className="release-order-table-wrap">
            <table>
              <thead><tr><th>Waktu</th><th>Nomor Resi</th><th>Sumber</th></tr></thead>
              <tbody>
                {recentRows.length ? recentRows.map((row) => (
                  <tr key={`${row.timestamp}-${row.trackingNumber}`}>
                    <td>{row.timestamp}</td><td><strong>{row.trackingNumber}</strong></td><td>{row.source}</td>
                  </tr>
                )) : <tr><td colSpan="3" className="release-order-empty">Belum ada data scan.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  )
}

export default ReleaseOrderLogPage
