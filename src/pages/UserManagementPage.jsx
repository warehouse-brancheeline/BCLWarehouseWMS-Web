import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/utils'
import Pagination from '../lib/Pagination'
import { usePagination } from '../lib/usePagination'
import { ToastContainer, useToast } from '../lib/Toast'
import './UserManagementPage.css'

const roleOptions = [
  { value: 'staff', label: 'Staff' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'admin_warehouse', label: 'Admin Warehouse' },
  { value: 'admin', label: 'Admin' },
]

function getRoleLabel(role) {
  const selectedRole = roleOptions.find((option) => option.value === role)
  return selectedRole?.label || role || '-'
}

async function invokeAdminCreateUser(payload) {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession()

  const currentSession = sessionData?.session

  if (sessionError || !currentSession?.access_token) {
    throw new Error('Session login tidak ditemukan. Silakan login ulang.')
  }

  const supabaseUrl = String(
    import.meta.env.VITE_SUPABASE_URL || '',
  ).replace(/\/$/, '')

  const apiKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    ''

  if (!supabaseUrl || !apiKey) {
    throw new Error('Konfigurasi Supabase pada website belum lengkap.')
  }

  const response = await fetch(
    `${supabaseUrl}/functions/v1/admin-create-user`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${currentSession.access_token}`,
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  )

  const responseText = await response.text()
  let result = null

  if (responseText) {
    try {
      result = JSON.parse(responseText)
    } catch {
      result = { message: responseText }
    }
  }

  if (!response.ok) {
    console.error('Admin create user gagal:', {
      status: response.status,
      responseText,
      result,
    })

    const usefulMessage = [
      result?.message,
      result?.technicalMessage,
      result?.error,
    ]
      .map((m) => (typeof m === 'string' ? m.trim() : ''))
      .find((m) => m && m !== '{}' && m !== '[]')

    throw new Error(
      usefulMessage || `Edge Function gagal merespons. HTTP ${response.status}.`,
    )
  }

  if (!result?.success) {
    throw new Error(
      typeof result?.message === 'string' && result.message.trim()
        ? result.message
        : 'Server tidak memberikan hasil pendaftaran yang valid.',
    )
  }

  return result
}

// ─── Mode form: 'create' | 'edit' ───────────────────────────
const INITIAL_FORM = {
  fullName: '',
  email: '',
  password: '',
  role: 'staff',
  isActive: true,
}

function UserManagementPage({
  profile,
  loadingLogout,
  onBack,
  onLogout,
}) {
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [search, setSearch] = useState('')

  // Form state
  const [formMode, setFormMode] = useState('create') // 'create' | 'edit'
  const [editingUser, setEditingUser] = useState(null)
  const [form, setForm] = useState(INITIAL_FORM)

  // Confirm dialog untuk nonaktifkan/aktifkan
  const [confirmTarget, setConfirmTarget] = useState(null)
  // confirmTarget = { user, action: 'activate' | 'deactivate' } | null

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true)
    setError('')

    const { data, error: usersError } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        full_name,
        role,
        is_active,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })

    if (usersError) {
      console.error('Gagal memuat daftar user:', usersError)
      setError('Gagal memuat daftar user.')
      setUsers([])
    } else {
      setUsers(data ?? [])
    }

    setLoadingUsers(false)
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  useEffect(() => {
    if (!success) {
      return undefined
    }

    const timer = window.setTimeout(() => setSuccess(''), 5000)
    return () => window.clearTimeout(timer)
  }, [success])

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users

    return users.filter((user) => {
      return (
        String(user.full_name || '').toLowerCase().includes(q) ||
        String(user.email || '').toLowerCase().includes(q) ||
        String(user.role || '').toLowerCase().includes(q)
      )
    })
  }, [users, search])

  const pagination = usePagination(filteredUsers, 10)

  const summary = useMemo(() => {
    const activeUsers = users.filter((u) => u.is_active === true).length
    const adminUsers = users.filter((u) => u.role === 'admin').length

    return {
      total: users.length,
      active: activeUsers,
      inactive: users.length - activeUsers,
      admin: adminUsers,
    }
  }, [users])

  const resetForm = () => {
    setForm(INITIAL_FORM)
    setFormMode('create')
    setEditingUser(null)
    setShowPassword(false)
    setError('')
  }

  const startEdit = (user) => {
    setFormMode('edit')
    setEditingUser(user)
    setForm({
      fullName: user.full_name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'staff',
      isActive: user.is_active === true,
    })
    setError('')
    setSuccess('')
    // Scroll ke form
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmitCreate = async () => {
    const normalizedName = form.fullName.trim()
    const normalizedEmail = form.email.trim().toLowerCase()

    if (!normalizedName) {
      setError('Nama lengkap wajib diisi.')
      return
    }

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Email tidak valid.')
      return
    }

    if (form.password.length < 8) {
      setError('Password minimal 8 karakter.')
      return
    }

    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const data = await invokeAdminCreateUser({
        fullName: normalizedName,
        email: normalizedEmail,
        password: form.password,
        role: form.role,
      })

      setSuccess(data?.message || `${normalizedName} berhasil didaftarkan.`)
      resetForm()
      await loadUsers()
    } catch (submitError) {
      console.error('Gagal mendaftarkan user:', submitError)
      const rawMessage =
        typeof submitError?.message === 'string'
          ? submitError.message.trim()
          : ''

      setError(
        rawMessage && rawMessage !== '{}' && rawMessage !== '[]'
          ? rawMessage
          : 'Edge Function gagal merespons. Periksa deployment dan login ulang.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitEdit = async () => {
    if (!editingUser) return

    const normalizedName = form.fullName.trim()

    if (!normalizedName) {
      setError('Nama lengkap wajib diisi.')
      return
    }

    if (form.password && form.password.length < 8) {
      setError('Password minimal 8 karakter.')
      return
    }

    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      // Update profile di tabel profiles
      const updatePayload = {
        full_name: normalizedName,
        role: form.role,
        is_active: form.isActive,
        updated_at: new Date().toISOString(),
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', editingUser.id)

      if (updateError) {
        throw updateError
      }

      setSuccess(`Data ${normalizedName} berhasil diperbarui.`)
      resetForm()
      await loadUsers()
    } catch (editError) {
      console.error('Gagal edit user:', editError)
      setError(
        editError?.message || 'Gagal memperbarui data user.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (formMode === 'edit') {
      handleSubmitEdit()
    } else {
      handleSubmitCreate()
    }
  }

  const requestToggleActive = (user) => {
    const action = user.is_active ? 'deactivate' : 'activate'
    setConfirmTarget({ user, action })
  }

  const executeToggleActive = async () => {
    if (!confirmTarget) return

    const { user, action } = confirmTarget
    setConfirmTarget(null)
    setError('')
    setSuccess('')

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          is_active: action === 'activate',
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (updateError) {
        throw updateError
      }

      const name = user.full_name || user.email || 'User'
      setSuccess(
        action === 'activate'
          ? `${name} berhasil diaktifkan.`
          : `${name} berhasil dinonaktifkan.`,
      )

      await loadUsers()
    } catch (err) {
      console.error('Gagal toggle active:', err)
      setError(err?.message || 'Gagal mengubah status user.')
    }
  }

  return (
    <main className="user-management-page">
      <header className="user-management-header">
        <div>
          <p className="small-label">BCL Warehouse WMS</p>
          <h1>Manajemen User</h1>
          <p className="user-management-subtitle">
            Daftarkan dan kelola akun pengguna WMS.
          </p>
        </div>

        <div className="user-management-actions">
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
            disabled={loadingUsers}
            onClick={loadUsers}
          >
            {loadingUsers ? 'Memuat...' : 'Refresh'}
          </button>

          <button
            className="secondary-button"
            type="button"
            disabled={loadingLogout}
            onClick={onLogout}
          >
            {loadingLogout ? 'Keluar...' : 'Logout'}
          </button>
        </div>
      </header>

      <section className="user-management-content">
        <article className="admin-information">
          <div>
            <span>Admin aktif</span>
            <strong>{profile?.full_name || profile?.email || '-'}</strong>
          </div>
          <div>
            <span>Role</span>
            <strong>{getRoleLabel(profile?.role)}</strong>
          </div>
        </article>

        <div className="user-summary-grid">
          <article className="user-summary-card">
            <p>Total User</p>
            <strong>{summary.total}</strong>
          </article>
          <article className="user-summary-card">
            <p>User Aktif</p>
            <strong>{summary.active}</strong>
          </article>
          <article className="user-summary-card">
            <p>User Nonaktif</p>
            <strong>{summary.inactive}</strong>
          </article>
          <article className="user-summary-card">
            <p>Total Admin</p>
            <strong>{summary.admin}</strong>
          </article>
        </div>

        <div className="user-management-grid">
          {/* ── Form Panel ── */}
          <section className="user-management-panel">
            <div className="panel-heading">
              <div>
                <h2>
                  {formMode === 'edit'
                    ? `Edit User: ${editingUser?.full_name || editingUser?.email || ''}`
                    : 'Daftarkan User'}
                </h2>
                <p>
                  {formMode === 'edit'
                    ? 'Ubah nama, role, atau status user.'
                    : 'Akun akan langsung aktif dan bisa digunakan untuk login.'}
                </p>
              </div>

              {formMode === 'edit' ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={resetForm}
                  style={{ marginTop: '8px' }}
                >
                  Batal Edit
                </button>
              ) : null}
            </div>

            <form className="user-form" onSubmit={handleSubmit}>
              <label htmlFor="full-name">Nama Lengkap</label>
              <input
                id="full-name"
                type="text"
                value={form.fullName}
                placeholder="Contoh: Putri"
                autoComplete="name"
                disabled={submitting}
                onChange={(event) =>
                  setForm((c) => ({ ...c, fullName: event.target.value }))
                }
              />

              <label htmlFor="new-user-email">Email</label>
              <input
                id="new-user-email"
                type="email"
                value={form.email}
                placeholder="nama@brancheeline.com"
                autoComplete="off"
                disabled={submitting || formMode === 'edit'}
                style={
                  formMode === 'edit'
                    ? { opacity: 0.6, cursor: 'not-allowed' }
                    : {}
                }
                onChange={(event) =>
                  setForm((c) => ({ ...c, email: event.target.value }))
                }
              />

              {formMode === 'create' ? (
                <>
                  <label htmlFor="new-user-password">Password</label>
                  <div className="user-password-wrapper">
                    <input
                      id="new-user-password"
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      placeholder="Minimal 8 karakter"
                      autoComplete="new-password"
                      disabled={submitting}
                      onChange={(event) =>
                        setForm((c) => ({
                          ...c,
                          password: event.target.value,
                        }))
                      }
                    />
                    <button
                      className="user-show-password"
                      type="button"
                      disabled={submitting}
                      onClick={() => setShowPassword((c) => !c)}
                    >
                      {showPassword ? 'Sembunyikan' : 'Lihat'}
                    </button>
                  </div>
                </>
              ) : null}

              <label htmlFor="new-user-role">Role</label>
              <select
                id="new-user-role"
                value={form.role}
                disabled={submitting}
                onChange={(event) =>
                  setForm((c) => ({ ...c, role: event.target.value }))
                }
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              {formMode === 'edit' ? (
                <>
                  <label>Status</label>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.isActive === true}
                      disabled={submitting}
                      onChange={(event) =>
                        setForm((c) => ({
                          ...c,
                          isActive: event.target.checked,
                        }))
                      }
                    />
                    <span>Aktif</span>
                  </label>
                </>
              ) : null}

              {error ? (
                <div className="user-error-message">{error}</div>
              ) : null}

              {success ? (
                <div className="user-success-message">{success}</div>
              ) : null}

              <button
                className="primary-button user-submit-button"
                type="submit"
                disabled={submitting}
              >
                {submitting
                  ? formMode === 'edit'
                    ? 'Menyimpan...'
                    : 'Mendaftarkan...'
                  : formMode === 'edit'
                    ? 'Simpan Perubahan'
                    : 'Daftarkan User'}
              </button>
            </form>
          </section>

          {/* ── List Panel ── */}
          <section className="user-management-panel user-list-panel">
            <div className="panel-heading">
              <div>
                <h2>Daftar User</h2>
                <p>Seluruh akun yang terdaftar di BCL Warehouse WMS.</p>
              </div>
            </div>

            {/* Search */}
            <div style={{ marginBottom: '12px' }}>
              <input
                type="search"
                value={search}
                placeholder="Cari nama, email, atau role..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
                onChange={(event) => {
                  setSearch(event.target.value)
                  pagination.resetPage()
                }}
              />
            </div>

            {loadingUsers ? (
              <div className="user-list-message">
                <div className="spinner" />
                <p>Memuat daftar user...</p>
              </div>
            ) : null}

            {!loadingUsers && users.length === 0 ? (
              <div className="user-list-message">Belum ada data user.</div>
            ) : null}

            {!loadingUsers && users.length > 0 ? (
              <>
                <div className="user-table-wrapper">
                  <table className="user-table">
                    <thead>
                      <tr>
                        <th>Nama</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Dibuat</th>
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagination.totalItems === 0 ? (
                        <tr>
                          <td
                            colSpan="6"
                            style={{
                              textAlign: 'center',
                              padding: '20px',
                              color: '#6b7280',
                            }}
                          >
                            Tidak ada user yang cocok.
                          </td>
                        </tr>
                      ) : (
                        pagination.paginatedData.map((user) => (
                          <tr
                            key={user.id}
                            style={
                              editingUser?.id === user.id
                                ? { background: '#eff6ff' }
                                : {}
                            }
                          >
                            <td>{user.full_name || '-'}</td>
                            <td>{user.email || '-'}</td>
                            <td>
                              <span className="user-role-badge">
                                {getRoleLabel(user.role)}
                              </span>
                            </td>
                            <td>
                              <span
                                className={
                                  user.is_active
                                    ? 'user-status-active'
                                    : 'user-status-inactive'
                                }
                              >
                                {user.is_active ? 'Aktif' : 'Nonaktif'}
                              </span>
                            </td>
                            <td>{formatDate(user.created_at)}</td>
                            <td>
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '6px',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <button
                                  className="secondary-button"
                                  type="button"
                                  style={{
                                    padding: '4px 10px',
                                    minHeight: 'auto',
                                    fontSize: '13px',
                                  }}
                                  onClick={() => startEdit(user)}
                                  disabled={
                                    submitting ||
                                    editingUser?.id === user.id
                                  }
                                >
                                  Edit
                                </button>

                                <button
                                  className={
                                    user.is_active
                                      ? 'user-deactivate-btn'
                                      : 'user-activate-btn'
                                  }
                                  type="button"
                                  style={{
                                    padding: '4px 10px',
                                    minHeight: 'auto',
                                    fontSize: '13px',
                                  }}
                                  onClick={() => requestToggleActive(user)}
                                  disabled={submitting}
                                >
                                  {user.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <Pagination {...pagination} />
              </>
            ) : null}
          </section>
        </div>
      </section>

      {/* Modal Konfirmasi Toggle Active */}
      {confirmTarget ? (
        <div
          className="user-confirm-backdrop"
          role="presentation"
          onClick={() => setConfirmTarget(null)}
        >
          <section
            className="user-confirm-dialog"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>
              {confirmTarget.action === 'deactivate'
                ? 'Nonaktifkan User'
                : 'Aktifkan User'}
            </h2>

            <p>
              {confirmTarget.action === 'deactivate'
                ? `Nonaktifkan akun ${
                    confirmTarget.user.full_name ||
                    confirmTarget.user.email
                  }? User tidak akan bisa login.`
                : `Aktifkan kembali akun ${
                    confirmTarget.user.full_name ||
                    confirmTarget.user.email
                  }? User akan bisa login kembali.`}
            </p>

            <div className="user-confirm-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setConfirmTarget(null)}
              >
                Batal
              </button>

              <button
                className={
                  confirmTarget.action === 'deactivate'
                    ? 'user-deactivate-btn'
                    : 'primary-button'
                }
                type="button"
                onClick={executeToggleActive}
              >
                {confirmTarget.action === 'deactivate'
                  ? 'Ya, Nonaktifkan'
                  : 'Ya, Aktifkan'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default UserManagementPage
