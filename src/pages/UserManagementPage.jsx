import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { supabase } from '../lib/supabase'
import './UserManagementPage.css'

const roleOptions = [
  {
    value: 'staff',
    label: 'Staff',
  },
  {
    value: 'marketplace',
    label: 'Marketplace',
  },
  {
    value: 'admin_warehouse',
    label: 'Admin Warehouse',
  },
  {
    value: 'admin',
    label: 'Admin',
  },
]

function getRoleLabel(role) {
  const selectedRole = roleOptions.find(
    (option) => option.value === role,
  )

  return selectedRole?.label || role || '-'
}

function formatDate(value) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Makassar',
  }).format(date)
}

async function invokeAdminCreateUser(payload) {
  const {
    data: sessionData,
    error: sessionError,
  } = await supabase.auth.getSession()

  const currentSession =
    sessionData?.session

  if (
    sessionError ||
    !currentSession?.access_token
  ) {
    throw new Error(
      'Session login tidak ditemukan. Silakan login ulang.',
    )
  }

  const supabaseUrl = String(
    import.meta.env.VITE_SUPABASE_URL || '',
  ).replace(/\/$/, '')

  const apiKey =
    import.meta.env
      .VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env
      .VITE_SUPABASE_ANON_KEY ||
    ''

  if (!supabaseUrl || !apiKey) {
    throw new Error(
      'Konfigurasi Supabase pada website belum lengkap.',
    )
  }

  const response = await fetch(
    `${supabaseUrl}/functions/v1/admin-create-user`,
    {
      method: 'POST',
      headers: {
        Authorization:
          `Bearer ${currentSession.access_token}`,
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  )

  const responseText =
    await response.text()

  let result = null

  if (responseText) {
    try {
      result = JSON.parse(responseText)
    } catch {
      result = {
        message: responseText,
      }
    }
  }

  if (!response.ok) {
    console.error(
      'Admin create user gagal:',
      {
        status: response.status,
        responseText,
        result,
      },
    )

    const responseMessage =
      typeof result?.message === 'string'
        ? result.message.trim()
        : ''

    const technicalMessage =
      typeof result?.technicalMessage === 'string'
        ? result.technicalMessage.trim()
        : ''

    const errorMessage =
      typeof result?.error === 'string'
        ? result.error.trim()
        : ''

    const usefulMessage = [
      responseMessage,
      technicalMessage,
      errorMessage,
    ].find(
      (message) =>
        message &&
        message !== '{}' &&
        message !== '[]',
    )

    throw new Error(
      usefulMessage ||
      `Edge Function gagal merespons. HTTP ${response.status}.`,
    )
  }

  if (!result?.success) {
    throw new Error(
      typeof result?.message === 'string' &&
      result.message.trim()
        ? result.message
        : 'Server tidak memberikan hasil pendaftaran yang valid.',
    )
  }

  return result
}

function UserManagementPage({
  profile,
  loadingLogout,
  onBack,
  onLogout,
}) {
  const [users, setUsers] = useState([])

  const [fullName, setFullName] =
    useState('')

  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [role, setRole] =
    useState('staff')

  const [
    showPassword,
    setShowPassword,
  ] = useState(false)

  const [
    loadingUsers,
    setLoadingUsers,
  ] = useState(true)

  const [
    submitting,
    setSubmitting,
  ] = useState(false)

  const [error, setError] =
    useState('')

  const [success, setSuccess] =
    useState('')

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true)
    setError('')

    const {
      data,
      error: usersError,
    } = await supabase
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
      .order('created_at', {
        ascending: false,
      })

    if (usersError) {
      console.error(
        'Gagal memuat daftar user:',
        usersError,
      )

      setError(
        'Gagal memuat daftar user.',
      )
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

    const timer = window.setTimeout(() => {
      setSuccess('')
    }, 5000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [success])

  const summary = useMemo(() => {
    const activeUsers = users.filter(
      (user) => user.is_active === true,
    ).length

    const adminUsers = users.filter(
      (user) => user.role === 'admin',
    ).length

    return {
      total: users.length,
      active: activeUsers,
      inactive:
        users.length - activeUsers,
      admin: adminUsers,
    }
  }, [users])

  const resetForm = () => {
    setFullName('')
    setEmail('')
    setPassword('')
    setRole('staff')
    setShowPassword(false)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const normalizedName =
      fullName.trim()

    const normalizedEmail =
      email.trim().toLowerCase()

    if (!normalizedName) {
      setError(
        'Nama lengkap wajib diisi.',
      )
      return
    }

    if (
      !normalizedEmail ||
      !normalizedEmail.includes('@')
    ) {
      setError(
        'Email tidak valid.',
      )
      return
    }

    if (password.length < 8) {
      setError(
        'Password minimal 8 karakter.',
      )
      return
    }

    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const data =
        await invokeAdminCreateUser({
          fullName: normalizedName,
          email: normalizedEmail,
          password,
          role,
        })

      setSuccess(
        data?.message ||
        `${normalizedName} berhasil didaftarkan.`,
      )

      resetForm()
      await loadUsers()
    } catch (submitError) {
      console.error(
        'Gagal mendaftarkan user:',
        submitError,
      )

      const rawMessage =
        typeof submitError?.message === 'string'
          ? submitError.message.trim()
          : ''

      const safeMessage =
        rawMessage &&
        rawMessage !== '{}' &&
        rawMessage !== '[]'
          ? rawMessage
          : 'Edge Function gagal merespons. Periksa deployment dan login ulang.'

      setError(safeMessage)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="user-management-page">
      <header className="user-management-header">
        <div>
          <p className="small-label">
            BCL Warehouse WMS
          </p>

          <h1>Manajemen User</h1>

          <p className="user-management-subtitle">
            Daftarkan akun pengguna baru
            untuk aplikasi dan website WMS.
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
            {loadingUsers
              ? 'Memuat...'
              : 'Refresh'}
          </button>

          <button
            className="secondary-button"
            type="button"
            disabled={loadingLogout}
            onClick={onLogout}
          >
            {loadingLogout
              ? 'Keluar...'
              : 'Logout'}
          </button>
        </div>
      </header>

      <section className="user-management-content">
        <article className="admin-information">
          <div>
            <span>Admin aktif</span>

            <strong>
              {profile?.full_name ||
                profile?.email ||
                '-'}
            </strong>
          </div>

          <div>
            <span>Role</span>

            <strong>
              {getRoleLabel(
                profile?.role,
              )}
            </strong>
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
          <section className="user-management-panel">
            <div className="panel-heading">
              <div>
                <h2>Daftarkan User</h2>

                <p>
                  Akun akan langsung aktif dan
                  bisa digunakan untuk login.
                </p>
              </div>
            </div>

            <form
              className="user-form"
              onSubmit={handleSubmit}
            >
              <label htmlFor="full-name">
                Nama Lengkap
              </label>

              <input
                id="full-name"
                type="text"
                value={fullName}
                placeholder="Contoh: Putri"
                autoComplete="name"
                disabled={submitting}
                onChange={(event) =>
                  setFullName(
                    event.target.value,
                  )
                }
              />

              <label htmlFor="new-user-email">
                Email
              </label>

              <input
                id="new-user-email"
                type="email"
                value={email}
                placeholder="nama@brancheeline.com"
                autoComplete="off"
                disabled={submitting}
                onChange={(event) =>
                  setEmail(
                    event.target.value,
                  )
                }
              />

              <label htmlFor="new-user-password">
                Password
              </label>

              <div className="user-password-wrapper">
                <input
                  id="new-user-password"
                  type={
                    showPassword
                      ? 'text'
                      : 'password'
                  }
                  value={password}
                  placeholder="Minimal 8 karakter"
                  autoComplete="new-password"
                  disabled={submitting}
                  onChange={(event) =>
                    setPassword(
                      event.target.value,
                    )
                  }
                />

                <button
                  className="user-show-password"
                  type="button"
                  disabled={submitting}
                  onClick={() =>
                    setShowPassword(
                      (current) => !current,
                    )
                  }
                >
                  {showPassword
                    ? 'Sembunyikan'
                    : 'Lihat'}
                </button>
              </div>

              <label htmlFor="new-user-role">
                Role
              </label>

              <select
                id="new-user-role"
                value={role}
                disabled={submitting}
                onChange={(event) =>
                  setRole(
                    event.target.value,
                  )
                }
              >
                {roleOptions.map(
                  (option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ),
                )}
              </select>

              {error ? (
                <div className="user-error-message">
                  {error}
                </div>
              ) : null}

              {success ? (
                <div className="user-success-message">
                  {success}
                </div>
              ) : null}

              <button
                className="primary-button user-submit-button"
                type="submit"
                disabled={submitting}
              >
                {submitting
                  ? 'Mendaftarkan...'
                  : 'Daftarkan User'}
              </button>
            </form>
          </section>

          <section className="user-management-panel user-list-panel">
            <div className="panel-heading">
              <div>
                <h2>Daftar User</h2>

                <p>
                  Seluruh akun yang terdaftar
                  di BCL Warehouse WMS.
                </p>
              </div>
            </div>

            {loadingUsers ? (
              <div className="user-list-message">
                <div className="spinner" />
                <p>Memuat daftar user...</p>
              </div>
            ) : null}

            {!loadingUsers &&
            users.length === 0 ? (
              <div className="user-list-message">
                Belum ada data user.
              </div>
            ) : null}

            {!loadingUsers &&
            users.length > 0 ? (
              <div className="user-table-wrapper">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>Nama</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Dibuat</th>
                    </tr>
                  </thead>

                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td>
                          {user.full_name || '-'}
                        </td>

                        <td>
                          {user.email || '-'}
                        </td>

                        <td>
                          <span className="user-role-badge">
                            {getRoleLabel(
                              user.role,
                            )}
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
                            {user.is_active
                              ? 'Aktif'
                              : 'Nonaktif'}
                          </span>
                        </td>

                        <td>
                          {formatDate(
                            user.created_at,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  )
}

export default UserManagementPage
