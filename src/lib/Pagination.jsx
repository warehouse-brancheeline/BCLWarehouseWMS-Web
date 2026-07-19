// ============================================================
// BCL Warehouse WMS - Pagination Component
// Komponen UI pagination yang reusable.
// ============================================================

import './Pagination.css'

function Pagination({
  currentPage,
  totalPages,
  totalItems,
  startItem,
  endItem,
  pageSize,
  pageSizeOptions,
  pageNumbers,
  hasPrevPage,
  hasNextPage,
  goToPage,
  goToFirstPage,
  goToLastPage,
  goToNextPage,
  goToPrevPage,
  changePageSize,
}) {
  if (totalItems === 0) {
    return null
  }

  return (
    <div className="pagination-container">
      <div className="pagination-info">
        <span>
          Menampilkan <strong>{startItem}</strong>–<strong>{endItem}</strong>{' '}
          dari <strong>{totalItems}</strong> data
        </span>

        <label className="pagination-size-label">
          <span>Per halaman:</span>
          <select
            className="pagination-size-select"
            value={pageSize}
            onChange={(e) => changePageSize(Number(e.target.value))}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      {totalPages > 1 ? (
        <div className="pagination-nav">
          <button
            className="pagination-btn"
            type="button"
            disabled={!hasPrevPage}
            onClick={goToFirstPage}
            title="Halaman pertama"
          >
            ««
          </button>

          <button
            className="pagination-btn"
            type="button"
            disabled={!hasPrevPage}
            onClick={goToPrevPage}
            title="Halaman sebelumnya"
          >
            «
          </button>

          {pageNumbers[0] > 1 ? (
            <span className="pagination-ellipsis">…</span>
          ) : null}

          {pageNumbers.map((page) => (
            <button
              key={page}
              className={`pagination-btn ${
                page === currentPage ? 'pagination-btn-active' : ''
              }`}
              type="button"
              onClick={() => goToPage(page)}
            >
              {page}
            </button>
          ))}

          {pageNumbers[pageNumbers.length - 1] < totalPages ? (
            <span className="pagination-ellipsis">…</span>
          ) : null}

          <button
            className="pagination-btn"
            type="button"
            disabled={!hasNextPage}
            onClick={goToNextPage}
            title="Halaman berikutnya"
          >
            »
          </button>

          <button
            className="pagination-btn"
            type="button"
            disabled={!hasNextPage}
            onClick={goToLastPage}
            title="Halaman terakhir"
          >
            »»
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default Pagination
