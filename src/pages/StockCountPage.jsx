import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { supabase } from '../lib/supabase'
import './StockCountPage.css'

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

function formatDate(value) {
  if (!value) {
    return '-'
  }

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return String(value)
  }

  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsedDate)
}

function formatQty(value) {
  const numberValue = Number(value)

  if (Number.isNaN(numberValue)) {
    return value || '0'
  }

  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 2,
  }).format(numberValue)
}

function normalizeStatus(value) {
  return String(value || 'SUBMITTED')
    .trim()
    .toUpperCase()
}

function getStatusClass(status) {
  const normalized = normalizeStatus(status)

  if (normalized === 'DRAFT') {
    return 'stock-status-draft'
  }

  if (normalized === 'IN_PROGRESS') {
    return 'stock-status-progress'
  }

  if (normalized === 'APPROVED') {
    return 'stock-status-approved'
  }

  if (normalized === 'REJECTED') {
    return 'stock-status-rejected'
  }

  if (normalized === 'ADJUSTED') {
    return 'stock-status-adjusted'
  }

  if (normalized === 'REVIEWED') {
    return 'stock-status-reviewed'
  }

  return 'stock-status-submitted'
}

function getVarianceClass(value) {
  const numberValue = Number(value) || 0

  if (numberValue > 0) {
    return 'variance-positive'
  }

  if (numberValue < 0) {
    return 'variance-negative'
  }

  return 'variance-zero'
}

function StockCountPage({
  loadingLogout,
  onBack,
  onLogout,
}) {
  const [rows, setRows] = useState([])
  const [sessionTotal, setSessionTotal] =
    useState(0)

  const [search, setSearch] =
    useState('')

  const [statusFilter, setStatusFilter] =
    useState('ALL')

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [
        countResult,
        itemResult,
      ] = await Promise.all([
        supabase
          .from('stock_count_sessions')
          .select('*')
          .limit(300),

        supabase
          .from('stock_count_items')
          .select('*')
          .limit(3000),
      ])

      if (countResult.error) {
        throw countResult.error
      }

      if (itemResult.error) {
        throw itemResult.error
      }

      const counts =
        countResult.data ?? []

      const allItems =
        itemResult.data ?? []

      setSessionTotal(counts.length)

      const countIds = new Set(
        counts.map((count) =>
          String(
            pickValue(
              count,
              ['id'],
              '',
            ),
          ),
        ),
      )

      const items = allItems.filter((item) => {
        const countId = String(
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

        return countIds.has(countId)
      })

      const binIds = new Set()
      const skuIds = new Set()
      const userIds = new Set()

      items.forEach((item) => {
        const binId = pickValue(
          item,
          [
            'bin_id',
            'location_id',
          ],
          '',
        )

        const skuId = pickValue(
          item,
          [
            'sku_id',
            'item_id',
            'product_id',
          ],
          '',
        )

        if (binId) {
          binIds.add(String(binId))
        }

        if (skuId) {
          skuIds.add(String(skuId))
        }
      })

      counts.forEach((count) => {
        const userId = pickValue(
          count,
          [
            'counted_by',
            'created_by',
            'user_id',
            'submitted_by',
          ],
          '',
        )

        if (userId) {
          userIds.add(String(userId))
        }
      })

      const binQuery =
        binIds.size > 0
          ? supabase
              .from('bins')
              .select('*')
              .in(
                'id',
                Array.from(binIds),
              )
          : Promise.resolve({
              data: [],
              error: null,
            })

      const skuQuery =
        skuIds.size > 0
          ? supabase
              .from('skus')
              .select('*')
              .in(
                'id',
                Array.from(skuIds),
              )
          : Promise.resolve({
              data: [],
              error: null,
            })

      const profileQuery =
        userIds.size > 0
          ? supabase
              .from('profiles')
              .select('*')
              .in(
                'id',
                Array.from(userIds),
              )
          : Promise.resolve({
              data: [],
              error: null,
            })

      const [
        binResult,
        skuResult,
        profileResult,
      ] = await Promise.all([
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
        console.warn(
          'Profile tidak dapat dimuat:',
          profileResult.error,
        )
      }

      const binsById = new Map(
        (binResult.data ?? []).map(
          (bin) => [
            String(bin.id),
            bin,
          ],
        ),
      )

      const skusById = new Map(
        (skuResult.data ?? []).map(
          (sku) => [
            String(sku.id),
            sku,
          ],
        ),
      )

      const profilesById = new Map()

      ;(profileResult.data ?? []).forEach(
        (profile) => {
          const profileId = String(
            pickValue(
              profile,
              ['id', 'user_id'],
              '',
            ),
          )

          if (profileId) {
            profilesById.set(
              profileId,
              profile,
            )
          }
        },
      )

      const itemsByCount = new Map()

      items.forEach((item) => {
        const countId = String(
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

        if (!itemsByCount.has(countId)) {
          itemsByCount.set(countId, [])
        }

        itemsByCount
          .get(countId)
          .push(item)
      })

      const normalizedRows = []

      counts.forEach((count) => {
        const countId = String(
          pickValue(
            count,
            ['id'],
            '',
          ),
        )

        const countItems =
          itemsByCount.get(countId) ?? []

        const userId = String(
          pickValue(
            count,
            [
              'counted_by',
              'created_by',
              'user_id',
              'submitted_by',
            ],
            '',
          ),
        )

        const profile =
          profilesById.get(userId)

        const countNumber = pickValue(
          count,
          [
            'count_number',
            'stock_count_number',
            'reference_no',
            'document_number',
            'session_number',
          ],
          countId
            ? countId.slice(0, 8)
            : '-',
        )

        const rowsToCreate =
          countItems.length > 0
            ? countItems
            : [null]

        rowsToCreate.forEach(
          (item, index) => {
            const binId = String(
              pickValue(
                item,
                [
                  'bin_id',
                  'location_id',
                ],
                '',
              ),
            )

            const skuId = String(
              pickValue(
                item,
                [
                  'sku_id',
                  'item_id',
                  'product_id',
                ],
                '',
              ),
            )

            const bin =
              binsById.get(binId)

            const sku =
              skusById.get(skuId)

            const systemQty = Number(
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
            ) || 0

            const actualQty = Number(
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
            ) || 0

            const savedVariance =
              pickValue(
                item,
                [
                  'variance',
                  'difference',
                  'variance_qty',
                  'difference_qty',
                ],
                '',
              )

            const variance =
              savedVariance === ''
                ? actualQty - systemQty
                : Number(savedVariance) || 0

            normalizedRows.push({
              id:
                pickValue(
                  item,
                  ['id'],
                  '',
                ) ||
                `${countId}-${index}`,

              countNumber,

              binCode: pickValue(
                bin,
                [
                  'bin_code',
                  'code',
                  'location_code',
                  'name',
                ],
                pickValue(
                  item,
                  [
                    'bin_code',
                    'location_code',
                    'bin',
                    'location',
                  ],
                  '-',
                ),
              ),

              skuCode: pickValue(
                sku,
                [
                  'sku_code',
                  'code',
                  'sku',
                ],
                pickValue(
                  item,
                  [
                    'sku_code',
                    'sku',
                    'item_code',
                  ],
                  '-',
                ),
              ),

              skuName: pickValue(
                sku,
                [
                  'sku_name',
                  'name',
                  'description',
                  'product_name',
                ],
                pickValue(
                  item,
                  [
                    'sku_name',
                    'description',
                    'product_name',
                  ],
                  '-',
                ),
              ),

              systemQty,
              actualQty,
              variance,

              status: normalizeStatus(
                pickValue(
                  count,
                  ['status'],
                  'SUBMITTED',
                ),
              ),

              notes: pickValue(
                item,
                [
                  'notes',
                  'remarks',
                  'note',
                ],
                pickValue(
                  count,
                  [
                    'notes',
                    'remarks',
                    'note',
                  ],
                  '-',
                ),
              ),

              counterName: pickValue(
                profile,
                [
                  'full_name',
                  'name',
                  'display_name',
                  'email',
                ],
                pickValue(
                  count,
                  [
                    'counted_by_name',
                    'created_by_name',
                    'user_name',
                    'user_email',
                  ],
                  userId
                    ? userId.slice(0, 8)
                    : '-',
                ),
              ),

              createdAt: pickValue(
                count,
                [
                  'submitted_at',
                  'created_at',
                  'count_date',
                  'updated_at',
                ],
                '',
              ),
            })
          },
        )
      })

      normalizedRows.sort((a, b) => {
        const dateA =
          new Date(a.createdAt)
            .getTime() || 0

        const dateB =
          new Date(b.createdAt)
            .getTime() || 0

        return dateB - dateA
      })

      setRows(normalizedRows)
    } catch (loadError) {
      console.error(loadError)

      setRows([])
      setSessionTotal(0)

      setError(
        loadError?.message ||
          'Riwayat Stock Count gagal dimuat.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const availableStatuses = useMemo(
    () =>
      Array.from(
        new Set(
          rows.map((row) =>
            normalizeStatus(row.status),
          ),
        ),
      ).sort(),
    [rows],
  )

  const filteredRows = useMemo(() => {
    const keyword =
      search.trim().toLowerCase()

    return rows.filter((row) => {
      const matchesStatus =
        statusFilter === 'ALL' ||
        normalizeStatus(row.status) ===
          statusFilter

      if (!matchesStatus) {
        return false
      }

      if (!keyword) {
        return true
      }

      return [
        row.countNumber,
        row.binCode,
        row.skuCode,
        row.skuName,
        row.status,
        row.notes,
        row.counterName,
      ].some((value) =>
        String(value)
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [
    rows,
    search,
    statusFilter,
  ])

  const totalActualQty = useMemo(
    () =>
      filteredRows.reduce(
        (total, row) =>
          total +
          (Number(row.actualQty) || 0),
        0,
      ),
    [filteredRows],
  )

  const totalVariance = useMemo(
    () =>
      filteredRows.reduce(
        (total, row) =>
          total +
          (Number(row.variance) || 0),
        0,
      ),
    [filteredRows],
  )

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="small-label">
            BCL Warehouse WMS
          </p>

          <h1>
            Riwayat Stock Count
          </h1>
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
            {loadingLogout
              ? 'Keluar...'
              : 'Logout'}
          </button>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="stock-summary-grid">
          <article className="stock-summary-card">
            <span>Total Sesi</span>
            <strong>
              {sessionTotal}
            </strong>
          </article>

          <article className="stock-summary-card">
            <span>Baris Ditampilkan</span>
            <strong>
              {filteredRows.length}
            </strong>
          </article>

          <article className="stock-summary-card">
            <span>Total Qty Aktual</span>
            <strong>
              {formatQty(totalActualQty)}
            </strong>
          </article>

          <article className="stock-summary-card">
            <span>Total Selisih</span>

            <strong
              className={getVarianceClass(
                totalVariance,
              )}
            >
              {totalVariance > 0
                ? '+'
                : ''}
              {formatQty(totalVariance)}
            </strong>
          </article>
        </div>

        <div className="stock-toolbar">
          <div>
            <h2>
              Data Perhitungan Stok
            </h2>

            <p>
              Data yang telah dikirim dari
              aplikasi Android ke Supabase.
            </p>
          </div>

          <div className="stock-toolbar-actions">
            <input
              className="stock-search"
              type="search"
              value={search}
              placeholder="Cari sesi, bin, SKU, atau user"
              onChange={(event) =>
                setSearch(
                  event.target.value,
                )
              }
            />

            <select
              className="stock-status-filter"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value,
                )
              }
            >
              <option value="ALL">
                Semua Status
              </option>

              {availableStatuses.map(
                (status) => (
                  <option
                    key={status}
                    value={status}
                  >
                    {status}
                  </option>
                ),
              )}
            </select>

            <button
              className="stock-refresh-button"
              type="button"
              disabled={loading}
              onClick={loadHistory}
            >
              {loading
                ? 'Memuat...'
                : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="error-message">
            <strong>
              Data gagal dimuat
            </strong>

            <p>{error}</p>
          </div>
        )}

        <div className="stock-table-card">
          <div className="stock-table-scroll">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>No. Sesi</th>
                  <th>Lokasi</th>
                  <th>SKU</th>
                  <th>Deskripsi</th>
                  <th>Qty Sistem</th>
                  <th>Qty Aktual</th>
                  <th>Selisih</th>
                  <th>Status</th>
                  <th>Penghitung</th>
                  <th>Catatan</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      className="stock-empty-table"
                      colSpan="11"
                    >
                      Memuat riwayat Stock Count...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td
                      className="stock-empty-table"
                      colSpan="11"
                    >
                      Belum ada data Stock Count.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {formatDate(
                          row.createdAt,
                        )}
                      </td>

                      <td>
                        <strong>
                          {row.countNumber}
                        </strong>
                      </td>

                      <td>
                        <span className="stock-bin-label">
                          {row.binCode}
                        </span>
                      </td>

                      <td>
                        <strong>
                          {row.skuCode}
                        </strong>
                      </td>

                      <td>
                        {row.skuName}
                      </td>

                      <td>
                        {formatQty(
                          row.systemQty,
                        )}
                      </td>

                      <td>
                        <strong>
                          {formatQty(
                            row.actualQty,
                          )}
                        </strong>
                      </td>

                      <td>
                        <strong
                          className={getVarianceClass(
                            row.variance,
                          )}
                        >
                          {row.variance > 0
                            ? '+'
                            : ''}

                          {formatQty(
                            row.variance,
                          )}
                        </strong>
                      </td>

                      <td>
                        <span
                          className={`stock-status-label ${getStatusClass(
                            row.status,
                          )}`}
                        >
                          {row.status}
                        </span>
                      </td>

                      <td>
                        {row.counterName}
                      </td>

                      <td>
                        {row.notes}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}

export default StockCountPage
