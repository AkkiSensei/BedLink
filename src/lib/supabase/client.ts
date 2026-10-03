import { createBrowserClient } from '@supabase/ssr'

export function isSupabaseConfigured(): boolean {
  const url =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_URL)
  const key =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  if (!url || !key) return false
  if (url.includes('placeholder') || key.includes('placeholder')) return false
  return true
}

let browserClientInstance: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (typeof window !== 'undefined' && browserClientInstance) {
    return browserClientInstance
  }

  // Support both Next.js (NEXT_PUBLIC_) and Vite (VITE_) env var naming conventions.
  // In Next.js the NEXT_PUBLIC_ prefix is required for browser-accessible vars.
  // In Vite only VITE_ prefixed vars are exposed at build time.
  const rawUrl =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_URL) ||
    ''

  const rawKey =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    ''

  const isProduction = typeof process !== 'undefined' && process.env.NODE_ENV === 'production'
  const isConfigured = Boolean(rawUrl && rawKey && !rawUrl.includes('placeholder') && !rawKey.includes('placeholder'))

  if (isProduction && !isConfigured) {
    throw new Error(
      '[BedLink Configuration Error] Missing authoritative Supabase credentials in production. ' +
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set to real values.'
    )
  }

  const supabaseUrl = rawUrl || 'https://placeholder.supabase.co'
  const supabaseKey = rawKey || 'placeholder-anon-key'

  const client = createBrowserClient(supabaseUrl, supabaseKey)
  if (typeof window !== 'undefined') {
    browserClientInstance = client
  }
  return client
}

