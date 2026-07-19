// ============================================================
// BCL Warehouse WMS - Shared Utility Functions
// Semua fungsi helper yang dipakai di banyak halaman
// dikumpulkan di sini agar tidak duplikasi.
// ============================================================

/**
 * Format tanggal ke format Indonesia (WITA)
 * @param {string|Date} value
 * @param {string} fallback
 * @returns {string}
 */
export function formatDate(value, fallback = '-') {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return fallback
  }

  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Makassar',
  }).format(date)
}

/**
 * Format tanggal panjang ke format Indonesia (WITA)
 * Dipakai di HandoverPage dan ScanPackHistoryPage
 * @param {string|Date} value
 * @param {string} fallback
 * @returns {string}
 */
export function formatDateLong(value, fallback = '-') {
  if (value === null || value === undefined || value === '') {
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

/**
 * Format angka ke format Indonesia
 * @param {number|string} value
 * @returns {string}
 */
export function formatQty(value) {
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 2,
  }).format(toNumber(value))
}

/**
 * Konversi nilai ke number, return 0 jika NaN
 * @param {any} value
 * @returns {number}
 */
export function toNumber(value) {
  const parsed = Number(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Ambil nilai pertama yang tidak kosong dari object
 * berdasarkan daftar key yang dicoba satu per satu.
 * @param {object} row
 * @param {string[]} keys
 * @param {any} fallback
 * @returns {any}
 */
export function pickValue(row, keys, fallback = '') {
  if (!row) {
    return fallback
  }

  for (const key of keys) {
    const value = row[key]

    if (value !== undefined && value !== null && value !== '') {
      return value
    }
  }

  return fallback
}

/**
 * Bersihkan nama file dari karakter tidak valid
 * @param {string} value
 * @param {string} fallback
 * @returns {string}
 */
export function safeFilename(value, fallback = 'export') {
  return String(value || fallback)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
}

/**
 * Konversi string ke huruf kapital dan hilangkan spasi
 * @param {string} value
 * @returns {string}
 */
export function normalizeUpper(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

/**
 * Dapatkan date key dalam format YYYY-MM-DD berdasarkan timezone WITA
 * Dipakai untuk filter tanggal di HandoverPage
 * @param {string} isoValue
 * @returns {string|null}
 */
export function getWitaDateKey(isoValue) {
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

/**
 * Parse integer dengan fallback
 * @param {any} value
 * @param {number} fallback
 * @returns {number}
 */
export function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}
