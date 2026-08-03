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
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('')
  const [recentRows, setRecentRows] = useState([])
  const [googleConnected, setGoogleConnected] = useState(false)
  const inputRef = useRef(null)

  const loadRecent = async () => {
    if (releaseOrderLogConfigError || !googleConnected) return
    try {
      const result = await getRecentReleaseOrders(20)
      setRecentRows(result.rows || [])
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
    } catch (error) {
      setMessageType('error')
      setMessage(error.message)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const cleanTrackingNumber = trackingNumber.trim().toUpperCase()

    if (!cleanTrackingNumber) {
      setMessageType('error')
      setMessage('Nomor resi wajib diisi.')
      inputRef.current?.focus()
      return
    }

    setSaving(true)
    setMessage('')
    try {
      const result = await saveReleaseOrder({
        trackingNumber: cleanTrackingNumber,
      })
      setTrackingNumber('')
      setMessageType('success')
      setMessage(result.message || `Resi ${cleanTrackingNumber} berhasil dicatat.`)
      await loadRecent()
    } catch (error) {
      setMessageType('error')
      setMessage(error.message)
    } finally {
      setSaving(false)
      inputRef.current?.focus()
    }
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
                placeholder="Scan atau ketik nomor resi" autoComplete="off"
                disabled={saving || Boolean(releaseOrderLogConfigError) || !googleConnected}
                onChange={(event) => setTrackingNumber(event.target.value)} />
              <button className="primary-button" type="submit"
                disabled={saving || Boolean(releaseOrderLogConfigError) || !googleConnected}>
                {saving ? 'Menyimpan...' : 'Catat Resi'}
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
