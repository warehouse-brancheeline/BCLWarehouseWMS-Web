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
import './HandoverPage.css'

function pickValue(row, keys, fallback = '') {
  if (!row) {
    return fallback
  }

  for (const key of keys) {
    const value = row[key]

    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      return value
    }
  }

  return fallback
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function safeFilename(value) {
  return String(value || 'Handover')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
}

function formatTime(value, fallback = '-') {
  if (!value) {
    return fallback
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return fallback
  }

  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Makassar',
  }).format(date)
}

function getStatusLabel(status) {
  const normalized = String(status || '')
    .trim()
    .toUpperCase()

  switch (normalized) {
    case 'READY_FOR_HANDOVER':
      return 'Siap Handover'
    case 'TERKIRIM':
      return 'Terkirim'
    case 'CANCELLED':
      return 'Dibatalkan'
    case 'CLOSED':
      return 'Ditutup'
    case 'DRAFT':
      return 'Draft'
    default:
      return status || '-'
  }
}

function getStatusKey(status) {
  const normalized = String(status || '')
    .trim()
    .toUpperCase()

  switch (normalized) {
    case 'READY_FOR_HANDOVER':
      return 'READY_FOR_HANDOVER'
    case 'TERKIRIM':
      return 'TERKIRIM'
    case 'CANCELLED':
      return 'CANCELLED'
    case 'CLOSED':
      return 'CLOSED'
    case 'DRAFT':
      return 'DRAFT'
    default:
      return normalized
  }
}

function getStatusClass(status) {
  const normalized = getStatusKey(status)

  switch (normalized) {
    case 'READY_FOR_HANDOVER':
      return 'handover-status-warning'
    case 'TERKIRIM':
      return 'handover-status-success'
    case 'CANCELLED':
      return 'handover-status-danger'
    case 'CLOSED':
      return 'handover-status-muted'
    default:
      return 'handover-status-default'
  }
}

function getVerificationLabel(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()

  switch (normalized) {
    case 'VERIFIED':
      return 'Format Sesuai'
    case 'UNVERIFIED_FORMAT':
    case 'UNVERIFIED_NOT_FOUND':
      return 'Ditambahkan Manual'
    case 'PENDING_VALIDATION':
      return 'Belum Divalidasi'
    default:
      return value || '-'
  }
}

function getVerificationClass(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()

  if (normalized === 'VERIFIED') {
    return 'handover-pill-success'
  }

  if (
    normalized === 'UNVERIFIED_FORMAT' ||
    normalized === 'UNVERIFIED_NOT_FOUND'
  ) {
    return 'handover-pill-warning'
  }

  return 'handover-pill-default'
}

function getGroupOperationalDate(group) {
  return group.submitted_at || group.created_at
}

function getWitaDateKey(isoValue) {
  if (!isoValue) {
    return null
  }

  const timestamp = new Date(isoValue).getTime()

  if (Number.isNaN(timestamp)) {
    return null
  }

  const WITA_OFFSET_MS = 8 * 60 * 60 * 1000
  const witaDate = new Date(timestamp + WITA_OFFSET_MS)

  return [
    witaDate.getUTCFullYear(),
    String(witaDate.getUTCMonth() + 1).padStart(2, '0'),
    String(witaDate.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function HandoverPage({
  session,
  loadingLogout,
  onBack,
  onLogout,
}) {
  const [groups, setGroups] = useState([])
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [search, setSearch] = useState('')
  const [detailSearch, setDetailSearch] = useState('')
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    courier: '',
    status: 'ALL',
  })
  const [dateValidationError, setDateValidationError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [previewImage, setPreviewImage] = useState(null)
  const [photoLoadError, setPhotoLoadError] = useState(false)
  const [signatureLoadError, setSignatureLoadError] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [
        groupsResult,
        couriersResult,
        eventGroupsResult,
        eventsResult,
        itemsResult,
      ] = await Promise.all([
        supabase
          .from('handover_groups')
          .select('*')
          .order('created_at', {
            ascending: false,
          }),
        supabase
          .from('couriers')
          .select('*'),
        supabase
          .from('handover_event_groups')
          .select('*'),
        supabase
          .from('handover_events')
          .select('*')
          .order('created_at', {
            ascending: false,
          }),
        supabase
          .from('handover_items')
          .select('*')
          .order('scan_sequence', {
            ascending: true,
          }),
      ])

      if (groupsResult.error) {
        throw groupsResult.error
      }

      if (couriersResult.error) {
        throw couriersResult.error
      }

      if (eventGroupsResult.error) {
        throw eventGroupsResult.error
      }

      if (eventsResult.error) {
        throw eventsResult.error
      }

      if (itemsResult.error) {
        throw itemsResult.error
      }

      const couriersById = new Map(
        (couriersResult.data ?? []).map((courier) => [
          String(courier.id),
          courier,
        ]),
      )

      const eventsById = new Map(
        (eventsResult.data ?? []).map((event) => [
          String(event.id),
          event,
        ]),
      )

      const itemsByGroupId = new Map()
      ;(itemsResult.data ?? []).forEach((item) => {
        const groupId = String(
          pickValue(item, ['handover_group_id'], ''),
        )

        if (!groupId) {
          return
        }

        if (!itemsByGroupId.has(groupId)) {
          itemsByGroupId.set(groupId, [])
        }

        itemsByGroupId.get(groupId).push(item)
      })

      const eventMap = new Map()
      ;(eventGroupsResult.data ?? []).forEach((relation) => {
        const groupId = String(
          pickValue(relation, ['handover_group_id'], ''),
        )
        const eventId = String(
          pickValue(relation, ['handover_event_id'], ''),
        )

        if (!groupId || !eventId) {
          return
        }

        const event = eventsById.get(eventId)

        if (event) {
          eventMap.set(groupId, event)
        }
      })

      const normalizedGroups = (groupsResult.data ?? []).map((group) => {
        const groupId = String(group.id)
        const courier = couriersById.get(
          String(group.courier_id || ''),
        )
        const items = itemsByGroupId.get(groupId) ?? []
        const event = eventMap.get(groupId)

        return {
          ...group,
          courierName: courier?.name || '-',
          courierCode: courier?.code || '-',
          items,
          event,
        }
      })

      setGroups(normalizedGroups)

      if (selectedGroupId) {
        const stillExists = normalizedGroups.some(
          (group) => String(group.id) === selectedGroupId,
        )

        if (!stillExists) {
          setSelectedGroupId(null)
        }
      }
    } catch (loadError) {
      console.error('Gagal memuat data handover:', loadError)
      setError(
        'Gagal memuat data handover. Silakan coba lagi.',
      )
    } finally {
      setLoading(false)
    }
  }, [selectedGroupId])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!toast) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setToast('')
    }, 2400)

    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (
      filters.startDate &&
      filters.endDate &&
      filters.startDate > filters.endDate
    ) {
      setDateValidationError('Tanggal mulai tidak boleh melewati tanggal akhir.')
    } else {
      setDateValidationError('')
    }
  }, [filters.startDate, filters.endDate])

  const availableCouriers = useMemo(() => {
    const courierNames = new Set(
      groups
        .map((group) => group.courierName)
        .filter(Boolean),
    )

    return Array.from(courierNames).sort((left, right) =>
      String(left).localeCompare(String(right), 'id-ID'),
    )
  }, [groups])

  const filteredGroups = useMemo(() => {
    const searchText = search.trim().toLowerCase()

    return groups.filter((group, index) => {
      const courierName = String(group.courierName || '')
        .toLowerCase()
      const groupNumber = String(group.group_number || '')
        .toLowerCase()
      const createdBy = String(group.created_by_name || '')
        .toLowerCase()
      const staffName = String(
        group.handed_over_by_name || group.created_by_name || '',
      ).toLowerCase()
      const trackingMatches = (group.items || []).some((item) => {
        const trackingNumber = String(
          item.tracking_number || '',
        ).toLowerCase()
        const normalizedTracking = String(
          item.tracking_number_normalized || '',
        ).toLowerCase()

        return (
          trackingNumber.includes(searchText) ||
          normalizedTracking.includes(searchText)
        )
      })

      const matchesSearch =
        !searchText ||
        groupNumber.includes(searchText) ||
        courierName.includes(searchText) ||
        createdBy.includes(searchText) ||
        staffName.includes(searchText) ||
        trackingMatches

      const operationalDate = getGroupOperationalDate(group)
      const operationalDateKey = getWitaDateKey(operationalDate)

      const matchesStartDate =
        !filters.startDate || operationalDateKey >= filters.startDate
      const matchesEndDate =
        !filters.endDate || operationalDateKey <= filters.endDate

      const matchesDate = matchesStartDate && matchesEndDate

      // Debug untuk 2 data pertama
      if (index < 2 && (filters.startDate || filters.endDate)) {
        console.debug('Handover date filter', {
          groupNumber: group.group_number,
          sourceDate: operationalDate,
          operationalDateKey,
          startDate: filters.startDate,
          endDate: filters.endDate,
          matchesDate,
        })
      }

      const matchesCourier =
        !filters.courier ||
        courierName === filters.courier.toLowerCase()

      const matchesStatus =
        filters.status === 'ALL' ||
        getStatusKey(group.status) === filters.status

      return (
        matchesSearch &&
        matchesDate &&
        matchesCourier &&
        matchesStatus
      )
    })
  }, [filters, groups, search])

  const selectedGroup = useMemo(() => {
    if (!selectedGroupId) {
      return null
    }

    return (
      groups.find(
        (group) => String(group.id) === selectedGroupId,
      ) || null
    )
  }, [groups, selectedGroupId])

  const filteredItems = useMemo(() => {
    if (!selectedGroup) {
      return []
    }

    const searchText = detailSearch.trim().toLowerCase()

    return (selectedGroup.items || []).filter((item) => {
      if (!searchText) {
        return true
      }

      const trackingNumber = String(
        item.tracking_number || '',
      ).toLowerCase()
      const normalizedTracking = String(
        item.tracking_number_normalized || '',
      ).toLowerCase()

      return (
        trackingNumber.includes(searchText) ||
        normalizedTracking.includes(searchText)
      )
    })
  }, [detailSearch, selectedGroup])

  const summaryValues = useMemo(() => {
    const totalGroups = filteredGroups.length
    const readyCount = filteredGroups.filter(
      (group) => getStatusKey(group.status) === 'READY_FOR_HANDOVER',
    ).length
    const deliveredCount = filteredGroups.filter(
      (group) => getStatusKey(group.status) === 'TERKIRIM',
    ).length
    const totalPackages = filteredGroups.reduce(
      (sum, group) =>
        sum + toNumber(group.package_count || group.items?.length || 0),
      0,
    )

    return {
      totalGroups,
      readyCount,
      deliveredCount,
      totalPackages,
    }
  }, [filteredGroups])

  const handleRefresh = () => {
    loadData()
  }

  const handleCopyTracking = async (trackingNumber) => {
    if (!trackingNumber) {
      return
    }

    try {
      await navigator.clipboard.writeText(trackingNumber)
      setToast('Nomor resi berhasil disalin.')
    } catch (copyError) {
      console.error('Gagal menyalin resi:', copyError)
      setToast('Gagal menyalin nomor resi.')
    }
  }

  const handleDownloadListExcel = () => {
    const workbook = utils.book_new()

    const summaryRows = filteredGroups.map((group) => ({
      'Nomor Group': group.group_number || '-',
      Ekspedisi: group.courierName || '-',
      Status: getStatusLabel(group.status),
      'Total Paket': group.package_count || group.items?.length || 0,
      Duplicate: group.duplicate_count || 0,
      'Ditambahkan Manual': group.unverified_count || 0,
      'Dibuat Oleh': group.created_by_name || '-',
      'Waktu Submit': formatTime(
        group.submitted_at || group.created_at,
      ),
      'Nama Kurir': group.event?.courier_name || group.courierName || '-',
      'Dikirim Oleh': group.event?.handed_over_by_name || group.handed_over_by_name || '-',
      'Waktu Dikirim': formatTime(
        group.event?.handed_over_at || group.handed_over_at,
      ),
      'Nomor Event': group.event?.event_number || '-',
    }))

    const detailRows = filteredGroups.flatMap((group) =>
      (group.items || []).map((item, index) => ({
        'Nomor Group': group.group_number || '-',
        Ekspedisi: group.courierName || '-',
        'Status Group': getStatusLabel(group.status),
        No: index + 1,
        'Nomor Resi': item.tracking_number || '-',
        'Status Validasi': getVerificationLabel(
          item.verification_status,
        ),
        Duplicate: item.duplicate_override ? 'Duplicate Diizinkan' : '-',
        'Alasan Override': item.override_reason || '-',
        'Staff Scan': item.scanned_by_name || '-',
        'Waktu Scan': formatTime(item.scanned_at),
        'Nama Kurir': group.event?.courier_name || group.courierName || '-',
        'Nomor Event': group.event?.event_number || '-',
      })),
    )

    const summarySheet = utils.json_to_sheet(summaryRows)
    const detailSheet = utils.json_to_sheet(detailRows)
    utils.book_append_sheet(workbook, summarySheet, 'Summary Handover')
    utils.book_append_sheet(workbook, detailSheet, 'Detail Resi')

    const stamp = new Date()
    const fileName = `Handover_${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}_${String(stamp.getHours()).padStart(2, '0')}${String(stamp.getMinutes()).padStart(2, '0')}.xlsx`

    writeFileXLSX(workbook, fileName)
    setToast('File Excel berhasil diunduh.')
  }

  const handleDownloadDetailExcel = () => {
    if (!selectedGroup) {
      return
    }

    const workbook = utils.book_new()
    const groupSummaryRows = [
      {
        'Nomor Group': selectedGroup.group_number || '-',
        Ekspedisi: selectedGroup.courierName || '-',
        Status: getStatusLabel(selectedGroup.status),
        'Total Paket': selectedGroup.package_count || selectedGroup.items?.length || 0,
        Duplicate: selectedGroup.duplicate_count || 0,
        'Ditambahkan Manual': selectedGroup.unverified_count || 0,
        'Dibuat Oleh': selectedGroup.created_by_name || '-',
        'Waktu Submit': formatTime(
          selectedGroup.submitted_at || selectedGroup.created_at,
        ),
        'Dikirim Oleh': selectedGroup.event?.handed_over_by_name || selectedGroup.handed_over_by_name || '-',
        'Waktu Dikirim': formatTime(
          selectedGroup.event?.handed_over_at || selectedGroup.handed_over_at,
        ),
        'Nama Kurir': selectedGroup.event?.courier_name || selectedGroup.courierName || '-',
        'Nomor Event': selectedGroup.event?.event_number || '-',
      },
    ]

    const itemsRows = (selectedGroup.items || []).map((item, index) => ({
      No: index + 1,
      'Nomor Resi': item.tracking_number || '-',
      'Status Validasi': getVerificationLabel(item.verification_status),
      Duplicate: item.duplicate_override ? 'Duplicate Diizinkan' : '-',
      'Alasan Override': item.override_reason || '-',
      'Staff Scan': item.scanned_by_name || '-',
      'Waktu Scan': formatTime(item.scanned_at),
      Catatan: item.notes || '-',
    }))

    const proofRows = [
      {
        'Nomor Event': selectedGroup.event?.event_number || '-',
        'Nama Kurir': selectedGroup.event?.courier_name || selectedGroup.courierName || '-',
        'Dikirim Oleh': selectedGroup.event?.handed_over_by_name || selectedGroup.handed_over_by_name || '-',
        'Tanggal dan Jam': formatTime(
          selectedGroup.event?.handed_over_at || selectedGroup.handed_over_at,
        ),
        'Path Foto Kurir': selectedGroup.event?.courier_photo_path || '-',
        'Path Tanda Tangan': selectedGroup.event?.signature_path || '-',
        Catatan: selectedGroup.event?.proof_notes || selectedGroup.event?.notes || '-',
      },
    ]

    const summarySheet = utils.json_to_sheet(groupSummaryRows)
    const itemsSheet = utils.json_to_sheet(itemsRows)
    const proofSheet = utils.json_to_sheet(proofRows)
    utils.book_append_sheet(workbook, summarySheet, 'Group Summary')
    utils.book_append_sheet(workbook, itemsSheet, 'Daftar Resi')
    utils.book_append_sheet(workbook, proofSheet, 'Bukti Handover')

    const fileName = `${safeFilename(selectedGroup.group_number || 'group')}.xlsx`
    writeFileXLSX(workbook, fileName)
    setToast('File Excel detail berhasil diunduh.')
  }

  const renderListView = () => (
    <>
      <header className="handover-page-header">
        <div className="handover-header-left">
          {onBack ? (
            <button
              className="handover-back-button"
              type="button"
              onClick={onBack}
              title="Kembali ke Dashboard"
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
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>Kembali</span>
            </button>
          ) : null}

          <div>
            <p className="small-label">BCL Warehouse WMS</p>
            <h1>Handover</h1>
            <p className="handover-page-subtitle">
              Monitoring serah terima paket kepada kurir.
            </p>
          </div>
        </div>

        <div className="handover-header-actions">
          <button
            className="handover-action-button handover-action-button--secondary"
            type="button"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? 'Memuat...' : 'Refresh'}
          </button>

          <button
            className="handover-action-button handover-action-button--primary"
            type="button"
            onClick={handleDownloadListExcel}
            disabled={loading || filteredGroups.length === 0 || Boolean(dateValidationError)}
          >
            Download Excel
          </button>

          <button
            className="handover-action-button handover-action-button--secondary"
            type="button"
            disabled={loadingLogout}
            onClick={onLogout}
          >
            {loadingLogout ? 'Keluar...' : 'Logout'}
          </button>
        </div>
      </header>

      <section className="handover-page-content">
        <div className="handover-summary-grid">
          <article className="handover-summary-card">
            <p>Total Group</p>
            <strong>
              {loading ? 'Memuat...' : summaryValues.totalGroups}
            </strong>
          </article>

          <article className="handover-summary-card">
            <p>Siap Handover</p>
            <strong>
              {loading ? 'Memuat...' : summaryValues.readyCount}
            </strong>
          </article>

          <article className="handover-summary-card">
            <p>Terkirim</p>
            <strong>
              {loading ? 'Memuat...' : summaryValues.deliveredCount}
            </strong>
          </article>

          <article className="handover-summary-card">
            <p>Total Paket</p>
            <strong>
              {loading ? 'Memuat...' : summaryValues.totalPackages}
            </strong>
          </article>
        </div>

        <div className="handover-controls-card">
          <div className="handover-filter-grid">
            <label className="handover-input-group">
              <span>Tanggal Mulai</span>
              <input
                type="date"
                value={filters.startDate}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    startDate: event.target.value,
                  }))
                }
              />
            </label>

            <label className="handover-input-group">
              <span>Tanggal Akhir</span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    endDate: event.target.value,
                  }))
                }
              />
            </label>

            <label className="handover-input-group">
              <span>Ekspedisi</span>
              <select
                value={filters.courier}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    courier: event.target.value,
                  }))
                }
              >
                <option value="">Semua</option>
                {availableCouriers.map((courier) => (
                  <option key={courier} value={courier}>
                    {courier}
                  </option>
                ))}
              </select>
            </label>

            <label className="handover-input-group">
              <span>Status</span>
              <select
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
              >
                <option value="ALL">Semua</option>
                <option value="READY_FOR_HANDOVER">
                  Siap Handover
                </option>
                <option value="TERKIRIM">Terkirim</option>
                <option value="CANCELLED">Dibatalkan</option>
                <option value="CLOSED">Ditutup</option>
              </select>
            </label>
          </div>

          {dateValidationError ? (
            <div className="handover-error-message" style={{ marginBottom: '1rem', color: '#e74c3c' }}>
              <p>{dateValidationError}</p>
            </div>
          ) : null}

          <div className="handover-search-row">
            <label className="handover-input-group handover-search-group">
              <span>Cari nomor group, resi, ekspedisi, staff, atau kurir</span>
              <input
                type="search"
                value={search}
                placeholder="Ketik kata kunci..."
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setSearch('')
                setFilters({
                  startDate: '',
                  endDate: '',
                  courier: '',
                  status: 'ALL',
                })
                setDateValidationError('')
              }}
            >
              Reset Filter
            </button>
          </div>
        </div>

        {error ? (
          <div className="handover-error-card">
            <p>{error}</p>
            <button
              className="secondary-button"
              type="button"
              onClick={handleRefresh}
            >
              Coba Lagi
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="handover-loading-card">
            <div className="spinner" />
            <p>Memuat data handover...</p>
          </div>
        ) : null}

        {!loading && !error && filteredGroups.length === 0 ? (
          <div className="handover-empty-card">
            <p>Belum ada data Handover.</p>
          </div>
        ) : null}

        {!loading && !error && filteredGroups.length > 0 ? (
          <>
            <div className="handover-table-wrapper">
              <table className="handover-table">
                <thead>
                  <tr>
                    <th>Nomor Group</th>
                    <th>Tanggal Submit</th>
                    <th>Ekspedisi</th>
                    <th>Total Paket</th>
                    <th>Duplicate</th>
                    <th>Manual</th>
                    <th>Dibuat Oleh</th>
                    <th>Status</th>
                    <th>Waktu Terkirim</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.map((group) => (
                    <tr key={group.id}>
                      <td>
                        <button
                          className="handover-link-button"
                          type="button"
                          onClick={() => setSelectedGroupId(String(group.id))}
                        >
                          {group.group_number || '-'}
                        </button>
                      </td>
                      <td>{formatTime(group.submitted_at || group.created_at)}</td>
                      <td>{group.courierName || '-'}</td>
                      <td>{group.package_count || group.items?.length || 0}</td>
                      <td>{group.duplicate_count || 0}</td>
                      <td>{group.unverified_count || 0}</td>
                      <td>{group.created_by_name || '-'}</td>
                      <td>
                        <span className={`handover-status-badge ${getStatusClass(group.status)}`}>
                          {getStatusLabel(group.status)}
                        </span>
                      </td>
                      <td>{formatTime(group.event?.handed_over_at || group.handed_over_at)}</td>
                      <td>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => setSelectedGroupId(String(group.id))}
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="handover-mobile-list">
              {filteredGroups.map((group) => (
                <article className="handover-mobile-card" key={group.id}>
                  <div className="handover-mobile-card-header">
                    <button
                      className="handover-link-button"
                      type="button"
                      onClick={() => setSelectedGroupId(String(group.id))}
                    >
                      {group.group_number || '-'}
                    </button>
                    <span className={`handover-status-badge ${getStatusClass(group.status)}`}>
                      {getStatusLabel(group.status)}
                    </span>
                  </div>

                  <p><strong>Tanggal Submit:</strong> {formatTime(group.submitted_at || group.created_at)}</p>
                  <p><strong>Ekspedisi:</strong> {group.courierName || '-'}</p>
                  <p><strong>Total Paket:</strong> {group.package_count || group.items?.length || 0}</p>
                  <p><strong>Duplicate:</strong> {group.duplicate_count || 0}</p>
                  <p><strong>Manual:</strong> {group.unverified_count || 0}</p>
                  <p><strong>Dibuat Oleh:</strong> {group.created_by_name || '-'}</p>
                  <p><strong>Waktu Terkirim:</strong> {formatTime(group.event?.handed_over_at || group.handed_over_at)}</p>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setSelectedGroupId(String(group.id))}
                  >
                    Detail
                  </button>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </>
  )

  const renderDetailView = () => {
    if (!selectedGroup) {
      return null
    }

    const proofAvailable = Boolean(
      selectedGroup.event?.courier_photo_path ||
        selectedGroup.event?.signature_path,
    )

    return (
      <>
        <header className="handover-page-header">
          <div className="handover-header-left">
            <button
              className="handover-back-button"
              type="button"
              onClick={() => setSelectedGroupId(null)}
              title="Kembali ke List Handover"
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
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>Kembali ke Handover</span>
            </button>

            <div>
              <p className="small-label">BCL Warehouse WMS</p>
              <h1>Detail Group Handover</h1>
            </div>
          </div>

          <div className="handover-header-actions">
            <button
              className="handover-action-button handover-action-button--secondary"
              type="button"
              onClick={handleRefresh}
              disabled={loading}
            >
              {loading ? 'Memuat...' : 'Refresh'}
            </button>

            <button
              className="handover-action-button handover-action-button--primary"
              type="button"
              onClick={handleDownloadDetailExcel}
            >
              Download Excel
            </button>
          </div>
        </header>

        <section className="handover-page-content">
          <div className="handover-detail-summary">
            <div className="handover-detail-card">
              <p className="handover-detail-label">Nomor Group</p>
              <strong>{selectedGroup.group_number || '-'}</strong>
            </div>
            <div className="handover-detail-card">
              <p className="handover-detail-label">Ekspedisi</p>
              <strong>{selectedGroup.courierName || '-'}</strong>
            </div>
            <div className="handover-detail-card">
              <p className="handover-detail-label">Status</p>
              <strong className={`handover-status-badge ${getStatusClass(selectedGroup.status)}`}>
                {getStatusLabel(selectedGroup.status)}
              </strong>
            </div>
            <div className="handover-detail-card">
              <p className="handover-detail-label">Total Paket</p>
              <strong>{selectedGroup.package_count || selectedGroup.items?.length || 0}</strong>
            </div>
            <div className="handover-detail-card">
              <p className="handover-detail-label">Duplicate</p>
              <strong>{selectedGroup.duplicate_count || 0}</strong>
            </div>
            <div className="handover-detail-card">
              <p className="handover-detail-label">Ditambahkan Manual</p>
              <strong>{selectedGroup.unverified_count || 0}</strong>
            </div>
            <div className="handover-detail-card">
              <p className="handover-detail-label">Dibuat Oleh</p>
              <strong>{selectedGroup.created_by_name || '-'}</strong>
            </div>
            <div className="handover-detail-card">
              <p className="handover-detail-label">Waktu Submit</p>
              <strong>{formatTime(selectedGroup.submitted_at || selectedGroup.created_at)}</strong>
            </div>
          </div>

          {getStatusKey(selectedGroup.status) === 'TERKIRIM' ? (
            <div className="handover-detail-card handover-delivery-card">
              <div className="handover-delivery-grid">
                <div>
                  <p className="handover-detail-label">Dikirim Oleh</p>
                  <strong>{selectedGroup.event?.handed_over_by_name || selectedGroup.handed_over_by_name || '-'}</strong>
                </div>
                <div>
                  <p className="handover-detail-label">Waktu Dikirim</p>
                  <strong>{formatTime(selectedGroup.event?.handed_over_at || selectedGroup.handed_over_at)}</strong>
                </div>
                <div>
                  <p className="handover-detail-label">Nama Kurir</p>
                  <strong>{selectedGroup.event?.courier_name || selectedGroup.courierName || '-'}</strong>
                </div>
                <div>
                  <p className="handover-detail-label">Nomor Event</p>
                  <strong>{selectedGroup.event?.event_number || '-'}</strong>
                </div>
              </div>
            </div>
          ) : null}

          <section className="handover-section-card">
            <div className="handover-section-header">
              <h2>Daftar Resi ({filteredItems.length})</h2>
              <label className="handover-input-group handover-search-group">
                <span>Cari nomor resi</span>
                <input
                  type="search"
                  value={detailSearch}
                  placeholder="Ketik nomor resi"
                  onChange={(event) => setDetailSearch(event.target.value)}
                />
              </label>
            </div>

            <div className="handover-table-wrapper">
              <table className="handover-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Nomor Resi</th>
                    <th>Status Validasi</th>
                    <th>Duplicate</th>
                    <th>Staff Scan</th>
                    <th>Waktu Scan</th>
                    <th>Alasan Override</th>
                    <th>Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, index) => {
                    const duplicateNote = item.duplicate_override
                      ? item.duplicate_source_group_id
                        ? (() => {
                            const sourceGroup = groups.find(
                              (group) =>
                                String(group.id) === String(item.duplicate_source_group_id),
                            )

                            return sourceGroup?.group_number
                              ? `Duplicate dari ${sourceGroup.group_number}`
                              : 'Duplicate dari group lain'
                          })()
                        : 'Duplicate Diizinkan'
                      : '-'

                    return (
                      <tr key={item.id || `${selectedGroup.id}-${index}`}>
                        <td>{index + 1}</td>
                        <td>
                          <div className="handover-tracking-cell">
                            <span>{item.tracking_number || '-'}</span>
                            <button
                              className="secondary-button handover-copy-button"
                              type="button"
                              onClick={() => handleCopyTracking(item.tracking_number)}
                            >
                              Salin
                            </button>
                          </div>
                        </td>
                        <td>
                          <span className={`handover-pill ${getVerificationClass(item.verification_status)}`}>
                            {getVerificationLabel(item.verification_status)}
                          </span>
                        </td>
                        <td>
                          {item.duplicate_override ? (
                            <span className="handover-pill handover-pill-warning">
                              Duplicate Diizinkan
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td>{item.scanned_by_name || '-'}</td>
                        <td>{formatTime(item.scanned_at)}</td>
                        <td>{item.override_reason || '-'}</td>
                        <td>{item.notes || '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="handover-mobile-list">
              {filteredItems.map((item, index) => {
                const duplicateNote = item.duplicate_override
                  ? item.duplicate_source_group_id
                    ? (() => {
                        const sourceGroup = groups.find(
                          (group) =>
                            String(group.id) === String(item.duplicate_source_group_id),
                        )

                        return sourceGroup?.group_number
                          ? `Duplicate dari ${sourceGroup.group_number}`
                          : 'Duplicate dari group lain'
                      })()
                    : 'Duplicate Diizinkan'
                  : '-'

                return (
                  <article className="handover-mobile-card" key={item.id || `${selectedGroup.id}-${index}`}>
                    <div className="handover-mobile-card-header">
                      <strong>{item.tracking_number || '-'}</strong>
                      <button
                        className="secondary-button handover-copy-button"
                        type="button"
                        onClick={() => handleCopyTracking(item.tracking_number)}
                      >
                        Salin
                      </button>
                    </div>
                    <p><strong>Status Validasi:</strong> {getVerificationLabel(item.verification_status)}</p>
                    <p><strong>Duplicate:</strong> {duplicateNote}</p>
                    <p><strong>Staff Scan:</strong> {item.scanned_by_name || '-'}</p>
                    <p><strong>Waktu Scan:</strong> {formatTime(item.scanned_at)}</p>
                    <p><strong>Alasan Override:</strong> {item.override_reason || '-'}</p>
                    <p><strong>Catatan:</strong> {item.notes || '-'}</p>
                  </article>
                )
              })}
            </div>
          </section>

          <section className="handover-section-card">
            <div className="handover-section-header">
              <h2>Bukti Serah Terima</h2>
            </div>

            {getStatusKey(selectedGroup.status) === 'READY_FOR_HANDOVER' || !proofAvailable ? (
              <div className="handover-empty-card">
                <p>Belum diserahkan kepada kurir.</p>
                <p className="handover-muted-text">
                  Foto dan tanda tangan akan tampil setelah proses handover selesai melalui aplikasi Android.
                </p>
              </div>
            ) : (
              <div className="handover-proof-grid">
                <article className="handover-proof-card">
                  <div className="handover-proof-card-header">
                    <h3>Foto Kurir</h3>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setPreviewImage(selectedGroup.event?.courier_photo_path || null)}
                    >
                      Buka Foto
                    </button>
                  </div>

                  {selectedGroup.event?.courier_photo_path ? (
                    <>
                      <div className="handover-image-frame">
                        <img
                          src={(() => {
                            const { data } = supabase.storage.from('handover-proofs').getPublicUrl(selectedGroup.event.courier_photo_path)
                            return data.publicUrl
                          })()}
                          alt="Foto kurir"
                          className="handover-proof-image"
                          onError={() => setPhotoLoadError(true)}
                        />
                      </div>
                      {photoLoadError ? (
                        <p className="handover-muted-text">Foto tidak dapat dimuat.</p>
                      ) : null}
                    </>
                  ) : (
                    <p className="handover-muted-text">Foto kurir belum tersedia.</p>
                  )}

                  <p className="handover-proof-timestamp">
                    {formatTime(selectedGroup.event?.proof_captured_at || selectedGroup.event?.handed_over_at || selectedGroup.handed_over_at)}
                  </p>
                </article>

                <article className="handover-proof-card">
                  <div className="handover-proof-card-header">
                    <h3>Tanda Tangan Digital</h3>
                  </div>

                  {selectedGroup.event?.signature_path ? (
                    <div className="handover-signature-frame">
                      <img
                        src={(() => {
                          const { data } = supabase.storage.from('handover-proofs').getPublicUrl(selectedGroup.event.signature_path)
                          return data.publicUrl
                        })()}
                        alt="Tanda tangan digital"
                        className="handover-signature-image"
                        onError={() => setSignatureLoadError(true)}
                      />
                    </div>
                  ) : (
                    <p className="handover-muted-text">Tanda tangan belum tersedia.</p>
                  )}

                  {signatureLoadError ? (
                    <p className="handover-muted-text">Tanda tangan tidak dapat dimuat.</p>
                  ) : null}
                </article>
              </div>
            )}

            {selectedGroup.event ? (
              <div className="handover-proof-details">
                <div>
                  <p className="handover-detail-label">Nomor Event</p>
                  <strong>{selectedGroup.event.event_number || '-'}</strong>
                </div>
                <div>
                  <p className="handover-detail-label">Nama Kurir</p>
                  <strong>{selectedGroup.event.courier_name || selectedGroup.courierName || '-'}</strong>
                </div>
                <div>
                  <p className="handover-detail-label">Ekspedisi</p>
                  <strong>{selectedGroup.event.courier_name || selectedGroup.courierName || '-'}</strong>
                </div>
                <div>
                  <p className="handover-detail-label">Total Group dalam Event</p>
                  <strong>{selectedGroup.event.total_groups || 0}</strong>
                </div>
                <div>
                  <p className="handover-detail-label">Total Paket dalam Event</p>
                  <strong>{selectedGroup.event.total_packages || 0}</strong>
                </div>
                <div>
                  <p className="handover-detail-label">Dikirim Oleh</p>
                  <strong>{selectedGroup.event.handed_over_by_name || '-'}</strong>
                </div>
                <div>
                  <p className="handover-detail-label">Tanggal dan Jam</p>
                  <strong>{formatTime(selectedGroup.event.handed_over_at)}</strong>
                </div>
                <div>
                  <p className="handover-detail-label">Catatan</p>
                  <strong>{selectedGroup.event.notes || selectedGroup.event.proof_notes || '-'}</strong>
                </div>
              </div>
            ) : null}
          </section>
        </section>
      </>
    )
  }

  return (
    <main className="handover-page">
      {selectedGroup ? renderDetailView() : renderListView()}

      {toast ? (
        <div className="handover-toast">{toast}</div>
      ) : null}

      {previewImage ? (
        <div
          className="handover-modal-backdrop"
          role="presentation"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="handover-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={(() => {
                const { data } = supabase.storage.from('handover-proofs').getPublicUrl(previewImage)
                return data.publicUrl
              })()}
              alt="Preview foto kurir"
              className="handover-modal-image"
            />
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default HandoverPage
