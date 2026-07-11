import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { supabase } from '../lib/supabase'
import './BinToBinPage.css'

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

function BinToBinPage({
  loadingLogout,
  onBack,
  onLogout,
}) {
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [
        transferResult,
        itemResult,
      ] = await Promise.all([
        supabase
          .from('bin_transfers')
          .select('*')
          .limit(200),

        supabase
          .from('bin_transfer_items')
          .select('*')
          .limit(1000),
      ])

      if (transferResult.error) {
        throw transferResult.error
      }

      if (itemResult.error) {
        throw itemResult.error
      }

      const transfers =
        transferResult.data ?? []

      const allItems =
        itemResult.data ?? []

      const transferIds = new Set(
        transfers.map((transfer) =>
          String(
            pickValue(
              transfer,
              ['id'],
              '',
            ),
          ),
        ),
      )

      const items = allItems.filter((item) => {
        const transferId = String(
          pickValue(
            item,
            [
              'transfer_id',
              'bin_transfer_id',
            ],
            '',
          ),
        )

        return transferIds.has(transferId)
      })

      const binIds = new Set()
      const skuIds = new Set()

      transfers.forEach((transfer) => {
        const sourceBinId = pickValue(
          transfer,
          [
            'source_bin_id',
            'from_bin_id',
          ],
          '',
        )

        const destinationBinId = pickValue(
          transfer,
          [
            'destination_bin_id',
            'to_bin_id',
          ],
          '',
        )

        if (sourceBinId) {
          binIds.add(String(sourceBinId))
        }

        if (destinationBinId) {
          binIds.add(String(destinationBinId))
        }
      })

      items.forEach((item) => {
        const skuId = pickValue(
          item,
          ['sku_id', 'item_id'],
          '',
        )

        if (skuId) {
          skuIds.add(String(skuId))
        }
      })

      const binQuery =
        binIds.size > 0
          ? supabase
              .from('bins')
              .select('*')
              .in('id', Array.from(binIds))
          : Promise.resolve({
              data: [],
              error: null,
            })

      const skuQuery =
        skuIds.size > 0
          ? supabase
              .from('skus')
              .select('*')
              .in('id', Array.from(skuIds))
          : Promise.resolve({
              data: [],
              error: null,
            })

      const [
        binResult,
        skuResult,
      ] = await Promise.all([
        binQuery,
        skuQuery,
      ])

      if (binResult.error) {
        throw binResult.error
      }

      if (skuResult.error) {
        throw skuResult.error
      }

      const binsById = new Map(
        (binResult.data ?? []).map((bin) => [
          String(bin.id),
          bin,
        ]),
      )

      const skusById = new Map(
        (skuResult.data ?? []).map((sku) => [
          String(sku.id),
          sku,
        ]),
      )

      const itemsByTransfer = new Map()

      items.forEach((item) => {
        const transferId = String(
          pickValue(
            item,
            [
              'transfer_id',
              'bin_transfer_id',
            ],
            '',
          ),
        )

        if (!itemsByTransfer.has(transferId)) {
          itemsByTransfer.set(transferId, [])
        }

        itemsByTransfer
          .get(transferId)
          .push(item)
      })

      const normalizedRows = []

      transfers.forEach((transfer) => {
        const transferId = String(
          pickValue(
            transfer,
            ['id'],
            '',
          ),
        )

        const transferItems =
          itemsByTransfer.get(transferId) ?? []

        const sourceBinId = String(
          pickValue(
            transfer,
            [
              'source_bin_id',
              'from_bin_id',
            ],
            '',
          ),
        )

        const destinationBinId = String(
          pickValue(
            transfer,
            [
              'destination_bin_id',
              'to_bin_id',
            ],
            '',
          ),
        )

        const sourceBin =
          binsById.get(sourceBinId)

        const destinationBin =
          binsById.get(destinationBinId)

        const rowsToCreate =
          transferItems.length > 0
            ? transferItems
            : [null]

        rowsToCreate.forEach(
          (item, index) => {
            const skuId = String(
              pickValue(
                item,
                ['sku_id', 'item_id'],
                '',
              ),
            )

            const sku =
              skusById.get(skuId)

            normalizedRows.push({
              id:
                pickValue(
                  item,
                  ['id'],
                  '',
                ) ||
                `${transferId}-${index}`,

              transferNumber: pickValue(
                transfer,
                [
                  'transfer_number',
                  'transfer_no',
                  'reference_no',
                  'document_number',
                ],
                transferId
                  ? transferId.slice(0, 8)
                  : '-',
              ),

              sourceBin: pickValue(
                sourceBin,
                [
                  'bin_code',
                  'code',
                  'location_code',
                ],
                pickValue(
                  transfer,
                  [
                    'source_bin_code',
                    'from_bin_code',
                  ],
                  '-',
                ),
              ),

              destinationBin: pickValue(
                destinationBin,
                [
                  'bin_code',
                  'code',
                  'location_code',
                ],
                pickValue(
                  transfer,
                  [
                    'destination_bin_code',
                    'to_bin_code',
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
                  ['sku_code'],
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
                  ],
                  '-',
                ),
              ),

              qty: pickValue(
                item,
                [
                  'qty',
                  'quantity',
                  'moved_qty',
                ],
                '0',
              ),

              status: pickValue(
                transfer,
                ['status'],
                'COMPLETED',
              ),

              notes: pickValue(
                transfer,
                ['notes', 'remarks'],
                '-',
              ),

              createdAt: pickValue(
                transfer,
                [
                  'created_at',
                  'submitted_at',
                  'transfer_date',
                ],
                '',
              ),
            })
          },
        )
      })

      normalizedRows.sort((a, b) => {
        const dateA =
          new Date(a.createdAt).getTime() || 0

        const dateB =
          new Date(b.createdAt).getTime() || 0

        return dateB - dateA
      })

      setRows(normalizedRows)
    } catch (loadError) {
      console.error(loadError)

      setRows([])

      setError(
        loadError?.message ||
          'Riwayat Bin to Bin gagal dimuat.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const filteredRows = useMemo(() => {
    const keyword =
      search.trim().toLowerCase()

    if (!keyword) {
      return rows
    }

    return rows.filter((row) =>
      [
        row.transferNumber,
        row.sourceBin,
        row.destinationBin,
        row.skuCode,
        row.skuName,
        row.status,
        row.notes,
      ].some((value) =>
        String(value)
          .toLowerCase()
          .includes(keyword),
      ),
    )
  }, [rows, search])

  const totalQty = useMemo(
    () =>
      rows.reduce(
        (total, row) =>
          total +
          (Number(row.qty) || 0),
        0,
      ),
    [rows],
  )

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="small-label">
            BCL Warehouse WMS
          </p>

          <h1>Riwayat Bin to Bin</h1>
        </div>

        <div className="header-actions">
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
        <div className="summary-grid">
          <article className="summary-card">
            <span>Total Baris</span>
            <strong>{rows.length}</strong>
          </article>

          <article className="summary-card">
            <span>Total Qty Dipindahkan</span>
            <strong>
              {formatQty(totalQty)}
            </strong>
          </article>

          <article className="summary-card">
            <span>Hasil Ditampilkan</span>
            <strong>
              {filteredRows.length}
            </strong>
          </article>
        </div>

        <div className="history-toolbar">
          <div>
            <h2>Data Perpindahan</h2>

            <p>
              Data transaksi dari aplikasi
              Android dan Supabase.
            </p>
          </div>

          <div className="toolbar-actions">
            <input
              className="history-search"
              type="search"
              value={search}
              placeholder="Cari transfer, bin, atau SKU"
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />

            <button
              className="primary-small-button"
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

        <div className="history-table-card">
          <div className="table-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>No. Transfer</th>
                  <th>Lokasi Asal</th>
                  <th>Lokasi Tujuan</th>
                  <th>SKU</th>
                  <th>Deskripsi</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th>Catatan</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      className="empty-table"
                      colSpan="9"
                    >
                      Memuat riwayat Bin to Bin...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td
                      className="empty-table"
                      colSpan="9"
                    >
                      Belum ada data Bin to Bin.
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
                          {row.transferNumber}
                        </strong>
                      </td>

                      <td>
                        <span className="bin-label">
                          {row.sourceBin}
                        </span>
                      </td>

                      <td>
                        <span className="bin-label">
                          {row.destinationBin}
                        </span>
                      </td>

                      <td>{row.skuCode}</td>
                      <td>{row.skuName}</td>

                      <td>
                        <strong>
                          {formatQty(row.qty)}
                        </strong>
                      </td>

                      <td>
                        <span className="status-label">
                          {row.status}
                        </span>
                      </td>

                      <td>{row.notes}</td>
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

export default BinToBinPage
