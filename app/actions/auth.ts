'use server'

import { cookies } from 'next/headers'
import { createServerSupabaseClient, isServerSupabaseConfigured } from '@/lib/supabase/server'
import { getRoleByPin } from '@/lib/auth/pins'
import { setPinSessionCookie, clearPinSessionCookie } from '@/lib/auth/sessionCookie'
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
    const mapping = getRoleByPin(cleanPin)

    if (!mapping) {
      return {
        success: false,
        error: 'Invalid PIN. Use 2468 (Nurse), 9110 (Dispatch), or 1001–1010 for Hospitals.',
      }
    }

    // 1. Authoritatively set the HTTP-only PIN session cookie
    try {
      const cookieStore = await cookies()
      setPinSessionCookie(cookieStore, mapping)
    } catch (cookieErr) {
      console.warn('Could not set PIN session cookie:', cookieErr)
    }

    // 2. Synchronize Supabase GoTrue auth session if configured
    if (isServerSupabaseConfigured()) {
      try {
        const supabase = await createServerSupabaseClient()
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: mapping.email,
          password: 'DemoPassword123!',
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
            password: 'DemoPassword123!',
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
              password: 'DemoPassword123!',
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
  } catch (err: any) {
    console.error('Unhandled loginWithPinAction error:', err)
    return {
      success: false,
      error: err?.message || 'Authentication error. Please try again.',
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
        await supabase.auth.signOut()
      } catch {}
    }
  } catch {}

  redirect('/login')
}
