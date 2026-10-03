'use server'

import { cookies } from 'next/headers'
import { createServerSupabaseClient, isServerSupabaseConfigured } from '@/lib/supabase/server'
import { getRoleByPin } from '@/lib/auth/pins'
import { setPinSessionCookie, clearPinSessionCookie } from '@/lib/auth/sessionCookie'
import {
  checkPersistentPinRateLimit,
  clearPersistentPinRateLimit,
  getPinRateLimitKey,
} from '@/lib/auth/rateLimit'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export interface PinAuthResult {
  success: boolean
  role?: 'nurse' | 'dispatch' | 'hospital' | 'admin'
  destination?: string
  roleTitle?: string
  error?: string
}

export async function loginWithPinAction(pin: string): Promise<PinAuthResult> {
  try {
    const cleanPin = pin.trim()
    if (!/^\d{4}$/.test(cleanPin)) {
      return { success: false, error: 'PIN must contain exactly four digits.' }
    }
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEMO_AUTH !== 'true') {
      return {
        success: false,
        error: 'PIN authentication is disabled in production. Use the configured identity provider.',
      }
    }
    const requestHeaders = await headers()
    const rateLimitKey = getPinRateLimitKey(
      requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip'),
      requestHeaders.get('user-agent')
    )
    const rateLimitClient = isServerSupabaseConfigured()
      ? await createServerSupabaseClient()
      : null
    const rateLimit = await checkPersistentPinRateLimit(rateLimitClient, rateLimitKey)
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `Too many attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`,
      }
    }
    const mapping = getRoleByPin(cleanPin)

    if (!mapping) {
      return {
        success: false,
        error: 'Invalid PIN. Use 2001–2010 or 2468 (Nurse), 9110 (Dispatch), or 1001–1010 for Hospitals.',
      }
    }

    // 1. Authoritatively set the HTTP-only PIN session cookie
    try {
      const cookieStore = await cookies()
      await setPinSessionCookie(cookieStore, mapping)
    } catch (cookieErr) {
      console.error('Could not establish PIN session cookie:', cookieErr)
      return {
        success: false,
        error: 'Unable to establish a secure session. Please try again.',
      }
    }

    await clearPersistentPinRateLimit(rateLimitClient, rateLimitKey)

    // Optional GoTrue synchronization for environments that provision demo users.
    const demoPassword = process.env.DEMO_AUTH_PASSWORD
    if (isServerSupabaseConfigured() && demoPassword) {
      try {
        const supabase = await createServerSupabaseClient()
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: mapping.email,
          password: demoPassword,
        })

        if (signInError) {
          console.warn(
            `[BedLink Auth] signInWithPassword failed for ${mapping.email}:`,
            signInError.message,
            '— attempting signUp to create GoTrue account...'
          )

          // GoTrue doesn't have this user yet — create them
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: mapping.email,
            password: demoPassword,
            options: {
              data: { full_name: mapping.fullName },
              emailRedirectTo: undefined,
            },
          })

          if (signUpError) {
            console.warn(
              `[BedLink Auth] signUp also failed for ${mapping.email}:`,
              signUpError.message,
              '— PIN session cookie will be used as fallback auth.'
            )
          } else if (signUpData.user) {
            console.log(
              `[BedLink Auth] Created GoTrue user for ${mapping.email}, attempting re-login...`
            )
            const { error: retryError } = await supabase.auth.signInWithPassword({
              email: mapping.email,
              password: demoPassword,
            })
            if (retryError) {
              console.warn(
                `[BedLink Auth] Re-login after signup failed:`,
                retryError.message,
                '— PIN cookie is authoritative fallback.'
              )
            } else {
              console.log(`[BedLink Auth] Session established for ${mapping.email} after signup.`)
            }
          }
        } else if (signInData?.session) {
          console.log(`[BedLink Auth] Supabase session established for ${mapping.email}`)
        }
      } catch (e) {
        console.warn('[BedLink Auth] Optional Supabase GoTrue sync skipped:', e)
      }
    }

    return {
      success: true,
      role: mapping.role,
      destination: mapping.destination,
      roleTitle: mapping.roleTitle,
    }
  } catch (err: unknown) {
    console.error('Unhandled loginWithPinAction error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Authentication error. Please try again.',
    }
  }
}

export async function logoutAction() {
  try {
    const cookieStore = await cookies()
    clearPinSessionCookie(cookieStore)

    if (isServerSupabaseConfigured()) {
      try {
        const supabase = await createServerSupabaseClient()
        // Fast signout: do not let remote network call hold up the user redirect
        await Promise.race([
          supabase.auth.signOut(),
          new Promise((resolve) => setTimeout(resolve, 200)),
        ])
      } catch (error) {
        console.warn('[BedLink Auth] Supabase sign-out failed:', error)
      }
    }
  } catch (error) {
    console.warn('[BedLink Auth] PIN session cleanup failed:', error)
  }

  redirect('/login')
}
