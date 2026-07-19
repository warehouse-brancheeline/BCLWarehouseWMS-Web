// ============================================================
// BCL Warehouse WMS - Lazy Excel Helper
// xlsx library hanya di-load saat user benar-benar klik
// "Download Excel". Ini mengurangi bundle awal ~200kb.
// ============================================================

let xlsxModule = null

async function getXlsx() {
  if (!xlsxModule) {
    xlsxModule = await import('xlsx')
  }
  return xlsxModule
}

/**
 * Buat workbook baru
 */
export async function createWorkbook() {
  const { utils } = await getXlsx()
  return utils.book_new()
}

/**
 * Konversi array of objects ke sheet lalu tambahkan ke workbook
 */
export async function addJsonSheet(workbook, data, sheetName) {
  const { utils } = await getXlsx()
  const sheet = utils.json_to_sheet(data)
  utils.book_append_sheet(workbook, sheet, sheetName)
  return sheet
}

/**
 * Konversi array of arrays ke sheet lalu tambahkan ke workbook
 */
export async function addAoaSheet(workbook, data, sheetName) {
  const { utils } = await getXlsx()
  const sheet = utils.aoa_to_sheet(data)
  utils.book_append_sheet(workbook, sheet, sheetName)
  return sheet
}

/**
 * Download workbook sebagai file .xlsx
 */
export async function downloadWorkbook(workbook, fileName, options = {}) {
  const { writeFileXLSX } = await getXlsx()
  writeFileXLSX(workbook, fileName, options)
}
