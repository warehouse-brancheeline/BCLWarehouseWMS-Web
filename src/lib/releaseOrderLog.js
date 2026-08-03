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

export const releaseOrderLogConfigError = ''

export async function connectReleaseOrderSheet() {
  const provider = new GoogleAuthProvider()
  provider.addScope('https://www.googleapis.com/auth/spreadsheets')
  provider.setCustomParameters({ prompt: 'select_account' })

  const result = await signInWithPopup(auth, provider)
  const credential = GoogleAuthProvider.credentialFromResult(result)
  accessToken = credential?.accessToken || ''
  if (!accessToken) throw new Error('Izin Google Sheets tidak diberikan.')
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
    accessToken = ''
    throw new Error('Sesi Google berakhir. Hubungkan kembali akun Google.')
  }

  const result = await response.json()
  if (!response.ok) throw new Error(result.error?.message || 'Google Sheet tidak merespons.')
  return result
}

export async function getRecentReleaseOrders(limit = 20) {
  const range = encodeURIComponent(`${sheetName}!A:C`)
  const result = await sheetsFetch(`/values/${range}?majorDimension=ROWS`)
  const rows = (result.values || []).slice(1).slice(-limit).reverse().map((row) => ({
    timestamp: row[0] || '',
    trackingNumber: row[1] || '',
    source: row[2] || 'WMS Web',
  }))
  return { rows }
}

export async function saveReleaseOrder({ trackingNumber }) {
  const resiRange = encodeURIComponent(`${sheetName}!B:B`)
  const history = await sheetsFetch(`/values/${resiRange}?majorDimension=COLUMNS`)
  const existing = (history.values?.[0] || []).some(
    (value) => String(value).trim().toUpperCase() === trackingNumber,
  )
  if (existing) throw new Error(`Resi ${trackingNumber} sudah pernah direlease.`)

  const appendRange = encodeURIComponent(`${sheetName}!A:C`)
  await sheetsFetch(
    `/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      body: JSON.stringify({
        values: [[new Date().toISOString(), trackingNumber, 'WMS Web']],
      }),
    },
  )
  return { ok: true, message: `Resi ${trackingNumber} berhasil dicatat.` }
}
