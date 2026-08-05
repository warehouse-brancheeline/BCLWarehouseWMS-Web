const scriptUrl = (import.meta.env.VITE_RELEASE_ORDER_SCRIPT_URL || '').trim()
const scriptToken = (import.meta.env.VITE_RELEASE_ORDER_SCRIPT_TOKEN || '').trim()
const sheetLinkStorageKey = 'bcl-release-order-sheet-link'
const defaultSheetLink = 'https://docs.google.com/spreadsheets/d/1QsDVycyI4BnvEJZlni-64z1uSpXWBmAjXKIRK2jwL9I/edit?gid=0#gid=0'
const knownTrackingNumbers = new Set()

export const releaseOrderLogConfigError = (!scriptUrl || !scriptToken)
  ? 'Konfigurasi Release Order Log belum lengkap (VITE_RELEASE_ORDER_SCRIPT_URL/VITE_RELEASE_ORDER_SCRIPT_TOKEN).'
  : ''

function extractSpreadsheetId(url) {
  const match = String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : ''
}

export function getReleaseOrderSheetLink() {
  return localStorage.getItem(sheetLinkStorageKey) || defaultSheetLink
}

export function setReleaseOrderSheetLink(url) {
  const spreadsheetId = extractSpreadsheetId(url)
  if (!spreadsheetId) throw new Error('Link Google Sheet tidak valid.')
  localStorage.setItem(sheetLinkStorageKey, url.trim())
  knownTrackingNumbers.clear()
  return spreadsheetId
}

function getSpreadsheetId() {
  const spreadsheetId = extractSpreadsheetId(getReleaseOrderSheetLink())
  if (!spreadsheetId) throw new Error('Link Google Sheet tidak valid.')
  return spreadsheetId
}

async function callScript(action, params = {}, method = 'GET') {
  if (releaseOrderLogConfigError) throw new Error(releaseOrderLogConfigError)
  const spreadsheetId = getSpreadsheetId()
  const payload = { token: scriptToken, spreadsheetId, action, ...params }

  const response = method === 'GET'
    ? await fetch(`${scriptUrl}?${new URLSearchParams(payload).toString()}`)
    : await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    })

  const result = await response.json().catch(() => null)
  if (!result) throw new Error('Release Order Log tidak merespons.')
  if (result.error) throw new Error(result.error)
  return result
}

export async function getRecentReleaseOrders(limit = 20) {
  const result = await callScript('list')
  const allRows = result.rows || []
  allRows.forEach((row) => {
    const trackingNumber = String(row.trackingNumber || '').trim().toUpperCase()
    if (trackingNumber) knownTrackingNumbers.add(trackingNumber)
  })
  const rows = allRows.slice(-limit).reverse()
  return { rows, allRows }
}

export async function saveReleaseOrder({ trackingNumber, courier, pickingList }) {
  if (knownTrackingNumbers.has(trackingNumber)) {
    throw new Error(`Resi ${trackingNumber} sudah pernah direlease.`)
  }
  knownTrackingNumbers.add(trackingNumber)
  try {
    return await callScript('append', { trackingNumber, courier, pickingList }, 'POST')
  } catch (error) {
    knownTrackingNumbers.delete(trackingNumber)
    throw error
  }
}

export async function updateReleaseOrder({
  rowNumber,
  oldTrackingNumber,
  trackingNumber,
  courier,
  pickingList,
}) {
  const normalizedTrackingNumber = String(trackingNumber || '').trim().toUpperCase()
  if (!normalizedTrackingNumber) throw new Error('Nomor resi wajib diisi.')
  if (normalizedTrackingNumber !== oldTrackingNumber
    && knownTrackingNumbers.has(normalizedTrackingNumber)) {
    throw new Error(`Resi ${normalizedTrackingNumber} sudah pernah direlease.`)
  }

  const result = await callScript('update', {
    rowNumber,
    trackingNumber: normalizedTrackingNumber,
    courier,
    pickingList,
  }, 'POST')
  knownTrackingNumbers.delete(oldTrackingNumber)
  knownTrackingNumbers.add(normalizedTrackingNumber)
  return result
}

export async function deleteReleaseOrder({ rowNumber, trackingNumber }) {
  const result = await callScript('delete', { rowNumber, trackingNumber }, 'POST')
  knownTrackingNumbers.delete(trackingNumber)
  return result
}
