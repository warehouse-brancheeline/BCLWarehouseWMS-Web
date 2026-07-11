import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL?.trim()

const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const supabaseConfigError =
  !supabaseUrl || !supabasePublishableKey
    ? 'Konfigurasi Supabase belum lengkap. Periksa file .env.local.'
    : ''

export const supabase = supabaseConfigError
  ? null
  : createClient(
      supabaseUrl,
      supabasePublishableKey,
    )
