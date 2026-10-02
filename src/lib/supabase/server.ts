import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function isServerSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return false
  if (url.includes('placeholder') || key.includes('placeholder')) return false
  return true
}

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const rawKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''

  const isProduction = process.env.NODE_ENV === 'production'
  const isConfigured = Boolean(rawUrl && rawKey && !rawUrl.includes('placeholder') && !rawKey.includes('placeholder'))

  if (isProduction && !isConfigured) {
    throw new Error(
      '[BedLink Configuration Error] Authoritative Supabase credentials missing on server in production. ' +
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.'
    )
  }

  const supabaseUrl = rawUrl || 'https://placeholder.supabase.co'
  const supabaseKey = rawKey || 'placeholder-anon-key'

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if middleware is refreshing user sessions.
        }
      },
    },
  })
}
