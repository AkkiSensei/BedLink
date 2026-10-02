import React from 'react'
import { cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getNurseBeds } from '@/lib/operations/nurse'
import { DEMO_IDENTITIES } from '@/lib/auth/demoIdentities'
import { getPinSessionFromCookies } from '@/lib/auth/sessionCookie'
import NurseInventoryClient from './NurseInventoryClient'
import type { NurseBedView } from '@/lib/operations/types'
import { Lock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function NursePage({
  searchParams,
}: {
  searchParams?: Promise<{ demo?: string }>
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
    const demoTarget = params?.demo === 'stjude' ? DEMO_IDENTITIES.NURSE_STJUDE : DEMO_IDENTITIES.NURSE_APEX
    profile = {
      role: demoTarget.role,
      hospital_id: demoTarget.hospitalId,
      full_name: demoTarget.fullName,
    }
  }

  // 3. Authorization check
  if (!profile || (profile.role !== 'nurse' && profile.role !== 'admin')) {
    return (
      <div
        style={{
          maxWidth: '480px',
          margin: '3rem auto',
          padding: '2rem',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          textAlign: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <Lock size={40} className="text-slate-500" />
        </div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
          Access Restricted
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '0.5rem', lineHeight: 1.5 }}>
          The Nurse Bed Inventory is accessible only to authenticated staff with the <strong>nurse</strong> or <strong>admin</strong> role. Please sign in with your hospital staff credentials.
        </p>
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <a
            href="/login?role=nurse"
            style={{
              display: 'inline-block',
              padding: '10px 16px',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.85rem',
              textDecoration: 'none',
            }}
          >
            Sign In with Nurse PIN
          </a>
          <a
            href="/login"
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              backgroundColor: '#f1f5f9',
              color: '#334155',
              borderRadius: '8px',
              fontWeight: 500,
              fontSize: '0.8rem',
              textDecoration: 'none',
              border: '1px solid #e2e8f0',
            }}
          >
            Switch Role or Return to Login
          </a>
        </div>
      </div>
    )
  }

  // 4. Resolve hospital details
  let hospitalName = 'Authorized Facility'
  let hospitalCity = 'Emergency Operations'
  let hospitalUpdatedAt: string | null = null
  if (profile.hospital_id) {
    const { data: hospData } = await supabase
      .from('hospitals')
      .select('name, city, updated_at')
      .eq('id', profile.hospital_id)
      .maybeSingle()
    if (hospData) {
      hospitalName = hospData.name
      hospitalCity = hospData.city
      hospitalUpdatedAt = hospData.updated_at
    }
  }

  // 5. Fetch initial bed inventory directly from database without fake mock fallback
  let initialBeds: NurseBedView[] = []
  try {
    initialBeds = await getNurseBeds(supabase)
  } catch {
    initialBeds = []
  }

  return (
    <NurseInventoryClient
      initialBeds={initialBeds}
      hospitalId={profile.hospital_id || ''}
      hospitalName={hospitalName}
      hospitalCity={hospitalCity}
      nurseName={profile.full_name || 'Staff Nurse'}
      nurseRole={profile.role}
      initialConfirmedAt={hospitalUpdatedAt}
    />
  )
}
