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
import {
  formatDate,
  formatQty,
  pickValue,
  safeFilename,
  toNumber,
} from '../lib/utils'
import './BinToBinPage.css'

function normalizeProcessStatus(value) {
  const normalized = String(value || 'DRAFT')
    .trim()
    .toUpperCase()

  const aliases = {
    COMPLETED: 'POSTED',
    APPROVED: 'POSTED',
    IN_PROGRESS: 'PROCESSING',
    REVIEWED: 'SUBMITTED',
    PENDING: 'SUBMITTED',
    CANCELED: 'CANCELLED',
  }

  return aliases[normalized] || normalized
}

function getProcessStatusDescription(status) {
  const normalized = normalizeProcessStatus(status)

  switch (normalized) {
    case 'DRAFT':
      return 'Transaksi masih berupa draft.'
    case 'SUBMITTED':
      return 'Transaksi sudah dikirim dan menunggu proses sistem.'
    case 'PROCESSING':
      return 'Transaksi sedang diproses oleh sistem.'
    case 'POSTED':
      return 'Perpindahan stok berhasil diproses dan dicatat oleh sistem.'
    case 'REJECTED':
      return 'Transaksi ditolak sebelum stok dipindahkan.'
    case 'CANCELLED':
      return 'Transaksi dibatalkan sebelum selesai diproses.'
    case 'CLOSED':
      return 'Transaksi yang sudah POSTED telah selesai dan dikunci.'
    default:
      return 'Status transaksi belum tersedia.'
  }
}

function getProcessStatusClass(status) {
  const value = normalizeProcessStatus(status)

  const classMap = {
    DRAFT: 'bbt-status-draft',
    SUBMITTED: 'bbt-status-submitted',
    PROCESSING: 'bbt-status-processing',
    POSTED: 'bbt-status-posted',
    REJECTED: 'bbt-status-rejected',
    CANCELLED: 'bbt-status-cancelled',
    CLOSED: 'bbt-status-closed',
  }

  return classMap[value] || 'bbt-status-submitted'
}

function getAllowedStatusActions(status) {
  const normalized = normalizeProcessStatus(status)

  if (normalized === 'SUBMITTED') {
    return [
      { label: 'Mulai Proses', action: 'PROCESSING' },
      { label: 'Reject', action: 'REJECTED' },
      { label: 'Cancel', action: 'CANCELLED' },
    ]
  }

  if (normalized === 'PROCESSING') {
    return [
      { label: 'Tandai Posted', action: 'POSTED' },
      { label: 'Reject', action: 'REJECTED' },
      { label: 'Cancel', action: 'CANCELLED' },
    ]
  }

  if (normalized === 'DRAFT') {
    return [{ label: 'Cancel', action: 'CANCELLED' }]
  }

  if (normalized === 'POSTED') {
    return [{ label: 'Close Transaction', action: 'CLOSED' }]
  }

  return []
}

function resolveTransferNumber(transfer, transferId) {
  const value = pickValue(
    transfer,
    [
      'transfer_number',
      'transfer_no',
      'transaction_number',
      'reference_no',
      'document_number',
    ],
    '',
  )

  if (value) {
    return String(value)
  }

  if (transferId) {
    return `BT-${String(transferId).slice(0, 8).toUpperCase()}`
  }

  return 'BT-UNKNOWN'
}

function resolveStaffName(transfer, profilesById) {
  const directName = pickValue(
    transfer,
    [
      'staff_name',
      'created_by_name',
      'submitted_by_name',
      'user_name',
      'user_email',
    ],
    '',
  )

  if (directName) {
    return String(directName)
  }

  const userId = pickValue(
    transfer,
    ['created_by', 'user_id', 'submitted_by', 'staff_id'],
    '',
  )

  if (!userId) {
    return '-'
  }

  const profile = profilesById.get(String(userId))

  if (profile) {
    const profileName = pickValue(
      profile,
      ['full_name', 'name', 'display_name'],
      '',
    )
    if (profileName) {
      return String(profileName)
    }

    const profileEmail = pickValue(profile, ['email'], '')
    if (profileEmail) {
      return String(profileEmail)
    }
  }

  return String(userId).slice(0, 8)
}

function BinToBinPage({
  session,
  loadingLogout,
  onBack,
  onLogout,
}) {
  const [transactions, setTransactions] = useState([])
  const [selectedTransferId, setSelectedTransferId] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentUserName, setCurrentUserName] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [statusFeedback, setStatusFeedback] = useState({
    type: '',
    message: '',
  })
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // ── Modal konfirmasi (ganti window.confirm) ──────────────────
  const [confirmDialog, setConfirmDialog] = useState(null)
  // confirmDialog = { action, actionLabel, onConfirm } | null

  useEffect(() => {
    const loadUserName = async () => {
      if (!session?.user) {
        return
      }

      try {
        const userId = session.user.id
        const userEmail = session.user.email

        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', userId)
          .maybeSingle()

        if (profile) {
          const resolvedName = pickValue(
            profile,
            ['full_name', 'name', 'display_name', 'email'],
            userEmail,
          )
          setCurrentUserName(String(resolvedName || userEmail || ''))
        } else if (userEmail) {
          setCurrentUserName(userEmail)
        }
      } catch {
        if (session.user.email) {
          setCurrentUserName(session.user.email)
        }
      }
    }

    loadUserName()
  }, [session])

  const loadHistory = useCallback(async (options = {}) => {
    const preserveSelection = options.preserveSelection ?? false

    setLoading(true)
    setError('')

    if (!preserveSelection) {
      setSelectedTransferId(null)
    }

    try {
      const [transferResult, itemResult] = await Promise.all([
        supabase.from('bin_transfers').select('*').limit(1000),
        supabase.from('bin_transfer_items').select('*').limit(10000),
      ])

      if (transferResult.error) {
        throw transferResult.error
      }

      if (itemResult.error) {
        throw itemResult.error
      }

      const transferRows = transferResult.data ?? []
      const itemRows = itemResult.data ?? []

      const transferIds = new Set(
        transferRows
          .map((transfer) =>
            String(pickValue(transfer, ['id'], '')),
          )
          .filter(Boolean),
      )

      const validItems = itemRows.filter((item) => {
        const transferId = String(
          pickValue(item, ['transfer_id', 'bin_transfer_id'], ''),
        )
        return transferIds.has(transferId)
      })

      const binIds = new Set()
      const skuIds = new Set()
      const profileIds = new Set()

      transferRows.forEach((transfer) => {
        const sourceBinId = pickValue(
          transfer,
          ['source_bin_id', 'from_bin_id'],
          '',
        )
        const destinationBinId = pickValue(
          transfer,
          ['destination_bin_id', 'to_bin_id'],
          '',
        )

        if (sourceBinId) {
          binIds.add(String(sourceBinId))
        }

        if (destinationBinId) {
          binIds.add(String(destinationBinId))
        }

        const userId = pickValue(
          transfer,
          ['created_by', 'user_id', 'submitted_by', 'staff_id'],
          '',
        )

        if (userId) {
          profileIds.add(String(userId))
        }
      })

      validItems.forEach((item) => {
        const skuId = pickValue(
          item,
          ['sku_id', 'item_id', 'product_id'],
          '',
        )
        if (skuId) {
          skuIds.add(String(skuId))
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

      const profileQuery =
        profileIds.size > 0
          ? supabase
              .from('profiles')
              .select('*')
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

      const itemsByTransfer = new Map()
      validItems.forEach((item) => {
        const transferId = String(
          pickValue(item, ['transfer_id', 'bin_transfer_id'], ''),
        )

        if (!itemsByTransfer.has(transferId)) {
          itemsByTransfer.set(transferId, [])
        }

        itemsByTransfer.get(transferId).push(item)
      })

      const normalizedTransactions = transferRows.map((transfer) => {
        const transferId = String(pickValue(transfer, ['id'], ''))
        const transferItems = itemsByTransfer.get(transferId) ?? []

        const sourceBinId = String(
          pickValue(transfer, ['source_bin_id', 'from_bin_id'], ''),
        )
        const destinationBinId = String(
          pickValue(transfer, ['destination_bin_id', 'to_bin_id'], ''),
        )

        const sourceBin = binsById.get(sourceBinId)
        const destinationBin = binsById.get(destinationBinId)

        const detailRows = transferItems
          .map((item) => {
            const skuId = String(
              pickValue(item, ['sku_id', 'item_id', 'product_id'], ''),
            )
            const sku = skusById.get(skuId)

            return {
              id: pickValue(item, ['id'], ''),
              skuCode: pickValue(
                sku,
                ['sku_code', 'code', 'sku'],
                pickValue(item, ['sku_code', 'code', 'sku'], '-'),
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
              qty: pickValue(
                item,
                ['qty', 'quantity', 'moved_qty', 'transfer_qty'],
                '0',
              ),
              notes: pickValue(item, ['notes', 'remarks', 'note'], '-'),
              createdAt: pickValue(
                item,
                ['created_at', 'input_at', 'updated_at', 'submitted_at'],
                '',
              ),
              sourceBin: pickValue(
                transfer,
                ['source_bin_code', 'from_bin_code'],
                pickValue(
                  sourceBin,
                  ['bin_code', 'code', 'location_code', 'name'],
                  '-',
                ),
              ),
              destinationBin: pickValue(
                transfer,
                ['destination_bin_code', 'to_bin_code'],
                pickValue(
                  destinationBin,
                  ['bin_code', 'code', 'location_code', 'name'],
                  '-',
                ),
              ),
            }
          })
          .sort((a, b) => {
            const dateA = new Date(a.createdAt).getTime()
            const dateB = new Date(b.createdAt).getTime()

            if (Number.isNaN(dateA) || Number.isNaN(dateB)) {
              return 0
            }

            return dateA - dateB
          })

        const staffName = resolveStaffName(transfer, profilesById)
        const statusValue = normalizeProcessStatus(
          pickValue(
            transfer,
            ['status', 'transfer_status', 'bin_transfer_status'],
            'DRAFT',
          ),
        )

        return {
          id: transferId,
          transferNumber: resolveTransferNumber(transfer, transferId),
          staffName,
          sourceBin: pickValue(
            transfer,
            ['source_bin_code', 'from_bin_code'],
            pickValue(
              sourceBin,
              ['bin_code', 'code', 'location_code', 'name'],
              '-',
            ),
          ),
          destinationBin: pickValue(
            transfer,
            ['destination_bin_code', 'to_bin_code'],
            pickValue(
              destinationBin,
              ['bin_code', 'code', 'location_code', 'name'],
              '-',
            ),
          ),
          totalRows: detailRows.length,
          totalQty: detailRows.reduce(
            (sum, item) => sum + toNumber(item.qty),
            0,
          ),
          status: statusValue,
          statusDescription: getProcessStatusDescription(statusValue),
          statusNotes: pickValue(
            transfer,
            [
              'status_notes',
              'process_notes',
              'workflow_notes',
              'decision_notes',
              'notes',
              'remarks',
              'note',
            ],
            '',
          ),
          processingByName: pickValue(
            transfer,
            ['processing_by_name'],
            '-',
          ),
          processingAt: pickValue(
            transfer,
            [
              'processing_at',
              'started_at',
              'in_progress_at',
              'updated_at',
            ],
            '',
          ),
          processedByName: pickValue(transfer, ['processed_by_name'], '-'),
          processedAt: pickValue(
            transfer,
            [
              'processed_at',
              'posted_at',
              'completed_at',
              'approved_at',
              'done_at',
            ],
            '',
          ),
          rejectedByName: pickValue(transfer, ['rejected_by_name'], '-'),
          rejectedAt: pickValue(transfer, ['rejected_at'], ''),
          cancelledByName: pickValue(transfer, ['cancelled_by_name'], '-'),
          cancelledAt: pickValue(
            transfer,
            ['cancelled_at', 'canceled_at'],
            '',
          ),
          closedByName: pickValue(transfer, ['closed_by_name'], '-'),
          closedAt: pickValue(transfer, ['closed_at'], ''),
          notes: pickValue(transfer, ['notes', 'remarks', 'note'], '-'),
          createdAt: pickValue(
            transfer,
            ['created_at', 'submitted_at', 'transfer_date'],
            '',
          ),
          detailRows,
        }
      })

      normalizedTransactions.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime()
        const dateB = new Date(b.createdAt).getTime()

        if (Number.isNaN(dateA) || Number.isNaN(dateB)) {
          return 0
        }

        return dateB - dateA
      })

      setTransactions(normalizedTransactions)
    } catch (loadError) {
      console.error(loadError)
      setTransactions([])
      setError(loadError?.message || 'Riwayat Bin to Bin gagal dimuat.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const filteredTransactions = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) {
      return transactions
    }

    return transactions.filter((transaction) =>
      [
        transaction.transferNumber,
        transaction.staffName,
        transaction.sourceBin,
        transaction.destinationBin,
        transaction.status,
        transaction.notes,
      ].some((value) =>
        String(value).toLowerCase().includes(keyword),
      ),
    )
  }, [transactions, search])

  const summary = useMemo(() => {
    const totalStaff = new Set(
      transactions
        .map((transaction) => transaction.staffName)
        .filter(Boolean),
    ).size

    return {
      totalTransactions: transactions.length,
      totalStaff,
      totalRows: transactions.reduce(
        (sum, transaction) => sum + transaction.totalRows,
        0,
      ),
      totalQty: transactions.reduce(
        (sum, transaction) => sum + transaction.totalQty,
        0,
      ),
    }
  }, [transactions])

  const selectedTransfer = useMemo(() => {
    if (!selectedTransferId) {
      return null
    }

    return (
      transactions.find(
        (transaction) => transaction.id === selectedTransferId,
      ) ?? null
    )
  }, [selectedTransferId, transactions])

  const handleStatusAction = async (action) => {
    if (!selectedTransfer) {
      return
    }

    const requiresNote =
      action === 'REJECTED' || action === 'CANCELLED'
    const noteValue = statusNote.trim()

    if (requiresNote && !noteValue) {
      setStatusFeedback({
        type: 'error',
        message: 'Catatan status wajib diisi untuk tindakan ini.',
      })
      return
    }

    const actionLabel = {
      PROCESSING: 'Mulai Proses',
      POSTED: 'Tandai Posted',
      REJECTED: 'Reject',
      CANCELLED: 'Cancel',
      CLOSED: 'Close Transaction',
    }[action]

    // Ganti window.confirm dengan modal
    setConfirmDialog({
      action,
      actionLabel,
      onConfirm: async () => {
        setConfirmDialog(null)
        setUpdatingStatus(true)
        setStatusFeedback({ type: '', message: '' })

        try {
          const actorName =
            (currentUserName || '').trim() ||
            session?.user?.email ||
            'User Warehouse'

          const { data, error: rpcError } = await supabase.rpc(
            'update_bin_transfer_status',
            {
              p_transfer_id: selectedTransfer.id,
              p_action: action,
              p_actor_name: actorName,
              p_notes: noteValue,
            },
          )

          if (rpcError) {
            throw rpcError
          }

          const firstResponse = Array.isArray(data) ? data[0] : data

          if (!firstResponse) {
            throw new Error('Respons RPC kosong.')
          }

          setStatusFeedback({
            type: 'success',
            message: 'Status transaksi berhasil diperbarui.',
          })
          setStatusNote('')
          await loadHistory({ preserveSelection: true })
        } catch (rpcError) {
          console.error(rpcError)
          setStatusFeedback({
            type: 'error',
            message:
              rpcError?.message || 'Gagal memperbarui status transaksi.',
          })
        } finally {
          setUpdatingStatus(false)
        }
      },
    })
  }

  const handleDownloadExcel = () => {
    if (!selectedTransfer) {
      return
    }

    const fileName = `Bin_To_Bin_${safeFilename(selectedTransfer.transferNumber)}.xlsx`

    const summarySheet = utils.aoa_to_sheet([
      ['BCL Warehouse WMS'],
      ['Laporan Bin to Bin'],
      [],
      ['Nomor Transaksi', selectedTransfer.transferNumber],
      ['Staff', selectedTransfer.staffName || '-'],
      ['Tanggal', formatDate(selectedTransfer.createdAt)],
      ['Lokasi Asal', selectedTransfer.sourceBin || '-'],
      ['Lokasi Tujuan', selectedTransfer.destinationBin || '-'],
      ['Status', selectedTransfer.status || '-'],
      ['Status Description', selectedTransfer.statusDescription || '-'],
      ['Status Notes', selectedTransfer.statusNotes || '-'],
      ['Processing By', selectedTransfer.processingByName || '-'],
      ['Processing At', formatDate(selectedTransfer.processingAt)],
      ['Processed By', selectedTransfer.processedByName || '-'],
      ['Processed At', formatDate(selectedTransfer.processedAt)],
      ['Rejected By', selectedTransfer.rejectedByName || '-'],
      ['Rejected At', formatDate(selectedTransfer.rejectedAt)],
      ['Cancelled By', selectedTransfer.cancelledByName || '-'],
      ['Cancelled At', formatDate(selectedTransfer.cancelledAt)],
      ['Closed By', selectedTransfer.closedByName || '-'],
      ['Closed At', formatDate(selectedTransfer.closedAt)],
      ['Total Baris', selectedTransfer.totalRows],
      ['Total Qty', formatQty(selectedTransfer.totalQty)],
      ['Catatan Transaksi', selectedTransfer.notes || '-'],
    ])

    const detailRows = selectedTransfer.detailRows.map((item, index) => [
      index + 1,
      item.skuCode || '-',
      item.skuName || '-',
      formatQty(item.qty),
      item.sourceBin || '-',
      item.destinationBin || '-',
      item.notes || '-',
      formatDate(item.createdAt),
    ])

    const detailSheet = utils.aoa_to_sheet([
      [
        'No',
        'SKU',
        'Deskripsi',
        'Qty',
        'Lokasi Asal',
        'Lokasi Tujuan',
        'Catatan',
        'Waktu Input',
      ],
      ...detailRows,
    ])

    summarySheet['!cols'] = [{ width: 28 }, { width: 38 }]

    detailSheet['!cols'] = [
      { width: 8 },
      { width: 20 },
      { width: 30 },
      { width: 14 },
      { width: 18 },
      { width: 18 },
      { width: 24 },
      { width: 24 },
    ]

    const workbook = utils.book_new()
    utils.book_append_sheet(workbook, summarySheet, 'Ringkasan')
    utils.book_append_sheet(workbook, detailSheet, 'Detail Bin to Bin')
    writeFileXLSX(workbook, fileName)
  }

  return (
    <main className="bbt-page">
      <header className="bbt-header">
        <div>
          <p className="bbt-small-label">BCL Warehouse WMS</p>
          <h1>
            {selectedTransfer
              ? 'Detail Bin to Bin'
              : 'Transaksi Bin to Bin'}
          </h1>
        </div>

        <div className="bbt-header-actions">
          <button
            className="bbt-secondary-button"
            type="button"
            onClick={() => {
              if (selectedTransfer) {
                setSelectedTransferId(null)
                setSearch('')
              } else {
                onBack()
              }
            }}
            title={
              selectedTransfer
                ? 'Kembali ke Daftar Transaksi'
                : 'Kembali ke Dashboard'
            }
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>Kembali</span>
          </button>

          <button
            className="bbt-secondary-button"
            type="button"
            disabled={loading}
            onClick={() =>
              loadHistory({
                preserveSelection: Boolean(selectedTransfer),
              })
            }
          >
            {loading ? 'Memuat...' : 'Refresh'}
          </button>

          {selectedTransfer ? (
            <button
              className="bbt-primary-button"
              type="button"
              onClick={handleDownloadExcel}
            >
              Download Excel
            </button>
          ) : null}

          <button
            className="bbt-secondary-button"
            type="button"
            disabled={loadingLogout}
            onClick={onLogout}
          >
            {loadingLogout ? 'Keluar...' : 'Logout'}
          </button>
        </div>
      </header>

      <section className="bbt-content">
        {selectedTransfer ? (
          <>
            <div className="bbt-detail-card">
              <div className="bbt-detail-header">
                <div>
                  <p className="bbt-label">Nomor Transaksi</p>
                  <h2>{selectedTransfer.transferNumber}</h2>
                </div>
                <div className="bbt-badge-row">
                  <span
                    className={`bbt-status-badge ${getProcessStatusClass(selectedTransfer.status)}`}
                  >
                    {normalizeProcessStatus(selectedTransfer.status)}
                  </span>
                </div>
              </div>

              <div className="bbt-detail-grid">
                <div>
                  <p className="bbt-label">Staff</p>
                  <strong>
                    {selectedTransfer.staffName || currentUserName || '-'}
                  </strong>
                </div>
                <div>
                  <p className="bbt-label">Tanggal</p>
                  <strong>{formatDate(selectedTransfer.createdAt)}</strong>
                </div>
                <div>
                  <p className="bbt-label">Lokasi Asal</p>
                  <strong>{selectedTransfer.sourceBin || '-'}</strong>
                </div>
                <div>
                  <p className="bbt-label">Lokasi Tujuan</p>
                  <strong>{selectedTransfer.destinationBin || '-'}</strong>
                </div>
              </div>

              <div className="bbt-detail-notes">
                <p className="bbt-label">Catatan Transaksi</p>
                <p>{selectedTransfer.notes || '-'}</p>
              </div>
            </div>

            <div className="bbt-status-panel">
              <div className="bbt-status-panel-header">
                <div>
                  <p className="bbt-label">Status Proses Sistem</p>
                  <h3>{selectedTransfer.status}</h3>
                </div>
                <span
                  className={`bbt-status-badge ${getProcessStatusClass(selectedTransfer.status)}`}
                >
                  {normalizeProcessStatus(selectedTransfer.status)}
                </span>
              </div>

              <p className="bbt-status-description">
                {selectedTransfer.statusDescription}
              </p>

              {selectedTransfer.statusNotes ? (
                <div className="bbt-status-field">
                  <p className="bbt-label">Status Notes</p>
                  <p>{selectedTransfer.statusNotes}</p>
                </div>
              ) : null}

              <div className="bbt-status-grid">
                {selectedTransfer.processingByName ||
                selectedTransfer.processingAt ? (
                  <div className="bbt-status-field">
                    <p className="bbt-label">Processing By</p>
                    <p>{selectedTransfer.processingByName || '-'}</p>
                    {selectedTransfer.processingAt ? (
                      <span>
                        {formatDate(selectedTransfer.processingAt)}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {selectedTransfer.processedByName ||
                selectedTransfer.processedAt ? (
                  <div className="bbt-status-field">
                    <p className="bbt-label">Processed By</p>
                    <p>{selectedTransfer.processedByName || '-'}</p>
                    {selectedTransfer.processedAt ? (
                      <span>{formatDate(selectedTransfer.processedAt)}</span>
                    ) : null}
                  </div>
                ) : null}

                {selectedTransfer.rejectedByName ||
                selectedTransfer.rejectedAt ? (
                  <div className="bbt-status-field">
                    <p className="bbt-label">Rejected By</p>
                    <p>{selectedTransfer.rejectedByName || '-'}</p>
                    {selectedTransfer.rejectedAt ? (
                      <span>{formatDate(selectedTransfer.rejectedAt)}</span>
                    ) : null}
                  </div>
                ) : null}

                {selectedTransfer.cancelledByName ||
                selectedTransfer.cancelledAt ? (
                  <div className="bbt-status-field">
                    <p className="bbt-label">Cancelled By</p>
                    <p>{selectedTransfer.cancelledByName || '-'}</p>
                    {selectedTransfer.cancelledAt ? (
                      <span>{formatDate(selectedTransfer.cancelledAt)}</span>
                    ) : null}
                  </div>
                ) : null}

                {selectedTransfer.closedByName ||
                selectedTransfer.closedAt ? (
                  <div className="bbt-status-field">
                    <p className="bbt-label">Closed By</p>
                    <p>{selectedTransfer.closedByName || '-'}</p>
                    {selectedTransfer.closedAt ? (
                      <span>{formatDate(selectedTransfer.closedAt)}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="bbt-status-actions">
                {statusFeedback.message ? (
                  <div
                    className={`bbt-feedback ${
                      statusFeedback.type === 'error'
                        ? 'bbt-feedback-error'
                        : 'bbt-feedback-success'
                    }`}
                  >
                    {statusFeedback.message}
                  </div>
                ) : null}

                {getAllowedStatusActions(selectedTransfer.status).map(
                  (action) => (
                    <button
                      key={action.action}
                      className={
                        action.action === 'REJECTED' ||
                        action.action === 'CANCELLED'
                          ? 'bbt-danger-button'
                          : action.action === 'POSTED' ||
                              action.action === 'CLOSED'
                            ? 'bbt-success-button'
                            : 'bbt-primary-button'
                      }
                      type="button"
                      disabled={updatingStatus || loading}
                      onClick={() => handleStatusAction(action.action)}
                    >
                      {action.label}
                    </button>
                  ),
                )}

                <label
                  className="bbt-status-note-label"
                  htmlFor="status-note"
                >
                  Catatan Status
                </label>
                <textarea
                  id="status-note"
                  className="bbt-status-note"
                  rows="3"
                  value={statusNote}
                  placeholder="Opsional untuk processing/posted/closed, wajib untuk reject/cancel"
                  onChange={(event) => setStatusNote(event.target.value)}
                  disabled={updatingStatus || loading}
                />
              </div>
            </div>

            <div className="bbt-summary-grid">
              <article className="bbt-summary-card">
                <span>Total Baris</span>
                <strong>{selectedTransfer.totalRows}</strong>
              </article>
              <article className="bbt-summary-card">
                <span>Total Qty Dipindahkan</span>
                <strong>{formatQty(selectedTransfer.totalQty)}</strong>
              </article>
              <article className="bbt-summary-card">
                <span>Total Jenis SKU</span>
                <strong>
                  {
                    new Set(
                      selectedTransfer.detailRows.map(
                        (item) => item.skuCode || item.skuName || '-',
                      ),
                    ).size
                  }
                </strong>
              </article>
            </div>

            <div className="bbt-table-card">
              <div className="bbt-table-scroll">
                <table className="bbt-table">
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th>SKU</th>
                      <th>Deskripsi</th>
                      <th>Qty</th>
                      <th>Lokasi Asal</th>
                      <th>Lokasi Tujuan</th>
                      <th>Catatan Item</th>
                      <th>Waktu Input</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTransfer.detailRows.length === 0 ? (
                      <tr>
                        <td className="bbt-empty-table" colSpan="8">
                          Belum ada item pada transaksi ini.
                        </td>
                      </tr>
                    ) : (
                      selectedTransfer.detailRows.map((item, index) => (
                        <tr key={`${selectedTransfer.id}-${index}`}>
                          <td>{index + 1}</td>
                          <td>{item.skuCode || '-'}</td>
                          <td>{item.skuName || '-'}</td>
                          <td>
                            <strong>{formatQty(item.qty)}</strong>
                          </td>
                          <td>{item.sourceBin || '-'}</td>
                          <td>{item.destinationBin || '-'}</td>
                          <td>{item.notes || '-'}</td>
                          <td>{formatDate(item.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="bbt-summary-grid">
              <article className="bbt-summary-card">
                <span>Total Transaksi</span>
                <strong>{summary.totalTransactions}</strong>
              </article>
              <article className="bbt-summary-card">
                <span>Total Staff</span>
                <strong>{summary.totalStaff}</strong>
              </article>
              <article className="bbt-summary-card">
                <span>Total Baris Item</span>
                <strong>{summary.totalRows}</strong>
              </article>
              <article className="bbt-summary-card">
                <span>Total Qty Dipindahkan</span>
                <strong>{formatQty(summary.totalQty)}</strong>
              </article>
            </div>

            <div className="bbt-toolbar">
              <div>
                <h2>Daftar Transaksi Bin to Bin</h2>
                <p>
                  Cari berdasarkan nomor transaksi, staff, lokasi, status,
                  atau catatan.
                </p>
              </div>

              <div className="bbt-toolbar-actions">
                <input
                  className="bbt-search"
                  type="search"
                  value={search}
                  placeholder="Cari transaksi"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="bbt-error-message">
                <strong>Data gagal dimuat</strong>
                <p>{error}</p>
              </div>
            )}

            <div className="bbt-table-card">
              <div className="bbt-table-scroll">
                <table className="bbt-table">
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Nomor Transaksi</th>
                      <th>Staff</th>
                      <th>Lokasi Asal</th>
                      <th>Lokasi Tujuan</th>
                      <th>Total Baris</th>
                      <th>Total Qty</th>
                      <th>Status</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td className="bbt-empty-table" colSpan="9">
                          Memuat transaksi Bin to Bin...
                        </td>
                      </tr>
                    ) : filteredTransactions.length === 0 ? (
                      <tr>
                        <td className="bbt-empty-table" colSpan="9">
                          Belum ada transaksi Bin to Bin.
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td>{formatDate(transaction.createdAt)}</td>
                          <td>
                            <button
                              className="bbt-link-button"
                              type="button"
                              onClick={() =>
                                setSelectedTransferId(transaction.id)
                              }
                            >
                              {transaction.transferNumber}
                            </button>
                          </td>
                          <td>{transaction.staffName || '-'}</td>
                          <td>
                            <span className="bbt-bin-label">
                              {transaction.sourceBin || '-'}
                            </span>
                          </td>
                          <td>
                            <span className="bbt-bin-label">
                              {transaction.destinationBin || '-'}
                            </span>
                          </td>
                          <td>{transaction.totalRows}</td>
                          <td>
                            <strong>{formatQty(transaction.totalQty)}</strong>
                          </td>
                          <td>
                            <span
                              className={`bbt-status-badge ${getProcessStatusClass(transaction.status)}`}
                            >
                              {normalizeProcessStatus(transaction.status)}
                            </span>
                          </td>
                          <td>
                            <button
                              className="bbt-link-button"
                              type="button"
                              onClick={() =>
                                setSelectedTransferId(transaction.id)
                              }
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
          </>
        )}
      </section>

      {/* Modal Konfirmasi - pengganti window.confirm */}
      {confirmDialog ? (
        <div
          className="bbt-confirm-backdrop"
          role="presentation"
          onClick={() => setConfirmDialog(null)}
        >
          <section
            className="bbt-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bbt-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="bbt-confirm-title">Konfirmasi Tindakan</h2>

            <p>
              Apakah Anda yakin ingin{' '}
              <strong>{confirmDialog.actionLabel}</strong> transaksi ini?
            </p>

            <div className="bbt-confirm-actions">
              <button
                className="bbt-secondary-button"
                type="button"
                onClick={() => setConfirmDialog(null)}
              >
                Batal
              </button>

              <button
                className={
                  confirmDialog.action === 'REJECTED' ||
                  confirmDialog.action === 'CANCELLED'
                    ? 'bbt-danger-button'
                    : 'bbt-primary-button'
                }
                type="button"
                onClick={confirmDialog.onConfirm}
              >
                Ya, Lanjutkan
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default BinToBinPage
