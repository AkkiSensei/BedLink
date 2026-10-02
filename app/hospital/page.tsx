import React from 'react'
import { cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getHospitalReservations } from '@/lib/operations/hospital'
import { DEMO_IDENTITIES } from '@/lib/auth/demoIdentities'
import { getPinSessionFromCookies } from '@/lib/auth/sessionCookie'
import HospitalDashboardClient from './HospitalDashboardClient'
import type { HospitalReservationView } from '@/lib/operations/types'
import { Lock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function HospitalPage({
  searchParams,
}: {
  searchParams?: Promise<{ demo?: string; hospitalId?: string }>
}) {
  const params = await searchParams
  const supabase = await createServerSupabaseClient()
  const cookieStore = await cookies()
  const pinSession = getPinSessionFromCookies(cookieStore)

  // 1. Resolve active user session
  let user: { id: string } | null = null
  try {
    const { data: userData } = await supabase.auth.getUser()
    user = userData?.user ?? null
  } catch {
    user = null
  }

  if (!user && pinSession) {
    user = { id: pinSession.userId }
  }

  // 2. Resolve profile from database or PIN session
  let profile: { role: string; hospital_id: string | null; full_name?: string } | null = null
  if (user) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role, hospital_id, full_name')
      .eq('user_id', user.id)
      .maybeSingle()
    profile = profileData ?? null
  }

  if (!profile && pinSession && (!user || pinSession.userId === user.id)) {
    profile = {
      role: pinSession.role,
      hospital_id: pinSession.hospitalId,
      full_name: pinSession.fullName,
    }
  }

  // Demo fallback mode strictly gated behind explicit ALLOW_DEMO_BYPASS environment flag
  const allowDemoBypass =
    process.env.ALLOW_DEMO_BYPASS === 'true' ||
    process.env.NEXT_PUBLIC_ALLOW_DEMO_BYPASS === 'true'

  if (!profile && allowDemoBypass && params?.demo) {
    if (params?.demo === 'stjude') {
      profile = {
        role: DEMO_IDENTITIES.HOSPITAL_STJUDE.role,
        hospital_id: DEMO_IDENTITIES.HOSPITAL_STJUDE.hospitalId,
        full_name: DEMO_IDENTITIES.HOSPITAL_STJUDE.fullName,
      }
    } else if (params?.demo === 'admin') {
      profile = {
        role: DEMO_IDENTITIES.ADMIN.role,
        hospital_id: params?.hospitalId || DEMO_IDENTITIES.HOSPITAL_APEX.hospitalId,
        full_name: DEMO_IDENTITIES.ADMIN.fullName,
      }
    } else {
      // Default demo: Hospital Apex
      profile = {
        role: DEMO_IDENTITIES.HOSPITAL_APEX.role,
        hospital_id: DEMO_IDENTITIES.HOSPITAL_APEX.hospitalId,
        full_name: DEMO_IDENTITIES.HOSPITAL_APEX.fullName,
      }
    }
  }

  // 3. Authorization check: hospital or admin required
  if (!profile || (profile.role !== 'hospital' && profile.role !== 'admin')) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#F4F6F4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: '480px',
            width: '100%',
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E1E7E1',
            padding: '2.5rem 2rem',
            textAlign: 'center',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <Lock size={40} style={{ color: '#5C6B64' }} />
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2421', margin: '0 0 0.5rem 0' }}>
            Hospital Access Restricted
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#5C6B64', lineHeight: 1.5, margin: 0 }}>
            The Emergency Hospital Response Console is accessible only to authenticated users with the{' '}
            <strong>Hospital Staff</strong> role. Please sign in with authorized credentials.
          </p>
          <div style={{ marginTop: '1.75rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            <a
              href="/login?role=hospital"
              style={{
                display: 'inline-block',
                padding: '11px 18px',
                backgroundColor: '#2D6A4F',
                color: '#FFFFFF',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.875rem',
                textDecoration: 'none',
              }}
            >
              Sign In as Hospital Staff
            </a>
            <a
              href="/login"
              style={{
                display: 'inline-block',
                padding: '9px 18px',
                backgroundColor: '#EEF3EE',
                color: '#1A2421',
                borderRadius: '8px',
                fontWeight: 500,
                fontSize: '0.825rem',
                textDecoration: 'none',
                border: '1px solid #E1E7E1',
              }}
            >
              Switch Role or Return to Login
            </a>
          </div>
        </div>
      </div>
    )
  }

  // 4. Resolve hospital details
  let hospitalName = 'Authorized Emergency Facility'
  let hospitalCity = 'Emergency Operations Desk'
  const targetHospitalId = profile.hospital_id || params?.hospitalId || null

  if (targetHospitalId) {
    const { data: hospData } = await supabase
      .from('hospitals')
      .select('name, city')
      .eq('id', targetHospitalId)
      .maybeSingle()
    if (hospData) {
      hospitalName = hospData.name
      hospitalCity = hospData.city
    }
  }

  // 5. Fetch initial active reservations directly without fake mock fallback
  let initialReservations: HospitalReservationView[] = []
  try {
    initialReservations = await getHospitalReservations(supabase, {
      targetHospitalId: targetHospitalId || undefined,
    })
  } catch {
    initialReservations = []
  }

  return (
    <HospitalDashboardClient
      initialReservations={initialReservations}
      initialServerTime={new Date().toISOString()}
      hospitalId={targetHospitalId || ''}
      hospitalName={hospitalName}
      hospitalCity={hospitalCity}
      staffName={profile.full_name || 'Hospital Staff'}
      staffRole={profile.role}
    />
  )
}
