import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './CourierMasterPage.css'

export default function CourierMasterPage({ onBack }) {
  const [couriers, setCouriers] = useState([])
  const [appVersion, setAppVersion] = useState('-')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // Modal State
  const [selectedCourier, setSelectedCourier] = useState(null)
  const [newPrefix, setNewPrefix] = useState('')
  const [newMin, setNewMin] = useState('10')
  const [newMax, setNewMax] = useState('25')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    
    try {
      const { data: settingData, error: settingError } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'courier_version')
        .single()
        
      if (settingError && settingError.code !== 'PGRST116') throw settingError
      if (settingData) setAppVersion(settingData.setting_value)

      const { data: courierData, error: courierError } = await supabase
        .from('courier_master')
        .select('*')
        .order('courier_name', { ascending: true })

      if (courierError) throw courierError

      const { data: prefixData, error: prefixError } = await supabase
        .from('courier_prefix_rules')
        .select('*')
        .eq('is_active', true)
        .order('prefix', { ascending: true })

      if (prefixError) throw prefixError

      const mappedCouriers = courierData.map(courier => {
        const rules = prefixData.filter(p => p.courier_id === courier.id)
        return { ...courier, rules }
      })

      setCouriers(mappedCouriers)

      // Jika modal sedang terbuka, perbarui data courier yang dipilih
      if (selectedCourier) {
        const updatedSelected = mappedCouriers.find(c => c.id === selectedCourier.id)
        if (updatedSelected) setSelectedCourier(updatedSelected)
      }

    } catch (err) {
      console.error(err)
      setError(err.message || 'Gagal memuat data master ekspedisi.')
    } finally {
      setLoading(false)
    }
  }, [selectedCourier])

  useEffect(() => {
    loadData()
  }, [loadData])

  // --- Fungsi untuk memanipulasi version ---
  const incrementVersion = async () => {
    try {
      const currentVer = parseInt(appVersion, 10) || 0
      const nextVer = currentVer + 1
      
      const { error } = await supabase
        .from('app_settings')
        .upsert({ 
          setting_key: 'courier_version', 
          setting_value: nextVer.toString(),
          updated_at: new Date().toISOString()
        })
        
      if (error) throw error
      setAppVersion(nextVer.toString())
    } catch (err) {
      console.error('Gagal menaikkan versi:', err)
    }
  }

  // --- Fungsi Tambah Prefix ---
  const handleAddPrefix = async (e) => {
    e.preventDefault()
    if (!newPrefix.trim() || !selectedCourier) return
    
    setIsSubmitting(true)
    setError('')
    
    try {
      const prefixClean = newPrefix.trim().toUpperCase()
      
      // Upsert: Jika sudah ada dan nonaktif, akan jadi aktif lagi
      const { error: upsertError } = await supabase
        .from('courier_prefix_rules')
        .upsert({
          courier_id: selectedCourier.id,
          prefix: prefixClean,
          min_length: parseInt(newMin, 10) || 5,
          max_length: parseInt(newMax, 10) || 30,
          is_active: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'prefix' }) // asumsi index/unique pada prefix
        
      if (upsertError) throw upsertError

      await incrementVersion()
      
      setNewPrefix('')
      setNewMin('10')
      setNewMax('25')
      
      await loadData()
    } catch (err) {
      console.error(err)
      alert(err.message || 'Gagal menambahkan prefix. Pastikan prefix belum digunakan.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // --- Fungsi Hapus (Nonaktifkan) Prefix ---
  const handleDeletePrefix = async (prefixId) => {
    if (!window.confirm('Yakin ingin menghapus prefix ini?')) return
    
    setIsSubmitting(true)
    try {
      // Kita melakukan soft-delete dengan mengubah is_active = false
      const { error: updateError } = await supabase
        .from('courier_prefix_rules')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', prefixId)
        
      if (updateError) throw updateError

      await incrementVersion()
      await loadData()
    } catch (err) {
      console.error(err)
      alert(err.message || 'Gagal menghapus prefix.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="small-label">Pengaturan</p>
          <h1>Master Ekspedisi</h1>
        </div>
        <div className="header-actions">
          <button className="secondary-button" type="button" onClick={onBack}>
            Kembali
          </button>
        </div>
      </header>

      <section className="dashboard-content">
        {error && <div className="error-message" style={{ marginBottom: '20px' }}>{error}</div>}

        <div className="courier-master-layout">
          <div className="app-version-card">
            <div>
              <p>Versi Sinkronisasi (courier_version)</p>
              <small style={{ color: '#747d90' }}>Aplikasi Android akan mendownload rules terbaru jika angka ini naik.</small>
            </div>
            <strong>{appVersion}</strong>
          </div>

          <div className="courier-table-card">
            <div className="courier-master-header">
              <h2>Daftar Ekspedisi</h2>
              <button className="secondary-button" onClick={loadData} disabled={loading}>
                {loading ? 'Memuat...' : 'Refresh'}
              </button>
            </div>
            
            <div className="courier-table-wrapper">
              <table className="courier-table">
                <thead>
                  <tr>
                    <th>Ekspedisi</th>
                    <th>Tipe Validasi</th>
                    <th>Prefix Aktif</th>
                    <th style={{ textAlign: 'right' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '30px' }}>Memuat data...</td>
                    </tr>
                  ) : couriers.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '30px' }}>Belum ada data.</td>
                    </tr>
                  ) : (
                    couriers.map(courier => (
                      <tr key={courier.id}>
                        <td>
                          <strong>{courier.courier_name}</strong>
                          <br />
                          <small style={{ color: '#747d90' }}>Code: {courier.courier_code}</small>
                        </td>
                        <td>
                          <span className={courier.validation_type === 'PREFIX' ? 'badge-type badge-type-prefix' : 'badge-type badge-type-scan'}>
                            {courier.validation_type}
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'normal', maxWidth: '300px' }}>
                          {courier.validation_type === 'SCAN_PACK' ? (
                            <span style={{ color: '#70798c', fontSize: '13px' }}>Mengikuti data Scan Pack</span>
                          ) : courier.rules.length > 0 ? (
                            courier.rules.map(rule => (
                              <span key={rule.id} className="badge-prefix">{rule.prefix}</span>
                            ))
                          ) : (
                            <span style={{ color: '#a51f1f', fontSize: '13px' }}>Kosong</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {courier.validation_type === 'PREFIX' && (
                            <button 
                              className="secondary-button" 
                              onClick={() => setSelectedCourier(courier)}
                              style={{ padding: '6px 12px', minHeight: 'auto', fontSize: '13px' }}
                            >
                              Atur Prefix
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* MODAL ATUR PREFIX */}
      {selectedCourier && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Prefix {selectedCourier.courier_name}</h2>
              <button className="close-button" onClick={() => setSelectedCourier(null)}>&times;</button>
            </div>
            
            <div className="modal-body">
              <form className="add-prefix-form" onSubmit={handleAddPrefix}>
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Prefix Baru</label>
                  <input 
                    type="text" 
                    value={newPrefix} 
                    onChange={e => setNewPrefix(e.target.value.toUpperCase())}
                    placeholder="Contoh: SPXNEW"
                    disabled={isSubmitting}
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>Min Char</label>
                  <input 
                    type="number" 
                    value={newMin} 
                    onChange={e => setNewMin(e.target.value)} 
                    disabled={isSubmitting}
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>Max Char</label>
                  <input 
                    type="number" 
                    value={newMax} 
                    onChange={e => setNewMax(e.target.value)} 
                    disabled={isSubmitting}
                    required 
                  />
                </div>
                <button 
                  type="submit" 
                  className="primary-button" 
                  style={{ minHeight: 'auto', padding: '10px 16px' }}
                  disabled={isSubmitting || !newPrefix.trim()}
                >
                  Tambah
                </button>
              </form>

              <div className="prefix-list">
                <p className="small-label" style={{ margin: 0 }}>Prefix Aktif Saat Ini</p>
                {selectedCourier.rules.length === 0 ? (
                  <div style={{ color: '#747d90', fontSize: '14px', fontStyle: 'italic' }}>
                    Belum ada prefix untuk {selectedCourier.courier_name}.
                  </div>
                ) : (
                  selectedCourier.rules.map(rule => (
                    <div className="prefix-item" key={rule.id}>
                      <div className="prefix-item-info">
                        <strong>{rule.prefix}</strong>
                        <small>{rule.min_length} - {rule.max_length} karakter</small>
                      </div>
                      <button 
                        className="btn-danger" 
                        onClick={() => handleDeletePrefix(rule.id)}
                        disabled={isSubmitting}
                      >
                        Hapus
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
