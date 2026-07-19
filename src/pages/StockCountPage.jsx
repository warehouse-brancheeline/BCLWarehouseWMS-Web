import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  addAoaSheet,
  addJsonSheet,
  createWorkbook,
  downloadWorkbook,
} from '../lib/excel'
import { supabase } from '../lib/supabase'
import {
  formatDate,
  formatQty,
  pickValue,
  safeFilename,
  toNumber,
} from '../lib/utils'
import Pagination from '../lib/Pagination'
import { usePagination } from '../lib/usePagination'
import './StockCountPage.css'

function normalizeStatus(value) {
  return String(value || 'SUBMITTED')
    .trim()
    .toUpperCase()
}

function getStatusClass(status) {
  const value = normalizeStatus(status)

  const classMap = {
    DRAFT: 'stock-status-draft',
    IN_PROGRESS: 'stock-status-progress',
    APPROVED: 'stock-status-approved',
    REJECTED: 'stock-status-rejected',
    REVIEWED: 'stock-status-reviewed',
    ADJUSTED: 'stock-status-adjusted',
  }

  return classMap[value] || 'stock-status-submitted'
}

function getVarianceClass(value) {
  const numberValue = toNumber(value)

  if (numberValue > 0) {
    return 'variance-positive'
  }

  if (numberValue < 0) {
    return 'variance-negative'
  }

  return 'variance-zero'
}

function StockCountPage({
  session,
  loadingLogout,
  onBack,
  onLogout,
}) {
  const [sessions, setSessions] = useState([])
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [currentUserName, setCurrentUserName] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // ── Load current user name ───────────────────────────────────
  useEffect(() => {
    const getUserName = async () => {
      if (!session?.user) {
        return
      }

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', session.user.id)
          .maybeSingle()

        const resolvedName = pickValue(
          profile,
          ['full_name', 'name', 'display_name', 'email'],
          session.user.email,
        )

        setCurrentUserName(String(resolvedName || session.user.email || ''))
      } catch {
        if (session.user.email) {
          setCurrentUserName(session.user.email)
        }
      }
    }

    getUserName()
  }, [session])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [sessionResult, itemResult] = await Promise.all([
        supabase.from('stock_count_sessions').select('*').limit(1000),
        supabase.from('stock_count_items').select('*').limit(10000),
      ])

      if (sessionResult.error) {
        throw sessionResult.error
      }

      if (itemResult.error) {
        throw itemResult.error
      }

      const sessionRows = sessionResult.data ?? []
      const itemRows = itemResult.data ?? []

      // ── Kumpulkan ID yang dibutuhkan ─────────────────────────
      const binIds = new Set()
      const skuIds = new Set()
      const profileIds = new Set()

      itemRows.forEach((item) => {
        const binId = pickValue(item, ['bin_id', 'location_id'], '')
        const skuId = pickValue(
          item,
          ['sku_id', 'item_id', 'product_id'],
          '',
        )

        if (binId) {
          binIds.add(String(binId))
        }

        if (skuId) {
          skuIds.add(String(skuId))
        }
      })

      // FIX: Hanya load profiles yang dibutuhkan (bukan semua)
      sessionRows.forEach((session) => {
        const userId = pickValue(
          session,
          [
            'created_by',
            'user_id',
            'counted_by',
            'submitted_by',
            'staff_id',
          ],
          '',
        )

        if (userId) {
          profileIds.add(String(userId))
        }
      })

      const binQuery =
        binIds.size > 0
          ? supabase.from('bins').select('*').in('id', Array.from(binIds))
          : Promise.resolve({ data: [], error: null })

      const skuQuery =
        skuIds.size > 0
          ? supabase.from('skus').select('*').in('id', Array.from(skuIds))
          : Promise.resolve({ data: [], error: null })

      // FIX: Hanya query profile yang relevan saja
      const profileQuery =
        profileIds.size > 0
          ? supabase
              .from('profiles')
              .select('id, user_id, auth_user_id, full_name, name, display_name, email')
              .in('id', Array.from(profileIds))
          : Promise.resolve({ data: [], error: null })

      const [binResult, skuResult, profileResult] = await Promise.all([
        binQuery,
        skuQuery,
        profileQuery,
      ])

      if (binResult.error) {
        throw binResult.error
      }

      if (skuResult.error) {
        throw skuResult.error
      }

      if (profileResult.error) {
        console.warn('Profiles gagal dimuat:', profileResult.error)
      }

      const binsById = new Map(
        (binResult.data ?? []).map((bin) => [String(bin.id), bin]),
      )

      const skusById = new Map(
        (skuResult.data ?? []).map((sku) => [String(sku.id), sku]),
      )

      const profilesById = new Map()

      ;(profileResult.data ?? []).forEach((profile) => {
        const possibleIds = [
          profile.id,
          profile.user_id,
          profile.auth_user_id,
        ]

        possibleIds.forEach((id) => {
          if (id) {
            profilesById.set(String(id), profile)
          }
        })
      })

      const normalizedItems = itemRows.map((item) => {
        const sessionId = String(
          pickValue(
            item,
            [
              'stock_count_session_id',
              'stock_count_id',
              'count_id',
              'session_id',
            ],
            '',
          ),
        )

        const binId = String(
          pickValue(item, ['bin_id', 'location_id'], ''),
        )

        const skuId = String(
          pickValue(item, ['sku_id', 'item_id', 'product_id'], ''),
        )

        const bin = binsById.get(binId)
        const sku = skusById.get(skuId)

        const systemQty = toNumber(
          pickValue(
            item,
            [
              'system_qty',
              'expected_qty',
              'book_qty',
              'qty_system',
              'current_qty',
            ],
            0,
          ),
        )

        const actualQty = toNumber(
          pickValue(
            item,
            [
              'actual_qty',
              'counted_qty',
              'physical_qty',
              'qty_actual',
              'count_qty',
              'qty',
            ],
            0,
          ),
        )

        const savedVariance = pickValue(
          item,
          ['variance', 'difference', 'variance_qty', 'difference_qty'],
          '',
        )

        const variance =
          savedVariance === ''
            ? actualQty - systemQty
            : toNumber(savedVariance)

        return {
          id: pickValue(item, ['id'], crypto.randomUUID()),
          sessionId,
          binCode: pickValue(
            bin,
            ['bin_code', 'code', 'location_code', 'name'],
            pickValue(
              item,
              ['bin_code', 'location_code', 'bin', 'location'],
              '-',
            ),
          ),
          skuCode: pickValue(
            sku,
            ['sku_code', 'code', 'sku'],
            pickValue(item, ['sku_code', 'sku', 'item_code'], '-'),
          ),
          skuName: pickValue(
            sku,
            ['sku_name', 'name', 'description', 'product_name'],
            pickValue(
              item,
              ['sku_name', 'description', 'product_name'],
              '-',
            ),
          ),
          systemQty,
          actualQty,
          variance,
          notes: pickValue(item, ['notes', 'remarks', 'note'], '-'),
          createdAt: pickValue(
            item,
            ['created_at', 'counted_at', 'updated_at'],
            '',
          ),
        }
      })

      const itemsBySession = new Map()

      normalizedItems.forEach((item) => {
        if (!itemsBySession.has(item.sessionId)) {
          itemsBySession.set(item.sessionId, [])
        }

        itemsBySession.get(item.sessionId).push(item)
      })

      const normalizedSessions = sessionRows.map((session) => {
        const sessionId = String(pickValue(session, ['id'], ''))
        const items = itemsBySession.get(sessionId) ?? []

        const userId = String(
          pickValue(
            session,
            [
              'created_by',
              'user_id',
              'counted_by',
              'submitted_by',
              'staff_id',
            ],
            '',
          ),
        )

        const profile = profilesById.get(userId)

        const transactionNumber = pickValue(
          session,
          [
            'transaction_number',
            'count_number',
            'session_number',
            'stock_count_number',
            'reference_no',
            'document_number',
          ],
          sessionId
            ? `SC-${sessionId.slice(0, 8).toUpperCase()}`
            : '-',
        )

        const staffName = pickValue(
          session,
          [
            'staff_name',
            'created_by_name',
            'counter_name',
            'counted_by_name',
            'user_name',
            'user_email',
          ],
          pickValue(
            profile,
            ['full_name', 'name', 'display_name', 'email'],
            userId ? userId.slice(0, 8) : '-',
          ),
        )

        const totalSystemQty = items.reduce(
          (total, item) => total + item.systemQty,
          0,
        )

        const totalActualQty = items.reduce(
          (total, item) => total + item.actualQty,
          0,
        )

        const totalVariance = items.reduce(
          (total, item) => total + item.variance,
          0,
        )

        return {
          id: sessionId,
          transactionNumber,
          staffName,
          status: normalizeStatus(
            pickValue(session, ['status'], 'SUBMITTED'),
          ),
          notes: pickValue(session, ['notes', 'remarks', 'note'], '-'),
          createdAt: pickValue(
            session,
            [
              'submitted_at',
              'created_at',
              'count_date',
              'updated_at',
            ],
            '',
          ),
          reviewNotes: pickValue(session, ['review_notes'], ''),
          reviewedByName: pickValue(session, ['reviewed_by_name'], ''),
          reviewedAt: pickValue(session, ['reviewed_at'], ''),
          approvedByName: pickValue(session, ['approved_by_name'], ''),
          approvedAt: pickValue(session, ['approved_at'], ''),
          rejectedByName: pickValue(session, ['rejected_by_name'], ''),
          rejectedAt: pickValue(session, ['rejected_at'], ''),
          itemCount: items.length,
          totalSystemQty,
          totalActualQty,
          totalVariance,
          items,
        }
      })

      normalizedSessions.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime() || 0
        const dateB = new Date(b.createdAt).getTime() || 0
        return dateB - dateA
      })

      setSessions(normalizedSessions)
    } catch (loadError) {
      console.error(loadError)
      setSessions([])
      setError(
        loadError?.message || 'Data Stock Count gagal dimuat.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredSessions = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) {
      return sessions
    }

    return sessions.filter((session) =>
      [
        session.transactionNumber,
        session.staffName,
        session.status,
        session.notes,
      ].some((value) =>
        String(value).toLowerCase().includes(keyword),
      ),
    )
  }, [sessions, search])

  const pagination = usePagination(filteredSessions, 25)

  const handleSearchChange = (event) => {
    setSearch(event.target.value)
    pagination.resetPage()
  }

  const selectedSession = useMemo(
    () =>
      sessions.find((session) => session.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  )

  const totalItems = useMemo(
    () =>
      sessions.reduce((total, session) => total + session.itemCount, 0),
    [sessions],
  )

  const totalStaff = useMemo(
    () =>
      new Set(
        sessions
          .map((session) => session.staffName.trim())
          .filter((name) => name && name !== '-'),
      ).size,
    [sessions],
  )

  const isReviewDisabled = useMemo(() => {
    if (!selectedSession) {
      return true
    }

    const status = normalizeStatus(selectedSession.status)
    return status === 'APPROVED' || status === 'REJECTED'
  }, [selectedSession])

  const canMarkReviewed = useMemo(() => {
    if (!selectedSession || isReviewDisabled) {
      return false
    }

    const status = normalizeStatus(selectedSession.status)
    return status === 'SUBMITTED'
  }, [selectedSession, isReviewDisabled])

  const canApprove = useMemo(() => {
    if (!selectedSession || isReviewDisabled) {
      return false
    }

    const status = normalizeStatus(selectedSession.status)
    return status === 'SUBMITTED' || status === 'REVIEWED'
  }, [selectedSession, isReviewDisabled])

  const canReject = useMemo(() => {
    if (!selectedSession || isReviewDisabled) {
      return false
    }

    const status = normalizeStatus(selectedSession.status)
    return status === 'SUBMITTED' || status === 'REVIEWED'
  }, [selectedSession, isReviewDisabled])

  const handleReviewAction = useCallback(
    async (action) => {
      if (!selectedSession || !currentUserName) {
        setError('User tidak tersedia.')
        return
      }

      if (action === 'REJECTED' && !reviewNotes.trim()) {
        setError('Catatan wajib diisi untuk Reject.')
        return
      }

      setConfirmAction({ action, notes: reviewNotes })
      setShowConfirmDialog(true)
    },
    [selectedSession, currentUserName, reviewNotes],
  )

  const executeReviewAction = useCallback(async () => {
    if (!confirmAction || !selectedSession || !currentUserName) {
      return
    }

    setShowConfirmDialog(false)
    setReviewLoading(true)
    setError('')

    try {
      const { error: rpcError } = await supabase.rpc(
        'review_stock_count_session',
        {
          p_session_id: selectedSession.id,
          p_action: confirmAction.action,
          p_reviewer_name: currentUserName,
          p_review_notes: confirmAction.notes || null,
        },
      )

      if (rpcError) {
        throw rpcError
      }

      setSuccessMessage(
        `Transaksi berhasil di-${confirmAction.action.toLowerCase()}.`,
      )
      setReviewNotes('')
      setConfirmAction(null)

      await loadData()

      setTimeout(() => {
        setSuccessMessage('')
      }, 3000)
    } catch (reviewError) {
      console.error(reviewError)
      setError(
        reviewError?.message || 'Gagal memproses review transaksi.',
      )
    } finally {
      setReviewLoading(false)
    }
  }, [confirmAction, selectedSession, currentUserName, loadData])

  const downloadExcel = async () => {
    if (!selectedSession) {
      return
    }

    const summaryRows = [
      ['BCL Warehouse WMS'],
      ['Laporan Stock Count'],
      [],
      ['Nomor Transaksi', selectedSession.transactionNumber],
      ['Staff Penghitung', selectedSession.staffName],
      ['Tanggal', formatDate(selectedSession.createdAt)],
      ['Status', selectedSession.status],
      ['Total Baris', selectedSession.itemCount],
      ['Total Qty Sistem', selectedSession.totalSystemQty],
      ['Total Qty Aktual', selectedSession.totalActualQty],
      ['Total Selisih', selectedSession.totalVariance],
      ['Catatan Sesi', selectedSession.notes],
    ]

    if (selectedSession.reviewedByName) {
      summaryRows.push(['Direview Oleh', selectedSession.reviewedByName])
      summaryRows.push([
        'Tanggal Review',
        formatDate(selectedSession.reviewedAt),
      ])
    }

    if (selectedSession.approvedByName) {
      summaryRows.push(['Disetujui Oleh', selectedSession.approvedByName])
      summaryRows.push([
        'Tanggal Persetujuan',
        formatDate(selectedSession.approvedAt),
      ])
    }

    if (selectedSession.rejectedByName) {
      summaryRows.push(['Ditolak Oleh', selectedSession.rejectedByName])
      summaryRows.push([
        'Tanggal Penolakan',
        formatDate(selectedSession.rejectedAt),
      ])
    }

    if (selectedSession.reviewNotes) {
      summaryRows.push(['Catatan Review', selectedSession.reviewNotes])
    }

    const detailRows = selectedSession.items.map((item, index) => ({
      No: index + 1,
      Lokasi: item.binCode,
      SKU: item.skuCode,
      Deskripsi: item.skuName,
      'Qty Sistem': item.systemQty,
      'Qty Aktual': item.actualQty,
      Selisih: item.variance,
      Catatan: item.notes,
      'Waktu Input': formatDate(item.createdAt),
    }))

    const workbook = await createWorkbook()
    const summarySheet = await addAoaSheet(workbook, summaryRows, 'Ringkasan')
    const detailSheet = await addJsonSheet(
      workbook,
      detailRows,
      'Detail Stock Count',
    )

    summarySheet['!cols'] = [{ wch: 24 }, { wch: 35 }]
    detailSheet['!cols'] = [
      { wch: 7 },
      { wch: 18 },
      { wch: 22 },
      { wch: 38 },
      { wch: 14 },
      { wch: 14 },
      { wch: 12 },
      { wch: 35 },
      { wch: 22 },
    ]

    const filename = `Stock_Count_${safeFilename(
      selectedSession.transactionNumber,
    )}.xlsx`

    await downloadWorkbook(workbook, filename, { compression: true })
  }

  if (selectedSession) {
    return (
      <main className="dashboard-page">
        <header className="dashboard-header">
          <div>
            <p className="small-label">BCL Warehouse WMS</p>
            <h1>Detail Stock Count</h1>
          </div>

          <div className="stock-header-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setSelectedSessionId(null)}
            >
              Daftar Transaksi
            </button>

            <button
              className="stock-download-button"
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
              {loadingLogout ? 'Keluar...' : 'Logout'}
            </button>
          </div>
        </header>

        <section className="dashboard-content">
          <div className="transaction-info-card">
            <div>
              <span>Nomor Transaksi</span>
              <strong>{selectedSession.transactionNumber}</strong>
            </div>
            <div>
              <span>Staff Penghitung</span>
              <strong>{selectedSession.staffName}</strong>
            </div>
            <div>
              <span>Tanggal</span>
              <strong>{formatDate(selectedSession.createdAt)}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>
                <span
                  className={`stock-status-label ${getStatusClass(
                    selectedSession.status,
                  )}`}
                >
                  {selectedSession.status}
                </span>
              </strong>
            </div>
          </div>

          <div className="stock-summary-grid">
            <article className="stock-summary-card">
              <span>Total Baris</span>
              <strong>{selectedSession.itemCount}</strong>
            </article>
            <article className="stock-summary-card">
              <span>Total Qty Sistem</span>
              <strong>{formatQty(selectedSession.totalSystemQty)}</strong>
            </article>
            <article className="stock-summary-card">
              <span>Total Qty Aktual</span>
              <strong>{formatQty(selectedSession.totalActualQty)}</strong>
            </article>
            <article className="stock-summary-card">
              <span>Total Selisih</span>
              <strong
                className={getVarianceClass(selectedSession.totalVariance)}
              >
                {selectedSession.totalVariance > 0 ? '+' : ''}
                {formatQty(selectedSession.totalVariance)}
              </strong>
            </article>
          </div>

          <div className="stock-review-info-card">
            <div className="stock-review-info-header">
              <h3>Informasi Review</h3>
            </div>

            <div className="stock-review-info-grid">
              {selectedSession.reviewedByName && (
                <>
                  <div>
                    <span>Direview Oleh</span>
                    <strong>{selectedSession.reviewedByName}</strong>
                  </div>
                  <div>
                    <span>Tanggal Review</span>
                    <strong>
                      {formatDate(selectedSession.reviewedAt)}
                    </strong>
                  </div>
                </>
              )}

              {selectedSession.approvedByName && (
                <>
                  <div>
                    <span>Disetujui Oleh</span>
                    <strong>{selectedSession.approvedByName}</strong>
                  </div>
                  <div>
                    <span>Tanggal Persetujuan</span>
                    <strong>
                      {formatDate(selectedSession.approvedAt)}
                    </strong>
                  </div>
                </>
              )}

              {selectedSession.rejectedByName && (
                <>
                  <div>
                    <span>Ditolak Oleh</span>
                    <strong>{selectedSession.rejectedByName}</strong>
                  </div>
                  <div>
                    <span>Tanggal Penolakan</span>
                    <strong>
                      {formatDate(selectedSession.rejectedAt)}
                    </strong>
                  </div>
                </>
              )}

              {selectedSession.reviewNotes && (
                <div className="stock-review-notes-full">
                  <span>Catatan Review</span>
                  <div className="stock-review-notes-text">
                    {selectedSession.reviewNotes}
                  </div>
                </div>
              )}
            </div>
          </div>

          {!isReviewDisabled && (
            <div className="stock-review-panel">
              <div className="stock-review-header">
                <h3>Review Stock Count</h3>
              </div>

              <div className="stock-review-form">
                <div className="stock-review-notes-field">
                  <label htmlFor="review-notes">Catatan Review</label>
                  <textarea
                    id="review-notes"
                    className="stock-review-textarea"
                    value={reviewNotes}
                    placeholder="Masukkan catatan review (opsional, kecuali untuk Reject)"
                    disabled={reviewLoading}
                    onChange={(event) =>
                      setReviewNotes(event.target.value)
                    }
                    rows="4"
                  />
                </div>

                <div className="stock-review-buttons">
                  {canMarkReviewed && (
                    <button
                      className="stock-review-button stock-reviewed-button"
                      type="button"
                      disabled={reviewLoading}
                      onClick={() => handleReviewAction('REVIEWED')}
                    >
                      {reviewLoading ? 'Proses...' : 'Tandai Reviewed'}
                    </button>
                  )}

                  {canApprove && (
                    <button
                      className="stock-review-button stock-approve-button"
                      type="button"
                      disabled={reviewLoading}
                      onClick={() => handleReviewAction('APPROVED')}
                    >
                      {reviewLoading ? 'Proses...' : 'Approve'}
                    </button>
                  )}

                  {canReject && (
                    <button
                      className="stock-review-button stock-reject-button"
                      type="button"
                      disabled={reviewLoading || !reviewNotes.trim()}
                      onClick={() => handleReviewAction('REJECTED')}
                    >
                      {reviewLoading ? 'Proses...' : 'Reject'}
                    </button>
                  )}
                </div>

                {error && (
                  <div className="error-message">{error}</div>
                )}

                {successMessage && (
                  <div className="success-message">{successMessage}</div>
                )}
              </div>
            </div>
          )}

          <div className="stock-table-card">
            <div className="stock-table-scroll">
              <table className="stock-table stock-detail-table">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Lokasi</th>
                    <th>SKU</th>
                    <th>Deskripsi</th>
                    <th>Qty Sistem</th>
                    <th>Qty Aktual</th>
                    <th>Selisih</th>
                    <th>Catatan</th>
                    <th>Waktu Input</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSession.items.length === 0 ? (
                    <tr>
                      <td className="stock-empty-table" colSpan="9">
                        Transaksi ini belum mempunyai detail item.
                      </td>
                    </tr>
                  ) : (
                    selectedSession.items.map((item, index) => (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td>
                          <span className="stock-bin-label">
                            {item.binCode}
                          </span>
                        </td>
                        <td>
                          <strong>{item.skuCode}</strong>
                        </td>
                        <td>{item.skuName}</td>
                        <td>{formatQty(item.systemQty)}</td>
                        <td>
                          <strong>{formatQty(item.actualQty)}</strong>
                        </td>
                        <td>
                          <strong
                            className={getVarianceClass(item.variance)}
                          >
                            {item.variance > 0 ? '+' : ''}
                            {formatQty(item.variance)}
                          </strong>
                        </td>
                        <td>{item.notes}</td>
                        <td>{formatDate(item.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {showConfirmDialog && (
            <div className="stock-confirm-dialog-overlay">
              <div className="stock-confirm-dialog">
                <h2>Konfirmasi Action</h2>

                <p>
                  Apakah Anda yakin ingin{' '}
                  {confirmAction?.action === 'REVIEWED'
                    ? 'menandai sebagai Reviewed'
                    : confirmAction?.action === 'APPROVED'
                      ? 'Approve'
                      : 'Reject'}{' '}
                  transaksi ini?
                </p>

                <div className="stock-confirm-buttons">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setShowConfirmDialog(false)}
                  >
                    Batal
                  </button>

                  <button
                    className={`primary-button ${
                      confirmAction?.action === 'REJECTED'
                        ? 'stock-reject-button'
                        : confirmAction?.action === 'APPROVED'
                          ? 'stock-approve-button'
                          : 'stock-reviewed-button'
                    }`}
                    type="button"
                    disabled={reviewLoading}
                    onClick={executeReviewAction}
                  >
                    {reviewLoading ? 'Proses...' : 'Ya, Lanjutkan'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    )
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="small-label">BCL Warehouse WMS</p>
          <h1>Transaksi Stock Count</h1>
        </div>

        <div className="stock-header-actions">
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
            disabled={loadingLogout}
            onClick={onLogout}
          >
            {loadingLogout ? 'Keluar...' : 'Logout'}
          </button>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="stock-summary-grid stock-session-summary">
          <article className="stock-summary-card">
            <span>Total Transaksi</span>
            <strong>{sessions.length}</strong>
          </article>
          <article className="stock-summary-card">
            <span>Total Staff</span>
            <strong>{totalStaff}</strong>
          </article>
          <article className="stock-summary-card">
            <span>Total Baris Hitungan</span>
            <strong>{totalItems}</strong>
          </article>
          <article className="stock-summary-card">
            <span>Hasil Ditampilkan</span>
            <strong>{filteredSessions.length}</strong>
          </article>
        </div>

        <div className="stock-toolbar">
          <div>
            <h2>Daftar Nomor Transaksi</h2>
            <p>
              Klik nomor transaksi untuk melihat seluruh detail hitungan.
            </p>
          </div>

          <div className="stock-toolbar-actions">
            <input
              className="stock-search"
              type="search"
              value={search}
              placeholder="Cari transaksi, staff, atau status"
              onChange={handleSearchChange}
            />

            <button
              className="stock-refresh-button"
              type="button"
              disabled={loading}
              onClick={loadData}
            >
              {loading ? 'Memuat...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="error-message">
            <strong>Data gagal dimuat</strong>
            <p>{error}</p>
          </div>
        )}

        <div className="stock-table-card">
          <div className="stock-table-scroll">
            <table className="stock-table stock-session-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>No. Transaksi</th>
                  <th>Staff</th>
                  <th>Total Baris</th>
                  <th>Total Qty Aktual</th>
                  <th>Total Selisih</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="stock-empty-table" colSpan="8">
                      Memuat transaksi Stock Count...
                    </td>
                  </tr>
                ) : pagination.totalItems === 0 ? (
                  <tr>
                    <td className="stock-empty-table" colSpan="8">
                      Belum ada transaksi Stock Count.
                    </td>
                  </tr>
                ) : (
                  pagination.paginatedData.map((session) => (
                    <tr key={session.id}>
                      <td>{formatDate(session.createdAt)}</td>
                      <td>
                        <button
                          className="transaction-number-button"
                          type="button"
                          onClick={() => setSelectedSessionId(session.id)}
                        >
                          {session.transactionNumber}
                        </button>
                      </td>
                      <td>
                        <strong>{session.staffName}</strong>
                      </td>
                      <td>{session.itemCount}</td>
                      <td>
                        <strong>{formatQty(session.totalActualQty)}</strong>
                      </td>
                      <td>
                        <strong
                          className={getVarianceClass(session.totalVariance)}
                        >
                          {session.totalVariance > 0 ? '+' : ''}
                          {formatQty(session.totalVariance)}
                        </strong>
                      </td>
                      <td>
                        <span
                          className={`stock-status-label ${getStatusClass(
                            session.status,
                          )}`}
                        >
                          {session.status}
                        </span>
                      </td>
                      <td>
                        <button
                          className="open-detail-button"
                          type="button"
                          onClick={() => setSelectedSessionId(session.id)}
                        >
                          Buka Detail
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Pagination {...pagination} />
      </section>
    </main>
  )
}

export default StockCountPage
