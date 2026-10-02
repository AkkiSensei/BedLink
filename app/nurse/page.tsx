import React from 'react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getNurseBeds } from '@/lib/operations/nurse'
import { DEMO_IDENTITIES } from '@/lib/auth/demoIdentities'
import NurseInventoryClient from './NurseInventoryClient'
import type { NurseBedView } from '@/lib/operations/types'

export const dynamic = 'force-dynamic'

export default async function NursePage({
  searchParams,
}: {
  searchParams?: Promise<{ demo?: string }>
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

  // Demo fallback mode for local development/preview or direct demo parameter
  if (!profile && (params?.demo || process.env.NODE_ENV !== 'production')) {
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
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔒</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
          Access Restricted
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '0.5rem' }}>
          The Nurse Bed Inventory is accessible only to authenticated staff with the <strong>nurse</strong> or <strong>admin</strong> role.
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
            href="/nurse?demo=apex"
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
            Demo Preview: Staff Nurse (Apex Hospital)
          </a>
        </div>
      </div>
    )
  }

  // 4. Resolve hospital details
  let hospitalName = 'Authorized Facility'
  let hospitalCity = 'Emergency Operations'
  if (profile.hospital_id) {
    const { data: hospData } = await supabase
      .from('hospitals')
      .select('name, city')
      .eq('id', profile.hospital_id)
      .maybeSingle()
    if (hospData) {
      hospitalName = hospData.name
      hospitalCity = hospData.city
    }
  }

  // 5. Fetch initial bed inventory
  let initialBeds: NurseBedView[] = []
  try {
    initialBeds = await getNurseBeds(supabase)
  } catch {
    initialBeds = []
  }

  // Fallback to deterministic seed beds for preview in dev mode if database is offline
  if (initialBeds.length === 0 && process.env.NODE_ENV !== 'production') {
    if (profile.hospital_id === DEMO_IDENTITIES.NURSE_STJUDE.hospitalId) {
      initialBeds = [
        { id: 'b2000000-0000-4000-8000-000000000001', hospital_id: DEMO_IDENTITIES.NURSE_STJUDE.hospitalId!, capabilities: ['general'], status: 'available', room_number: 'GEN-201', last_updated_at: new Date(Date.now() - 4 * 3600000).toISOString(), created_at: new Date().toISOString() },
        { id: 'b2000000-0000-4000-8000-000000000002', hospital_id: DEMO_IDENTITIES.NURSE_STJUDE.hospitalId!, capabilities: ['oxygen'], status: 'available', room_number: 'OXY-202', last_updated_at: new Date(Date.now() - 45 * 60000).toISOString(), created_at: new Date().toISOString() },
        { id: 'b2000000-0000-4000-8000-000000000003', hospital_id: DEMO_IDENTITIES.NURSE_STJUDE.hospitalId!, capabilities: ['icu', 'ventilator'], status: 'available', room_number: 'ICU-301', last_updated_at: new Date(Date.now() - 20 * 60000).toISOString(), created_at: new Date().toISOString() },
        { id: 'b2000000-0000-4000-8000-000000000004', hospital_id: DEMO_IDENTITIES.NURSE_STJUDE.hospitalId!, capabilities: ['icu', 'ventilator', 'oxygen'], status: 'maintenance', room_number: 'ICU-302', last_updated_at: new Date(Date.now() - 3 * 3600000).toISOString(), created_at: new Date().toISOString() },
        { id: 'b2000000-0000-4000-8000-000000000005', hospital_id: DEMO_IDENTITIES.NURSE_STJUDE.hospitalId!, capabilities: ['general'], status: 'occupied', room_number: 'GEN-203', last_updated_at: new Date(Date.now() - 6 * 3600000).toISOString(), created_at: new Date().toISOString() },
      ]
    } else {
      initialBeds = [
        { id: 'b1000000-0000-4000-8000-000000000001', hospital_id: '11111111-1111-4111-8111-111111111101', capabilities: ['general'], status: 'available', room_number: 'GEN-101', last_updated_at: new Date(Date.now() - 3600000).toISOString(), created_at: new Date().toISOString() },
        { id: 'b1000000-0000-4000-8000-000000000002', hospital_id: '11111111-1111-4111-8111-111111111101', capabilities: ['oxygen'], status: 'available', room_number: 'OXY-102', last_updated_at: new Date(Date.now() - 1800000).toISOString(), created_at: new Date().toISOString() },
        { id: 'b1000000-0000-4000-8000-000000000003', hospital_id: '11111111-1111-4111-8111-111111111101', capabilities: ['icu'], status: 'available', room_number: 'ICU-201', last_updated_at: new Date(Date.now() - 900000).toISOString(), created_at: new Date().toISOString() },
        { id: 'b1000000-0000-4000-8000-000000000004', hospital_id: '11111111-1111-4111-8111-111111111101', capabilities: ['ventilator'], status: 'held', room_number: 'VENT-202', last_updated_at: new Date(Date.now() - 300000).toISOString(), created_at: new Date().toISOString() },
        { id: 'b1000000-0000-4000-8000-000000000005', hospital_id: '11111111-1111-4111-8111-111111111101', capabilities: ['icu', 'ventilator'], status: 'occupied', room_number: 'ICU-VENT-301', last_updated_at: new Date(Date.now() - 7200000).toISOString(), created_at: new Date().toISOString() },
        { id: 'b1000000-0000-4000-8000-000000000006', hospital_id: '11111111-1111-4111-8111-111111111101', capabilities: ['icu', 'ventilator', 'oxygen'], status: 'available', room_number: 'TRAUMA-401', last_updated_at: new Date(Date.now() - 600000).toISOString(), created_at: new Date().toISOString() },
      ]
    }
  }

  return (
    <NurseInventoryClient
      initialBeds={initialBeds}
      hospitalId={profile.hospital_id || ''}
      hospitalName={hospitalName}
      hospitalCity={hospitalCity}
      nurseName={profile.full_name || 'Staff Nurse'}
      nurseRole={profile.role}
    />
  )
}
