// ============================================================
// BCL Warehouse WMS - Toast Notification System
// Reusable toast yang konsisten di semua halaman.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import './Toast.css'

// ─── Hook ───────────────────────────────────────────────────
export function useToast(defaultDuration = 3000) {
  const [toasts, setToasts] = useState([])
  const counterRef = useRef(0)

  const addToast = useCallback(
    (message, type = 'info', duration = defaultDuration) => {
      const id = ++counterRef.current

      setToasts((current) => [
        ...current,
        { id, message, type },
      ])

      setTimeout(() => {
        setToasts((current) =>
          current.filter((toast) => toast.id !== id),
        )
      }, duration)
    },
    [defaultDuration],
  )

  const toast = useCallback(
    (message, duration) => addToast(message, 'info', duration),
    [addToast],
  )

  const toastSuccess = useCallback(
    (message, duration) => addToast(message, 'success', duration),
    [addToast],
  )

  const toastError = useCallback(
    (message, duration) => addToast(message, 'error', duration),
    [addToast],
  )

  const toastWarning = useCallback(
    (message, duration) => addToast(message, 'warning', duration),
    [addToast],
  )

  const dismissToast = useCallback((id) => {
    setToasts((current) =>
      current.filter((toast) => toast.id !== id),
    )
  }, [])

  return {
    toasts,
    toast,
    toastSuccess,
    toastError,
    toastWarning,
    dismissToast,
  }
}

// ─── Component ──────────────────────────────────────────────
const ICONS = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
}

function ToastItem({ toast, onDismiss }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className={`toast-item toast-item--${toast.type} ${
        visible ? 'toast-item--visible' : ''
      }`}
      role="alert"
      aria-live="polite"
    >
      <span className="toast-icon">{ICONS[toast.type]}</span>
      <span className="toast-message">{toast.message}</span>
      <button
        className="toast-dismiss"
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Tutup notifikasi"
      >
        ×
      </button>
    </div>
  )
}

export function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) {
    return null
  }

  return (
    <div className="toast-container" aria-label="Notifikasi">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  )
}
