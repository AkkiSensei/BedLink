import React from 'react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getHospitalReservations } from '@/lib/operations/hospital'
import { DEMO_IDENTITIES } from '@/lib/auth/demoIdentities'
import HospitalDashboardClient from './HospitalDashboardClient'
import type { HospitalReservationView } from '@/lib/operations/types'

export const dynamic = 'force-dynamic'

export default async function HospitalPage({
  searchParams,
}: {
  searchParams?: Promise<{ demo?: string; hospitalId?: string }>
}) {
  const params = await searchParams
  const supabase = await createServerSupabaseClient()

  // 1. Resolve active user session
  let user: { id: string } | null = null
  try {
    const { data: userData } = await supabase.auth.getUser()
    user = userData?.user ?? null
  } catch {
    user = null
  }

  // 2. Resolve profile from database
  let profile: { role: string; hospital_id: string | null; full_name?: string } | null = null
  if (user) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role, hospital_id, full_name')
      .eq('user_id', user.id)
      .maybeSingle()
    profile = profileData ?? null
  }

  // Demo fallback mode for local development/preview without live session cookies
  if (!profile && process.env.NODE_ENV !== 'production') {
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
      // Default dev demo: Hospital Apex
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
          maxWidth: '520px',
          margin: '3rem auto',
          padding: '2rem',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          textAlign: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔒</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
          Access Restricted
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '0.5rem', lineHeight: 1.5 }}>
          The Hospital Response Console is accessible only to authenticated operational staff with the <strong>hospital</strong> or <strong>admin</strong> role.
        </p>
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <a
            href="/login?unauthorized=1"
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
            Return to Login
          </a>
          <a
            href="/hospital?demo=apex"
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              backgroundColor: '#f1f5f9',
              color: '#334155',
              borderRadius: '8px',
              fontWeight: 500,
              fontSize: '0.8rem',
              textDecoration: 'none',
            }}
          >
            Demo Preview: Hospital Staff (Apex Hospital)
          </a>
          <a
            href="/hospital?demo=stjude"
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              backgroundColor: '#f1f5f9',
              color: '#334155',
              borderRadius: '8px',
              fontWeight: 500,
              fontSize: '0.8rem',
              textDecoration: 'none',
            }}
          >
            Demo Preview: Hospital Staff (St. Jude Healthcare)
          </a>
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

  // 5. Fetch initial active reservations (held offers)
  let initialReservations: HospitalReservationView[] = []
  try {
    initialReservations = await getHospitalReservations(supabase, {
      targetHospitalId: targetHospitalId || undefined,
    })
  } catch {
    initialReservations = []
  }

  // Fallback demo reservations for local evaluator preview in development mode
  if (initialReservations.length === 0 && process.env.NODE_ENV !== 'production') {
    initialReservations = [
      {
        id: 'r1000000-0000-4000-8000-000000000001',
        bed_request_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        hospital_id: targetHospitalId || DEMO_IDENTITIES.HOSPITAL_APEX.hospitalId!,
        bed_id: 'b1000000-0000-4000-8000-000000000003',
        status: 'held',
        attempt_number: 1,
        hold_expires_at: new Date(Date.now() + 104 * 1000).toISOString(),
        created_at: new Date(Date.now() - 16 * 1000).toISOString(),
        required_capabilities: ['icu', 'ventilator'],
        ambulance_latitude: 18.9280,
        ambulance_longitude: 72.8310,
        ambulance_phone: '+91-98200-11223',
        hospital_name: hospitalName,
        room_number: 'ICU-201',
        bed_capabilities: ['icu', 'ventilator'],
        estimated_travel_time_minutes: 6,
      },
    ]
  }

  return (
    <HospitalDashboardClient
      initialReservations={initialReservations}
      hospitalId={targetHospitalId || ''}
      hospitalName={hospitalName}
      hospitalCity={hospitalCity}
      staffName={profile.full_name || 'Hospital Operations'}
      staffRole={profile.role}
    />
  )
}
