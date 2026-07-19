import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toInt, normalizeUpper } from '../lib/utils'
import './MasterEkspedisiPage.css'

const TABLE_RULES = 'courier_resi_rules'
const TABLE_SETTINGS = 'master_settings'
const SETTINGS_KEY_VERSION = 'courier_rules_version'

const matchTypeOptions = [
  { value: 'PREFIX', label: 'PREFIX (resi harus diawali prefix)' },
  { value: 'EXACT', label: 'EXACT (resi harus sama persis)' },
]

const bodyTypeOptions = [
  { value: 'ANY', label: 'ANY (bebas)' },
  { value: 'NUMERIC', label: 'NUMERIC (angka saja setelah prefix)' },
  { value: 'ALPHANUMERIC', label: 'ALPHANUMERIC (0-9 A-Z setelah prefix)' },
]

const INITIAL_FORM = {
  courier_code: '',
  courier_name: '',
  match_type: 'PREFIX',
  prefix: '',
  body_type: 'ANY',
  min_length: 0,
  max_length: 50,
  priority: 0,
  is_active: true,
}

function MasterEkspedisiPage({
  profile,
  loadingLogout,
  onBack,
  onLogout,
}) {
  const [rules, setRules] = useState([])
  const [loadingRules, setLoadingRules] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [version, setVersion] = useState('')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(INITIAL_FORM)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const resetForm = useCallback(() => {
    setEditingId(null)
    setForm(INITIAL_FORM)
  }, [])

  const loadVersion = useCallback(async () => {
    if (!supabase) {
      return
    }

    const { data, error: settingsError } = await supabase
      .from(TABLE_SETTINGS)
      .select('key, value')
      .eq('key', SETTINGS_KEY_VERSION)
      .maybeSingle()

    if (settingsError) {
      console.warn('Gagal load version settings:', settingsError)
      return
    }

    setVersion(data?.value ?? '')
  }, [])

  const loadRules = useCallback(async () => {
    if (!supabase) {
      setError('Supabase belum dikonfigurasi. Periksa .env.local.')
      setRules([])
      setLoadingRules(false)
      return
    }

    setLoadingRules(true)
    setError('')

    try {
      const { data, error: rulesError } = await supabase
        .from(TABLE_RULES)
        .select('*')
        .order('courier_code', { ascending: true })
        .order('priority', { ascending: false })
        .order('prefix', { ascending: true })

      if (rulesError) {
        throw rulesError
      }

      setRules(data ?? [])
      await loadVersion()
    } catch (loadError) {
      console.error('Gagal memuat rules:', loadError)
      setError(
        'Gagal memuat Master Ekspedisi. Pastikan tabel Supabase sudah dibuat dan RLS/policy benar.',
      )
      setRules([])
    } finally {
      setLoadingRules(false)
    }
  }, [loadVersion])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  useEffect(() => {
    if (!success) {
      return undefined
    }

    const t = window.setTimeout(() => setSuccess(''), 3500)
    return () => window.clearTimeout(t)
  }, [success])

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase()

    if (!q) {
      return rules
    }

    return rules.filter((r) => {
      const courierCode = String(r.courier_code || '').toLowerCase()
      const courierName = String(r.courier_name || '').toLowerCase()
      const prefix = String(r.prefix || '').toLowerCase()

      return (
        courierCode.includes(q) ||
        courierName.includes(q) ||
        prefix.includes(q)
      )
    })
  }, [rules, search])

  const startEdit = (rule) => {
    setEditingId(rule.id)
    setForm({
      courier_code: rule.courier_code ?? '',
      courier_name: rule.courier_name ?? '',
      match_type: rule.match_type ?? 'PREFIX',
      prefix: rule.prefix ?? '',
      body_type: rule.body_type ?? 'ANY',
      min_length: rule.min_length ?? 0,
      max_length: rule.max_length ?? 50,
      priority: rule.priority ?? 0,
      is_active: rule.is_active === true,
    })
    setError('')
    setSuccess('')
  }

  const validateForm = () => {
    const courier_code = normalizeUpper(form.courier_code)
    const courier_name = String(form.courier_name || '').trim()
    const prefix = normalizeUpper(form.prefix)

    if (!courier_code) {
      return 'Courier Code wajib diisi.'
    }

    if (!courier_name) {
      return 'Courier Name wajib diisi.'
    }

    if (!prefix) {
      return 'Prefix wajib diisi.'
    }

    const minLen = toInt(form.min_length, 0)
    const maxLen = toInt(form.max_length, 0)

    if (minLen < 0) {
      return 'Min length tidak boleh negatif.'
    }

    if (maxLen < minLen) {
      return 'Max length harus >= min length.'
    }

    return ''
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!supabase) {
      return
    }

    const validation = validateForm()

    if (validation) {
      setError(validation)
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    const payload = {
      courier_code: normalizeUpper(form.courier_code),
      courier_name: String(form.courier_name || '').trim(),
      match_type: form.match_type,
      prefix: normalizeUpper(form.prefix),
      body_type: form.body_type,
      min_length: toInt(form.min_length, 0),
      max_length: toInt(form.max_length, 50),
      priority: toInt(form.priority, 0),
      is_active: form.is_active === true,
    }

    try {
      if (editingId) {
        const { error: updateError } = await supabase
          .from(TABLE_RULES)
          .update(payload)
          .eq('id', editingId)

        if (updateError) {
          throw updateError
        }

        setSuccess('Rule berhasil diupdate.')
      } else {
        const { error: insertError } = await supabase
          .from(TABLE_RULES)
          .insert(payload)

        if (insertError) {
          throw insertError
        }

        setSuccess('Rule berhasil ditambahkan.')
      }

      resetForm()
      await loadRules()
    } catch (saveError) {
      console.error('Gagal menyimpan rule:', saveError)
      setError(
        'Gagal menyimpan rule. Cek apakah prefix sudah pernah dipakai, atau policy RLS admin belum benar.',
      )
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (rule) => {
    if (!supabase) {
      return
    }

    setError('')
    setSuccess('')

    try {
      const { error: updateError } = await supabase
        .from(TABLE_RULES)
        .update({ is_active: !(rule.is_active === true) })
        .eq('id', rule.id)

      if (updateError) {
        throw updateError
      }

      setSuccess('Status rule berhasil diubah.')
      await loadRules()
    } catch (e) {
      console.error('Gagal toggle active:', e)
      setError('Gagal mengubah status rule.')
    }
  }

  const requestDelete = (rule) => {
    setDeleteTarget(rule)
  }

  const executeDelete = async () => {
    if (!deleteTarget || !supabase) {
      return
    }

    const rule = deleteTarget
    setDeleteTarget(null)
    setError('')
    setSuccess('')

    try {
      const { error: deleteError } = await supabase
        .from(TABLE_RULES)
        .delete()
        .eq('id', rule.id)

      if (deleteError) {
        throw deleteError
      }

      setSuccess('Rule berhasil dihapus.')
      await loadRules()
    } catch (e) {
      console.error('Gagal delete rule:', e)
      setError('Gagal menghapus rule.')
    }
  }

  return (
    <main className="master-expedisi-page">
      <header className="master-expedisi-header">
        <div>
          <p className="small-label">BCL Warehouse WMS</p>
          <h1>Master Ekspedisi</h1>
          <p className="master-expedisi-subtitle">
            Kelola rule prefix/format resi untuk validasi handover (tanpa
            update APK).
          </p>
        </div>

        <div className="master-expedisi-actions">
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
            disabled={loadingRules}
            onClick={loadRules}
          >
            {loadingRules ? 'Memuat...' : 'Refresh'}
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

      <section className="master-expedisi-content">
        <div className="master-expedisi-grid">
          <section className="master-expedisi-panel">
            <h2>{editingId ? 'Edit Rule' : 'Tambah Rule'}</h2>

            <p className="master-expedisi-small">
              Admin aktif:{' '}
              <strong>{profile?.full_name || profile?.email || '-'}</strong>
              {version ? (
                <>
                  <br />
                  Version rules: <strong>{version}</strong>
                </>
              ) : null}
            </p>

            <form className="master-expedisi-form" onSubmit={handleSubmit}>
              <div className="row-2">
                <div>
                  <label>Courier Code</label>
                  <input
                    value={form.courier_code}
                    onChange={(e) =>
                      setForm((c) => ({
                        ...c,
                        courier_code: e.target.value,
                      }))
                    }
                    placeholder="Contoh: SPX / JT / JNE / IDX"
                  />
                </div>
                <div>
                  <label>Courier Name</label>
                  <input
                    value={form.courier_name}
                    onChange={(e) =>
                      setForm((c) => ({
                        ...c,
                        courier_name: e.target.value,
                      }))
                    }
                    placeholder="Contoh: Shopee Express"
                  />
                </div>
              </div>

              <div className="row-3">
                <div>
                  <label>Match Type</label>
                  <select
                    value={form.match_type}
                    onChange={(e) =>
                      setForm((c) => ({ ...c, match_type: e.target.value }))
                    }
                  >
                    {matchTypeOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>Body Type</label>
                  <select
                    value={form.body_type}
                    onChange={(e) =>
                      setForm((c) => ({ ...c, body_type: e.target.value }))
                    }
                  >
                    {bodyTypeOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>Priority</label>
                  <input
                    type="number"
                    value={form.priority}
                    onChange={(e) =>
                      setForm((c) => ({ ...c, priority: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div>
                <label>Prefix</label>
                <input
                  value={form.prefix}
                  onChange={(e) =>
                    setForm((c) => ({ ...c, prefix: e.target.value }))
                  }
                  placeholder="Contoh: SPXID / JX / CM / IDS / 306770..."
                />
              </div>

              <div className="row-2">
                <div>
                  <label>Min Length</label>
                  <input
                    type="number"
                    value={form.min_length}
                    onChange={(e) =>
                      setForm((c) => ({ ...c, min_length: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label>Max Length</label>
                  <input
                    type="number"
                    value={form.max_length}
                    onChange={(e) =>
                      setForm((c) => ({ ...c, max_length: e.target.value }))
                    }
                  />
                </div>
              </div>

              <label
                style={{ display: 'flex', gap: 10, alignItems: 'center' }}
              >
                <input
                  type="checkbox"
                  checked={form.is_active === true}
                  onChange={(e) =>
                    setForm((c) => ({ ...c, is_active: e.target.checked }))
                  }
                />
                Aktif
              </label>

              <div className="master-expedisi-form-actions">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? 'Menyimpan...' : editingId ? 'Update' : 'Tambah'}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Reset
                </button>
              </div>

              {error ? (
                <div className="error-message">{error}</div>
              ) : null}

              {success ? (
                <div
                  className="error-message"
                  style={{
                    borderColor: '#bbf7d0',
                    color: '#166534',
                    background: '#f0fdf4',
                  }}
                >
                  {success}
                </div>
              ) : null}
            </form>
          </section>

          <section className="master-expedisi-panel">
            <div className="master-expedisi-toolbar">
              <h2 style={{ margin: 0 }}>Daftar Rule</h2>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari courier / prefix..."
              />
            </div>

            <p className="master-expedisi-small" style={{ marginTop: 0 }}>
              Total: <strong>{filteredRules.length}</strong>{' '}
              {loadingRules ? '(memuat...)' : null}
            </p>

            <div className="master-expedisi-table-wrapper">
              <table className="master-expedisi-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Courier</th>
                    <th>Prefix</th>
                    <th>Match</th>
                    <th>Body</th>
                    <th>Len</th>
                    <th>Priority</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRules.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span
                          className={[
                            'master-expedisi-pill',
                            r.is_active
                              ? 'master-expedisi-pill-active'
                              : 'master-expedisi-pill-inactive',
                          ].join(' ')}
                        >
                          {r.is_active ? 'ACTIVE' : 'OFF'}
                        </span>
                      </td>
                      <td>
                        <strong>{r.courier_code}</strong>
                        <div style={{ color: '#6f788c', fontSize: 12 }}>
                          {r.courier_name}
                        </div>
                      </td>
                      <td>
                        <strong>{r.prefix}</strong>
                      </td>
                      <td>{r.match_type}</td>
                      <td>{r.body_type}</td>
                      <td>
                        {r.min_length} - {r.max_length}
                      </td>
                      <td>{r.priority}</td>
                      <td>
                        <div className="master-expedisi-row-actions">
                          <button
                            className="master-expedisi-link"
                            type="button"
                            onClick={() => startEdit(r)}
                          >
                            Edit
                          </button>
                          <button
                            className="master-expedisi-link"
                            type="button"
                            onClick={() => toggleActive(r)}
                          >
                            {r.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                          <button
                            className="master-expedisi-danger"
                            type="button"
                            onClick={() => requestDelete(r)}
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filteredRules.length ? (
                    <tr>
                      <td
                        colSpan={8}
                        style={{ color: '#6f788c', padding: 18 }}
                      >
                        Tidak ada data.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
      {/* Modal Konfirmasi Hapus */}
      {deleteTarget ? (
        <div
          className="master-expedisi-confirm-backdrop"
          role="presentation"
          onClick={() => setDeleteTarget(null)}
        >
          <section
            className="master-expedisi-confirm-dialog"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Konfirmasi Hapus Rule</h2>

            <p>
              Hapus rule ini? Data akan dihapus permanen.
            </p>

            <div className="master-expedisi-confirm-info">
              <p><strong>Courier:</strong> {deleteTarget.courier_code}</p>
              <p><strong>Prefix:</strong> {deleteTarget.prefix}</p>
            </div>

            <div className="master-expedisi-confirm-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setDeleteTarget(null)}
              >
                Batal
              </button>

              <button
                className="master-expedisi-danger"
                type="button"
                onClick={executeDelete}
                style={{ padding: '8px 20px' }}
              >
                Ya, Hapus
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default MasterEkspedisiPage
