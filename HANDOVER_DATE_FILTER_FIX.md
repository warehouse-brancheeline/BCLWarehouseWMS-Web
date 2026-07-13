# Perbaikan Filter Tanggal Handover - Dokumentasi Teknis

## Ringkasan Masalah

Filter tanggal pada halaman Handover tidak bekerja dengan benar karena:

1. **Ketidaksesuaian Format Tanggal**
   - Input date dari form: `YYYY-MM-DD` (string)
   - Timestamp dari Supabase: ISO 8601 UTC (contoh: `2026-07-12T05:30:00Z`)
   - Perbandingan langsung menghasilkan hasil yang tidak akurat

2. **Perbedaan Timezone**
   - Data Supabase disimpan dalam UTC
   - Website menggunakan Asia/Makassar (WITA, UTC+8)
   - Tanggal yang ditampilkan di UI sudah dikonversi ke WITA, tetapi filter belum
   - Contoh: Group dengan created_at `2026-07-12T22:00:00Z` (UTC) sebenarnya adalah `2026-07-13 06:00 WITA`, tetapi filter membandingkannya sebagai `2026-07-12`

3. **Tidak Ada Validasi Date Range**
   - User bisa memilih Tanggal Mulai > Tanggal Akhir tanpa peringatan
   - Tidak ada error message yang ditampilkan
   - Tombol Download Excel tidak disabled

4. **Download Excel Tidak Konsisten**
   - Excel download harus menggunakan `filteredGroups` yang sama dengan tabel
   - Sebelumnya logic filter tertanam dalam komponen, tidak terpisah

## Solusi yang Diterapkan

### 1. Helper Functions untuk Date Conversion

**`getGroupOperationalDate(group)`**
- Mengambil `submitted_at` atau jika null mengambil `created_at`
- Ini adalah sumber tanggal yang digunakan untuk filter (sesuai requirement)
- Group dalam status READY_FOR_HANDOVER tidak memiliki `handed_over_at`, jadi tidak digunakan sebagai sumber filter

**`getWitaDateKey(isoValue)`**
- Mengkonversi ISO 8601 timestamp ke YYYY-MM-DD dalam timezone WITA
- Menggunakan offset 8 jam dari UTC
- Mengembalikan string dalam format YYYY-MM-DD yang dapat dibandingkan secara kronologis
- Contoh:
  - Input: `"2026-07-12T22:00:00Z"` (UTC)
  - Output: `"2026-07-13"` (WITA)

### 2. Perbaikan Filter Logic

**Sebelumnya:**
```javascript
const groupDate = group.submitted_at || group.created_at
const afterStart = !startDate || !groupDate || groupDate >= startDate
const beforeEnd = !endDate || !groupDate || groupDate <= endDate
```
- Membandingkan ISO timestamp dengan string YYYY-MM-DD
- Tidak akurat

**Sekarang:**
```javascript
const operationalDate = getGroupOperationalDate(group)
const operationalDateKey = getWitaDateKey(operationalDate)

const matchesStartDate = !filters.startDate || operationalDateKey >= filters.startDate
const matchesEndDate = !filters.endDate || operationalDateKey <= filters.endDate
const matchesDate = matchesStartDate && matchesEndDate
```
- Konversi ke WITA date key terlebih dahulu
- Perbandingan string YYYY-MM-DD dengan string YYYY-MM-DD
- Akurat dan konsisten

### 3. Validasi Date Range

**State baru:**
```javascript
const [dateValidationError, setDateValidationError] = useState('')
```

**useEffect untuk validasi:**
```javascript
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
```

### 4. Error Message Display

Tambahkan tampilan pesan error setelah filter grid:
```jsx
{dateValidationError ? (
  <div className="handover-error-message" style={{ marginBottom: '1rem', color: '#e74c3c' }}>
    <p>{dateValidationError}</p>
  </div>
) : null}
```

### 5. Disable Download Excel ketika Error

Update tombol Download Excel:
```jsx
<button
  className="handover-action-button handover-action-button--primary"
  type="button"
  onClick={handleDownloadListExcel}
  disabled={loading || filteredGroups.length === 0 || Boolean(dateValidationError)}
>
  Download Excel
</button>
```

### 6. Reset Filter Lengkap

Update button Reset Filter untuk juga mengosongkan error:
```jsx
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
```

### 7. Debug Console

Tambahkan debug log untuk 2 data pertama saat filter tanggal aktif:
```javascript
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
```
Output contoh:
```
Handover date filter {
  groupNumber: "GRP001"
  sourceDate: "2026-07-12T22:00:00Z"
  operationalDateKey: "2026-07-13"
  startDate: "2026-07-13"
  endDate: "2026-07-13"
  matchesDate: true
}
```

## Aturan Filter yang Diimplementasikan

### Tanggal Mulai (Start Date)
- **Kondisi:** `operationalDateKey >= filters.startDate`
- **Contoh:** Jika user memilih `2026-07-12`, tampilkan grup dari `2026-07-12` dan seterusnya
- **Inklusif:** Dari 00:00:00 WITA pada tanggal tersebut

### Tanggal Akhir (End Date)
- **Kondisi:** `operationalDateKey <= filters.endDate`
- **Contoh:** Jika user memilih `2026-07-12`, tampilkan grup sampai akhir `2026-07-12`
- **Inklusif:** Sampai 23:59:59.999 WITA pada tanggal tersebut

### Hanya Start Date yang Diisi
- Tampilkan data dari tanggal tersebut dan seterusnya

### Hanya End Date yang Diisi
- Tampilkan data sampai akhir tanggal tersebut

### Keduanya Kosong
- Tampilkan semua data

### Validasi: Start > End
- **Tampilkan:** Pesan error "Tanggal mulai tidak boleh melewati tanggal akhir."
- **Disable:** Tombol Download Excel
- **Data:** Tetap menampilkan data sebelumnya atau bisa dikosongkan (saat ini tetap kosong)

## Kombinasi dengan Filter Lain

Filter tanggal bekerja secara seamless dengan filter lainnya:
- **Search:** Pencarian nomor group, resi, ekspedisi, staff
- **Courier (Ekspedisi):** Filter berdasarkan nama ekspedisi
- **Status:** Filter berdasarkan status (Siap Handover, Terkirim, dll)

**Urutan filter:**
1. allGroups → 2. filter tanggal (operationalDateKey) → 3. filter ekspedisi → 4. filter status → 5. filter search → 6. sort created_at descending

**Single computed list:**
```javascript
const filteredGroups = useMemo(() => {
  // Semua logic filter dalam satu tempat
  // Dependency: filters, groups, search
}, [filters, groups, search])
```

## Summary Card Update

Summary cards dihitung dari `filteredGroups`:
- **Total Group:** `filteredGroups.length`
- **Siap Handover:** `filteredGroups.filter(status === READY_FOR_HANDOVER).length`
- **Terkirim:** `filteredGroups.filter(status === TERKIRIM).length`
- **Total Paket:** `sum(filteredGroups.map(package_count))`

Summary otomatis berubah ketika filter berubah.

## Excel Download

Download Excel menggunakan `filteredGroups`:
```javascript
const summaryRows = filteredGroups.map((group) => ({
  // Semua field dari filteredGroups
}))

const detailRows = filteredGroups.flatMap((group) =>
  (group.items || []).map((item) => ({
    // Detail resi dari filteredGroups
  }))
)
```

Excel yang diunduh hanya berisi grup yang tampil di layar saat ini.

## Timezone Handling

**Konversi WITA:**
```javascript
const WITA_OFFSET_MS = 8 * 60 * 60 * 1000 // 28,800,000 ms

const witaDate = new Date(timestamp + WITA_OFFSET_MS)
// Gunakan getUTC* methods karena sudah di-offset
```

**Tampilan di Tabel:**
```javascript
const date = new Date(value)
new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Asia/Makassar',
}).format(date)
// Contoh output: "12 Juli 2026, 13.28 WITA"
```

## Test Cases yang Harus Dijalankan

### TEST 1: Single Day Filter
- Pilih Tanggal Mulai: `2026-07-12`
- Pilih Tanggal Akhir: `2026-07-12`
- **Ekspektasi:** Hanya grup pada 12 Juli 2026 WITA yang tampil
- **Verifikasi:** Cek console debug output

### TEST 2: Start Date Only
- Isi Tanggal Mulai: `2026-07-12`
- Kosongkan Tanggal Akhir
- **Ekspektasi:** Data dari 12 Juli 2026 dan seterusnya tampil
- **Verifikasi:** Tidak ada grup dengan date < 2026-07-12

### TEST 3: End Date Only
- Kosongkan Tanggal Mulai
- Isi Tanggal Akhir: `2026-07-12`
- **Ekspektasi:** Data sampai akhir 12 Juli 2026 tampil
- **Verifikasi:** Tidak ada grup dengan date > 2026-07-12

### TEST 4: Combine with Status Filter
- Tanggal Mulai: `2026-07-12`
- Tanggal Akhir: `2026-07-12`
- Status: `TERKIRIM`
- **Ekspektasi:** Hanya grup TERKIRIM pada 12 Juli 2026 yang tampil
- **Verifikasi:** Summary "Terkirim" sesuai dengan jumlah yang ditampilkan

### TEST 5: Combine with Courier Filter
- Tanggal Mulai: `2026-07-12`
- Tanggal Akhir: `2026-07-12`
- Ekspedisi: `JNE`
- **Ekspektasi:** Hanya grup JNE pada 12 Juli 2026 yang tampil
- **Verifikasi:** Semua "Ekspedisi" column menunjukkan "JNE"

### TEST 6: Summary Card Updates
- Kosongkan semua filter → catat Total Group
- Isi Tanggal Mulai & Akhir → Total Group berkurang
- **Ekspektasi:** Summary berubah sesuai filter yang aktif
- **Verifikasi:** Jumlah di tabel = jumlah di summary card

### TEST 7: Excel Download Consistency
- Isi Tanggal Mulai & Akhir
- Klik "Download Excel"
- Buka file Excel yang diunduh
- **Ekspektasi:** Banyak grup di Excel = banyak di layar
- **Ekspektasi:** Tanggal semua grup dalam range yang dipilih

### TEST 8: Reset Filter Button
- Aktifkan beberapa filter (tanggal, status, ekspedisi)
- Klik "Reset Filter"
- **Ekspektasi:** Semua filter kosong, semua data tampil kembali
- **Ekspektasi:** Error message hilang

### TEST 9: Date Validation Error
- Tanggal Mulai: `2026-07-15`
- Tanggal Akhir: `2026-07-12`
- **Ekspektasi:** Pesan "Tanggal mulai tidak boleh melewati tanggal akhir." tampil
- **Ekspektasi:** Tombol "Download Excel" disabled
- **Verifikasi:** Tabel tidak menampilkan data

### TEST 10: Correcting Date Validation Error
- Setelah TEST 9, ubah Tanggal Mulai: `2026-07-12`
- **Ekspektasi:** Error message hilang
- **Ekspektasi:** Tombol "Download Excel" enabled kembali
- **Ekspektasi:** Data tampil sesuai filter yang valid

## File yang Diubah

- `/workspaces/BCLWarehouseWMS-Web/src/pages/HandoverPage.jsx`

## Summary Perubahan

1. ✅ Tambah helper `getGroupOperationalDate()`
2. ✅ Tambah helper `getWitaDateKey()`
3. ✅ Tambah state `dateValidationError`
4. ✅ Tambah useEffect untuk validasi date range
5. ✅ Update `filteredGroups` useMemo dengan logic WITA date key
6. ✅ Tambah tampilan error message
7. ✅ Update tombol "Download Excel" disable logic
8. ✅ Update tombol "Reset Filter" untuk clear error
9. ✅ Tambah debug console log (limited)
10. ✅ Build berhasil tanpa error

## Notes

- Debug log akan muncul di console saat filter tanggal aktif (untuk 2 data pertama)
- Semua filter bekerja secara independen dan kombinatif
- Summary card otomatis update sesuai filteredGroups
- Excel download menggunakan data yang sama dengan tabel
- Timezone WITA (Asia/Makassar) digunakan konsisten di seluruh filter
