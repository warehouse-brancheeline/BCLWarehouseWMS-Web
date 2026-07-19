// ============================================================
// BCL Warehouse WMS - usePagination Hook
// Reusable hook untuk pagination di halaman list.
// ============================================================

import { useMemo, useState } from 'react'

const DEFAULT_PAGE_SIZE = 25
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

/**
 * @param {any[]} data - array data yang akan dipaginasi
 * @param {number} initialPageSize
 */
export function usePagination(data, initialPageSize = DEFAULT_PAGE_SIZE) {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  const totalItems = data.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  // Reset ke page 1 jika currentPage melebihi totalPages
  const safePage = Math.min(currentPage, totalPages)

  const paginatedData = useMemo(() => {
    const start = (safePage - 1) * pageSize
    const end = start + pageSize
    return data.slice(start, end)
  }, [data, safePage, pageSize])

  const goToPage = (page) => {
    const target = Math.max(1, Math.min(page, totalPages))
    setCurrentPage(target)
  }

  const goToFirstPage = () => goToPage(1)
  const goToLastPage = () => goToPage(totalPages)
  const goToNextPage = () => goToPage(safePage + 1)
  const goToPrevPage = () => goToPage(safePage - 1)

  const changePageSize = (newSize) => {
    setPageSize(newSize)
    setCurrentPage(1)
  }

  // Reset ke page 1 (dipanggil saat filter/search berubah)
  const resetPage = () => setCurrentPage(1)

  const hasPrevPage = safePage > 1
  const hasNextPage = safePage < totalPages

  // Generate page numbers untuk ditampilkan
  const pageNumbers = useMemo(() => {
    const pages = []
    const maxVisible = 5
    let start = Math.max(1, safePage - Math.floor(maxVisible / 2))
    let end = Math.min(totalPages, start + maxVisible - 1)

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1)
    }

    for (let i = start; i <= end; i++) {
      pages.push(i)
    }

    return pages
  }, [safePage, totalPages])

  // Info text: "Menampilkan 1-25 dari 150"
  const startItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endItem = Math.min(safePage * pageSize, totalItems)

  return {
    // Data
    paginatedData,

    // State
    currentPage: safePage,
    pageSize,
    totalItems,
    totalPages,
    startItem,
    endItem,

    // Navigation
    goToPage,
    goToFirstPage,
    goToLastPage,
    goToNextPage,
    goToPrevPage,
    hasPrevPage,
    hasNextPage,
    pageNumbers,

    // Config
    changePageSize,
    resetPage,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  }
}
