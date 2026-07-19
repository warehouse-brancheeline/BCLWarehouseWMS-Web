import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { supabase } from '../lib/supabase'
import {
  formatDate,
  normalizeUpper,
} from '../lib/utils'
import './CancelledShipmentsPage.css'

const CANCEL_REASONS = [
  'Order dibatalkan customer',
  'Cancel dari marketplace',
  'Stok tidak tersedia',
  'Duplikat order',
  'Kesalahan pesanan',
  'Order terindikasi fraud',
  'Permintaan admin',
  'Lainnya',
]

const PROCESS_STATUS_LABELS = {
  UNKNOWN: 'Belum Dicek',
  NOT_PACKED: 'Belum Packing',
  PACKED: 'Sudah Packing',
  HANDED_OVER: 'Sudah Handover',
}

function normalizeTrackingNumber(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
}

function parseTrackingNumbers(value) {
  const trackingNumbers = String(value || '')
    .split(/[\n,;]+/)
    .map(normalizeTrackingNumber)
    .filter(Boolean)

  return [...new Set(trackingNumbers)]
}

function CancelledShipmentsPage({
  loadingLogout,
  onBack,
  onLogout,
}) {
  const [trackingInput, setTrackingInput] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ACTIVE')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [updatingId, setUpdatingId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const trackingNumbers = useMemo(
    () => parseTrackingNumbers(trackingInput),
    [trackingInput],
  )

  const loadCancelledShipments = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data, error: loadError } = await supabase
      .from('cancelled_shipments')
      .select('*')
      .order('cancelled_at', { ascending: false })
      .limit(1000)

    if (loadError) {
      console.error(loadError)
      setRows([])
      setError(
        loadError.message || 'Data resi cancel gagal dimuat.',
      )
    } else {
      setRows(data ?? [])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    loadCancelledShipments()
  }, [loadCancelledShipments])

  const filteredRows = useMemo(() => {
    const keyword = normalizeTrackingNumber(search)

    return rows.filter((row) => {
      const matchesStatus =
        statusFilter === 'ALL' || row.cancel_status === statusFilter

      if (!matchesStatus) {
        return false
      }

      if (!keyword) {
        return true
      }

      return [
        row.tracking_number,
        row.tracking_number_normalized,
        row.cancel_reason,
        row.notes,
      ].some((value) =>
        String(value || '').toUpperCase().includes(keyword),
      )
    })
  }, [rows, search, statusFilter])

  const activeCount = useMemo(
    () => rows.filter((row) => row.cancel_status === 'ACTIVE').length,
    [rows],
  )

  const packedCount = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.cancel_status === 'ACTIVE' &&
          row.process_status_at_cancel === 'PACKED',
      ).length,
    [rows],
  )

  const handedOverCount = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.cancel_status === 'ACTIVE' &&
          row.process_status_at_cancel === 'HANDED_OVER',
      ).length,
    [rows],
  )

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (trackingNumbers.length === 0) {
      setError('Masukkan minimal satu nomor resi.')
      return
    }

    if (!cancelReason) {
      setError('Alasan cancel wajib dipilih.')
      return
    }

    setSubmitting(true)

    const cancelledAt = new Date().toISOString()

    const payload = trackingNumbers.map((trackingNumber) => ({
      tracking_number: trackingNumber,
      tracking_number_normalized: trackingNumber,
      cancel_reason: cancelReason,
      notes: notes.trim() || null,
      cancel_status: 'ACTIVE',
      process_status_at_cancel: 'UNKNOWN',
      source: 'WEBSITE',
      cancelled_at: cancelledAt,
    }))

    const { error: saveError } = await supabase
      .from('cancelled_shipments')
      .upsert(payload, {
        onConflict: 'tracking_number_normalized',
      })

    if (saveError) {
      console.error(saveError)
      setError(
        saveError.message || 'Resi cancel gagal disimpan.',
      )
      setSubmitting(false)
      return
    }

    setSuccess(
      `${trackingNumbers.length} resi berhasil dimasukkan ke daftar cancel.`,
    )

    setTrackingInput('')
    setCancelReason('')
    setNotes('')

    await loadCancelledShipments()
    setSubmitting(false)
  }

  const updateCancelStatus = async (row, nextStatus) => {
    const isRevoking = nextStatus === 'REVOKED'

    const confirmationMessage = isRevoking
      ? `Cabut status cancel untuk resi ${row.tracking_number}? Resi dapat diproses kembali di aplikasi.`
      : `Aktifkan kembali status cancel untuk resi ${row.tracking_number}?`

    const confirmed = window.confirm(confirmationMessage)
    if (!confirmed) {
      return
    }

    setUpdatingId(row.id)
    setError('')
    setSuccess('')

    const updatePayload = {
      cancel_status: nextStatus,
    }

    if (nextStatus === 'ACTIVE') {
      updatePayload.cancelled_at = new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('cancelled_shipments')
      .update(updatePayload)
      .eq('id', row.id)

    if (updateError) {
      console.error(updateError)
      setError(
        updateError.message || 'Status resi gagal diperbarui.',
      )
    } else {
      setSuccess(
        nextStatus === 'ACTIVE'
          ? `Resi ${row.tracking_number} kembali berstatus cancel.`
          : `Status cancel resi ${row.tracking_number} berhasil dicabut.`,
      )
      await loadCancelledShipments()
    }

    setUpdatingId('')
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="small-label">Scan Pack</p>
          <h1>Input Resi Cancel</h1>
        </div>

        <div className="header-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={submitting || Boolean(updatingId)}
            onClick={onBack}
          >
            Kembali
          </button>

          <button
            className="secondary-button"
            type="button"
            disabled={loadingLogout || submitting}
            onClick={onLogout}
          >
            {loadingLogout ? 'Keluar...' : 'Logout'}
          </button>
        </div>
      </header>

      <section className="dashboard-content">
        <section className="cancel-layout">
          <form className="cancel-form-card" onSubmit={handleSubmit}>
            <div className="section-heading">
              <div>
                <p className="small-label">Admin Website</p>
                <h2>Tambah Resi Cancel</h2>
              </div>
              <span className="website-only-label">Website Only</span>
            </div>

            <label htmlFor="trackingInput">Nomor Resi</label>
            <textarea
              id="trackingInput"
              value={trackingInput}
              disabled={submitting}
              placeholder={
                'Masukkan atau paste nomor resi.\nSatu resi per baris.\n\nContoh:\nSPXID123456789\nTKP001234567'
              }
              onChange={(event) => setTrackingInput(event.target.value)}
            />

            <div className="input-information">
              <span>Resi terbaca:</span>
              <strong>{trackingNumbers.length}</strong>
            </div>

            <label htmlFor="cancelReason">Alasan Cancel</label>
            <select
              id="cancelReason"
              value={cancelReason}
              disabled={submitting}
              onChange={(event) => setCancelReason(event.target.value)}
            >
              <option value="">Pilih alasan cancel</option>
              {CANCEL_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>

            <label htmlFor="cancelNotes">Catatan</label>
            <textarea
              id="cancelNotes"
              className="notes-textarea"
              value={notes}
              disabled={submitting}
              placeholder="Catatan tambahan, nama marketplace, nomor order, atau informasi lain."
              onChange={(event) => setNotes(event.target.value)}
            />

            <div className="cancel-warning">
              Resi yang aktif di daftar cancel akan ditolak saat Check Pack
              dan diperiksa kembali saat Handover.
            </div>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <button
              className="primary-button"
              type="submit"
              disabled={
                submitting ||
                trackingNumbers.length === 0 ||
                !cancelReason
              }
            >
              {submitting
                ? 'Menyimpan...'
                : `Simpan ${
                    trackingNumbers.length > 0 ? trackingNumbers.length : ''
                  } Resi Cancel`}
            </button>
          </form>

          <section className="cancel-information-card">
            <p className="small-label">Cara Kerja</p>
            <h2>Validasi Dua Tahap</h2>

            <div className="validation-step">
              <span>1</span>
              <div>
                <strong>Check Pack</strong>
                <p>
                  Resi cancel langsung ditolak sebelum proses packing
                  dilanjutkan.
                </p>
              </div>
            </div>

            <div className="validation-step">
              <span>2</span>
              <div>
                <strong>Handover</strong>
                <p>
                  Resi diperiksa kembali. Paket yang terlanjur dipacking tetap
                  ditolak sebelum diserahkan ke ekspedisi.
                </p>
              </div>
            </div>

            <div className="validation-step">
              <span>3</span>
              <div>
                <strong>Pencabutan Cancel</strong>
                <p>
                  Admin dapat mencabut status cancel apabila order
                  dinyatakan boleh diproses kembali.
                </p>
              </div>
            </div>
          </section>
        </section>

        <section className="cancel-summary-grid">
          <article className="cancel-stat-card">
            <div className="cancel-stat-top">
              <div className="cancel-stat-icon">📊</div>
              <span className="cancel-stat-label">Total Data</span>
            </div>
            <strong className="cancel-stat-value">
              {filteredRows.length}
            </strong>
          </article>

          <article className="cancel-stat-card">
            <div className="cancel-stat-top">
              <div className="cancel-stat-icon cancel-stat-icon-danger">⛔</div>
              <span className="cancel-stat-label">Cancel Aktif</span>
            </div>
            <strong className="cancel-stat-value">{activeCount}</strong>
          </article>

          <article className="cancel-stat-card">
            <div className="cancel-stat-top">
              <div className="cancel-stat-icon cancel-stat-icon-warning">📦</div>
              <span className="cancel-stat-label">Cancel Setelah Packing</span>
            </div>
            <strong className="cancel-stat-value">{packedCount}</strong>
          </article>

          <article className="cancel-stat-card">
            <div className="cancel-stat-top">
              <div className="cancel-stat-icon cancel-stat-icon-success">🚚</div>
              <span className="cancel-stat-label">Sudah Handover</span>
            </div>
            <strong className="cancel-stat-value">{handedOverCount}</strong>
          </article>
        </section>

        <section className="cancel-history-card">
          <div className="cancel-history-header">
            <div>
              <p className="small-label">Riwayat</p>
              <h2>Daftar Resi Cancel</h2>
            </div>
            <button
              className="secondary-button"
              type="button"
              disabled={loading}
              onClick={loadCancelledShipments}
            >
              {loading ? 'Memuat...' : 'Refresh'}
            </button>
          </div>

          <div className="cancel-toolbar">
            <input
              type="search"
              value={search}
              placeholder="Cari nomor resi, alasan, atau catatan"
              onChange={(event) => setSearch(event.target.value)}
            />

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
            >
              <option value="ACTIVE">Cancel Aktif</option>
              <option value="REVOKED">Cancel Dicabut</option>
              <option value="ALL">Semua Status</option>
            </select>
          </div>

          <div className="cancel-table-wrapper">
            <table className="cancel-table">
              <thead>
                <tr>
                  <th>Nomor Resi</th>
                  <th>Alasan</th>
                  <th>Status Proses</th>
                  <th>Status Cancel</th>
                  <th>Waktu Input</th>
                  <th>Catatan</th>
                  <th>Tindakan</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="empty-table">
                      Memuat data resi cancel...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-table">
                      Belum ada data yang sesuai.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong className="tracking-number">
                          {row.tracking_number}
                        </strong>
                      </td>

                      <td>{row.cancel_reason}</td>

                      <td>
                        <span className="process-label">
                          {PROCESS_STATUS_LABELS[
                            row.process_status_at_cancel
                          ] ||
                            row.process_status_at_cancel ||
                            '-'}
                        </span>
                      </td>

                      <td>
                        <span
                          className={
                            row.cancel_status === 'ACTIVE'
                              ? 'cancel-status cancel-status-active'
                              : 'cancel-status cancel-status-revoked'
                          }
                        >
                          {row.cancel_status === 'ACTIVE'
                            ? 'Cancel Aktif'
                            : 'Dicabut'}
                        </span>
                      </td>

                      <td>{formatDate(row.cancelled_at)}</td>

                      <td>{row.notes || '-'}</td>

                      <td>
                        {row.cancel_status === 'ACTIVE' ? (
                          <button
                            className="table-action table-action-revoke"
                            type="button"
                            disabled={updatingId === row.id}
                            onClick={() => updateCancelStatus(row, 'REVOKED')}
                          >
                            {updatingId === row.id
                              ? 'Memproses...'
                              : 'Cabut Cancel'}
                          </button>
                        ) : (
                          <button
                            className="table-action table-action-activate"
                            type="button"
                            disabled={updatingId === row.id}
                            onClick={() => updateCancelStatus(row, 'ACTIVE')}
                          >
                            {updatingId === row.id
                              ? 'Memproses...'
                              : 'Aktifkan Kembali'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="table-result-information">
            Menampilkan <strong>{filteredRows.length}</strong> dari{' '}
            <strong>{rows.length}</strong> data.
          </p>
        </section>
      </section>
    </main>
  )
}

export default CancelledShipmentsPage
