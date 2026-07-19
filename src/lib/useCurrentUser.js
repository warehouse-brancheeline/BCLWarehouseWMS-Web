// ============================================================
// BCL Warehouse WMS - useCurrentUser Hook
// Hook untuk mendapatkan nama user yang sedang login.
// Dipakai di ScanPackHistoryPage dan HandoverPage
// agar tidak duplikasi query ke Supabase.
// ============================================================

import { useCallback } from 'react'
import { supabase } from './supabase'

/**
 * Hook yang mengembalikan fungsi getCurrentUserName.
 * Fungsi ini akan coba ambil nama dari tabel profiles,
 * kalau gagal fallback ke data session.
 *
 * @param {object} session - Supabase session object
 * @returns {{ getCurrentUserName: () => Promise<string> }}
 */
export function useCurrentUser(session) {
  const getCurrentUserName = useCallback(async () => {
    const fallback =
      session?.user?.user_metadata?.full_name ||
      session?.user?.user_metadata?.name ||
      session?.user?.email ||
      'User Warehouse'

    if (!session?.user?.id || !supabase) {
      return fallback
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', session.user.id)
        .maybeSingle()

      if (error) {
        console.error('useCurrentUser: gagal membaca profile:', error)
        return fallback
      }

      return data?.full_name || data?.email || fallback
    } catch (err) {
      console.error('useCurrentUser: error tidak terduga:', err)
      return fallback
    }
  }, [session])

  return { getCurrentUserName }
}
