import React from 'react'
import { cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { listDispatchBedRequests } from '@/lib/operations/dispatch'
import { DEMO_IDENTITIES } from '@/lib/auth/demoIdentities'
import { getPinSessionFromCookies } from '@/lib/auth/sessionCookie'
import DispatchDashboardClient from './DispatchDashboardClient'
import type { DispatchBedRequestView } from '@/lib/operations/types'
import { Lock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DispatchPage({
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
    let demoTarget: (typeof DEMO_IDENTITIES)[keyof typeof DEMO_IDENTITIES] = DEMO_IDENTITIES.DISPATCH_1
    if (params?.demo === 'dispatch2') {
      demoTarget = DEMO_IDENTITIES.DISPATCH_2
    } else if (params?.demo === 'admin') {
      demoTarget = DEMO_IDENTITIES.ADMIN
    }
    profile = {
      role: demoTarget.role,
      hospital_id: demoTarget.hospitalId,
      full_name: demoTarget.fullName,
    }
  }

  // 3. Authorization check: strictly dispatch or admin
  if (!profile || (profile.role !== 'dispatch' && profile.role !== 'admin')) {
    return (
      <div
        style={{
          maxWidth: '520px',
          margin: '3rem auto',
          padding: '2.5rem',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          textAlign: 'center',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }} aria-hidden="true">
          <Lock size={44} className="text-slate-500" />
        </div>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
          Dispatch Access Restricted
        </h1>
        <p style={{ fontSize: '0.925rem', color: '#64748b', lineHeight: 1.5, margin: 0 }}>
          The Emergency Dispatch Console is restricted to authenticated users with the{' '}
          <strong>Dispatch Operator</strong> or <strong>Admin</strong> role. Please sign in with verified dispatch credentials.
        </p>
        <div style={{ marginTop: '1.75rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          <a
            href="/login?role=dispatch"
            style={{
              display: 'inline-block',
              padding: '11px 18px',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            Sign In with Dispatch PIN
          </a>
          <a
            href="/login"
            style={{
              display: 'inline-block',
              padding: '9px 18px',
              backgroundColor: '#f1f5f9',
              color: '#334155',
              borderRadius: '8px',
              fontWeight: 500,
              fontSize: '0.825rem',
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

  // 4. Fetch initial dispatch requests
  let initialRequests: DispatchBedRequestView[] = []
  try {
    initialRequests = await listDispatchBedRequests(supabase)
  } catch {
    initialRequests = []
  }

  const currentUserId =
    user?.id ||
    (params?.demo === 'dispatch2'
      ? DEMO_IDENTITIES.DISPATCH_2.userId
      : DEMO_IDENTITIES.DISPATCH_1.userId)

  return (
    <DispatchDashboardClient
      initialRequests={initialRequests}
      userId={currentUserId}
      dispatcherName={profile.full_name || 'EMS Dispatcher'}
      dispatcherRole={profile.role}
    />
  )
}
