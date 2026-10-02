'use server'

import { cookies } from 'next/headers'
import { createServerSupabaseClient, isServerSupabaseConfigured } from '@/lib/supabase/server'
import { getRoleByPin, ROLE_PINS, type RolePinConfig } from '@/lib/auth/pins'
import { setPinSessionCookie, clearPinSessionCookie } from '@/lib/auth/sessionCookie'
import { redirect } from 'next/navigation'

export { ROLE_PINS, getRoleByPin, type RolePinConfig }

export interface PinAuthResult {
  success: boolean
  role?: 'nurse' | 'dispatch' | 'hospital'
  destination?: string
  roleTitle?: string
  error?: string
}

export async function loginWithPinAction(pin: string): Promise<PinAuthResult> {
  const cleanPin = pin.trim()
  const mapping = getRoleByPin(cleanPin)

  if (!mapping) {
    return {
      success: false,
      error: 'Invalid PIN. Use 2468 (Nurse), 9110 (Dispatch), or 1357 (Hospital Staff).',
    }
  }

  const cookieStore = await cookies()

  // 1. Authoritatively set the HTTP-only PIN session cookie
  setPinSessionCookie(cookieStore, mapping)

  // 2. Synchronize Supabase GoTrue auth session if configured
  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: mapping.email,
        password: 'DemoPassword123!',
      })

      if (signInError) {
        // Attempt sign-up in GoTrue if account was only seeded in Postgres auth.users
        const { error: signUpError } = await supabase.auth.signUp({
          email: mapping.email,
          password: 'DemoPassword123!',
        })
        if (!signUpError) {
          await supabase.auth.signInWithPassword({
            email: mapping.email,
            password: 'DemoPassword123!',
          })
        }
      }
    } catch (e) {
      console.warn('Optional Supabase GoTrue sync skipped:', e)
    }
  }

  return {
    success: true,
    role: mapping.role,
    destination: mapping.destination,
    roleTitle: mapping.roleTitle,
  }
}

export async function logoutAction() {
  const cookieStore = await cookies()
  clearPinSessionCookie(cookieStore)

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient()
      await supabase.auth.signOut()
    } catch {}
  }

  redirect('/login')
}
