import { getApps, initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyCyo8sxnuLqmGnFIMfn8Rlph-9tFiw7VdE',
  authDomain: 'bcl-warehouse-wms.firebaseapp.com',
  projectId: 'bcl-warehouse-wms',
  storageBucket: 'bcl-warehouse-wms.firebasestorage.app',
  messagingSenderId: '342049876172',
  appId: '1:342049876172:web:5765a1d6f00569c3defa69',
}

const spreadsheetId = '1QsDVycyI4BnvEJZlni-64z1uSpXWBmAjXKIRK2jwL9I'
const sheetName = 'Release Order Log'
const app = getApps()[0] || initializeApp(firebaseConfig)
const auth = getAuth(app)
let accessToken = ''
const knownTrackingNumbers = new Set()
let releaseOrderSheetId = null
const tokenStorageKey = 'bcl-release-order-google-token'
const tokenExpiryStorageKey = 'bcl-release-order-google-token-expiry'

function clearSavedConnection() {
  accessToken = ''
  localStorage.removeItem(tokenStorageKey)
  localStorage.removeItem(tokenExpiryStorageKey)
}

export function hasSavedReleaseOrderConnection() {
  const savedToken = localStorage.getItem(tokenStorageKey) || ''
  const expiresAt = Number(localStorage.getItem(tokenExpiryStorageKey) || 0)
  if (!savedToken || expiresAt <= Date.now()) {
    clearSavedConnection()
    return false
  }
  accessToken = savedToken
  return true
}

export function disconnectReleaseOrderSheet() {
  clearSavedConnection()
  knownTrackingNumbers.clear()
}

export const releaseOrderLogConfigError = ''

export async function connectReleaseOrderSheet() {
  const provider = new GoogleAuthProvider()
  provider.addScope('https://www.googleapis.com/auth/spreadsheets')
  provider.setCustomParameters({ prompt: 'select_account' })

  const result = await signInWithPopup(auth, provider)
  const credential = GoogleAuthProvider.credentialFromResult(result)
  accessToken = credential?.accessToken || ''
  if (!accessToken) throw new Error('Izin Google Sheets tidak diberikan.')
  localStorage.setItem(tokenStorageKey, accessToken)
  localStorage.setItem(tokenExpiryStorageKey, String(Date.now() + (50 * 60 * 1000)))
  return true
}

async function sheetsFetch(path, options = {}) {
  if (!accessToken) throw new Error('Hubungkan akun Google terlebih dahulu.')
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (response.status === 401) {
    clearSavedConnection()
    throw new Error('Sesi Google berakhir. Hubungkan kembali akun Google.')
  }

  const result = await response.json()
  if (!response.ok) throw new Error(result.error?.message || 'Google Sheet tidak merespons.')
  return result
}

export async function getRecentReleaseOrders(limit = 20) {
  const range = encodeURIComponent(`${sheetName}!A:D`)
  const result = await sheetsFetch(`/values/${range}?majorDimension=ROWS`)
  const allDataRows = (result.values || []).slice(1)
  const rows = allDataRows
    .map((row, index) => ({
      rowNumber: index + 2,
      timestamp: row[0] || '',
      trackingNumber: row[1] || '',
      source: row[2] || 'WMS Web',
      courier: row[3] || '',
    }))
    .filter((row) => row.trackingNumber)
    .slice(-limit)
    .reverse()
  allDataRows.forEach((row) => {
    const trackingNumber = String(row[1] || '').trim().toUpperCase()
    if (trackingNumber) knownTrackingNumbers.add(trackingNumber)
  })
  if (allDataRows.length) {
    await formatReleaseOrderRows(2, allDataRows.length + 2)
  }
  return { rows }
}

export async function saveReleaseOrder({ trackingNumber, courier }) {
  if (knownTrackingNumbers.has(trackingNumber)) {
    throw new Error(`Resi ${trackingNumber} sudah pernah direlease.`)
  }
  knownTrackingNumbers.add(trackingNumber)

  const appendRange = encodeURIComponent(`${sheetName}!A:D`)
  try {
    const result = await sheetsFetch(
      `/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        body: JSON.stringify({
          values: [[new Date().toISOString(), trackingNumber, 'WMS Web', courier]],
        }),
      },
    )
    const updatedRange = result.updates?.updatedRange || ''
    const rowNumber = Number(updatedRange.match(/!(?:A|\$A)\$?(\d+)/)?.[1] || 0)
    if (rowNumber) await formatReleaseOrderRows(rowNumber, rowNumber + 1)
    return { ok: true, message: `Resi ${trackingNumber} berhasil dicatat.`, rowNumber }
  } catch (error) {
    knownTrackingNumbers.delete(trackingNumber)
    throw error
  }
}

export async function updateReleaseOrder({ rowNumber, oldTrackingNumber, trackingNumber, courier }) {
  const normalizedTrackingNumber = String(trackingNumber || '').trim().toUpperCase()
  if (!normalizedTrackingNumber) throw new Error('Nomor resi wajib diisi.')
  if (normalizedTrackingNumber !== oldTrackingNumber
    && knownTrackingNumbers.has(normalizedTrackingNumber)) {
    throw new Error(`Resi ${normalizedTrackingNumber} sudah pernah direlease.`)
  }

  const range = encodeURIComponent(`${sheetName}!B${rowNumber}:D${rowNumber}`)
  await sheetsFetch(`/values/${range}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({
      values: [[normalizedTrackingNumber, 'WMS Web', courier]],
    }),
  })
  knownTrackingNumbers.delete(oldTrackingNumber)
  knownTrackingNumbers.add(normalizedTrackingNumber)
  return { ok: true, message: `Resi ${normalizedTrackingNumber} berhasil diperbarui.` }
}

async function getReleaseOrderSheetId() {
  if (releaseOrderSheetId !== null) return releaseOrderSheetId
  const result = await sheetsFetch('?fields=sheets.properties(sheetId,title)')
  const sheet = (result.sheets || []).find(
    (item) => item.properties?.title === sheetName,
  )
  if (!sheet) throw new Error(`Sheet ${sheetName} tidak ditemukan.`)
  releaseOrderSheetId = sheet.properties.sheetId
  return releaseOrderSheetId
}

async function formatReleaseOrderRows(startRowNumber, endRowNumber) {
  const sheetId = await getReleaseOrderSheetId()
  await sheetsFetch(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: [{
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: startRowNumber - 1,
            endRowIndex: endRowNumber - 1,
            startColumnIndex: 0,
            endColumnIndex: 4,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 1, green: 1, blue: 1 },
              horizontalAlignment: 'LEFT',
              textFormat: {
                foregroundColor: { red: 0, green: 0, blue: 0 },
                bold: false,
              },
            },
          },
          fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat',
        },
      }],
    }),
  })
}

export async function deleteReleaseOrder({ rowNumber, trackingNumber }) {
  const sheetId = await getReleaseOrderSheetId()
  await sheetsFetch(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: rowNumber - 1,
            endIndex: rowNumber,
          },
        },
      }],
    }),
  })
  knownTrackingNumbers.delete(trackingNumber)
  return { ok: true, message: `Resi ${trackingNumber} berhasil dihapus.` }
}
