'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { DEMO_IDENTITIES } from '@/lib/auth/demoIdentities'
import { redirect } from 'next/navigation'

export interface PinAuthResult {
  success: boolean
  role?: 'nurse' | 'dispatch' | 'hospital'
  destination?: string
  roleTitle?: string
  error?: string
}

export const ROLE_PINS: Record<
  string,
  {
    role: 'nurse' | 'dispatch' | 'hospital'
    email: string
    destination: string
    roleTitle: string
  }
> = {
  // Nurse PINs (2468 is primary)
  '2468': {
    role: 'nurse',
    email: DEMO_IDENTITIES.NURSE_APEX.email,
    destination: '/nurse',
    roleTitle: 'Staff Nurse (Apex Metro)',
  },
  '1234': {
    role: 'nurse',
    email: DEMO_IDENTITIES.NURSE_APEX.email,
    destination: '/nurse',
    roleTitle: 'Staff Nurse (Apex Metro)',
  },

  // Dispatch Operator PINs (9110 is primary)
  '9110': {
    role: 'dispatch',
    email: DEMO_IDENTITIES.DISPATCH_1.email,
    destination: '/dispatch',
    roleTitle: 'Metro EMS Dispatch Operator',
  },
  '9999': {
    role: 'dispatch',
    email: DEMO_IDENTITIES.DISPATCH_1.email,
    destination: '/dispatch',
    roleTitle: 'Metro EMS Dispatch Operator',
  },
  '1111': {
    role: 'dispatch',
    email: DEMO_IDENTITIES.DISPATCH_1.email,
    destination: '/dispatch',
    roleTitle: 'Metro EMS Dispatch Operator',
  },

  // Hospital Staff PINs (1357 is primary)
  '1357': {
    role: 'hospital',
    email: DEMO_IDENTITIES.HOSPITAL_APEX.email,
    destination: '/hospital',
    roleTitle: 'Hospital Operations Desk (Apex)',
  },
  '8642': {
    role: 'hospital',
    email: DEMO_IDENTITIES.HOSPITAL_APEX.email,
    destination: '/hospital',
    roleTitle: 'Hospital Operations Desk (Apex)',
  },
  '5678': {
    role: 'hospital',
    email: DEMO_IDENTITIES.HOSPITAL_APEX.email,
    destination: '/hospital',
    roleTitle: 'Hospital Operations Desk (Apex)',
  },
}

export async function loginWithPinAction(pin: string): Promise<PinAuthResult> {
  const cleanPin = pin.trim()
  const mapping = ROLE_PINS[cleanPin]

  if (!mapping) {
    return {
      success: false,
      error: 'Invalid PIN. Try 2468 (Nurse), 9110 (Dispatch Operator), or 1357 (Hospital Staff).',
    }
  }

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: mapping.email,
    password: 'DemoPassword123!',
  })

  if (error || !data.user) {
    return {
      success: false,
      error: error?.message || 'Failed to authenticate PIN. Please try again.',
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
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()
  redirect('/login')
}
