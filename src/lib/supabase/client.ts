import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Support both Next.js (NEXT_PUBLIC_) and Vite (VITE_) env var naming conventions.
  // In Next.js the NEXT_PUBLIC_ prefix is required for browser-accessible vars.
  // In Vite only VITE_ prefixed vars are exposed at build time.
  const supabaseUrl =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_URL) ||
    'https://placeholder.supabase.co'

  const supabaseKey =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    'placeholder-anon-key'

  return createBrowserClient(supabaseUrl, supabaseKey)
}

