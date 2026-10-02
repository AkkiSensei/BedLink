import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/types/database'

export default async function RootPage() {
  const supabase = await createServerSupabaseClient()

  let user: { id: string } | null = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data?.user ?? null
  } catch {
    user = null
  }

  if (!user) {
    redirect('/login')
  }

  // Resolve role and redirect to appropriate dashboard
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  const role = profile?.role as UserRole | null
  if (role === 'nurse') redirect('/nurse')
  if (role === 'dispatch') redirect('/dispatch')
  if (role === 'hospital') redirect('/hospital')
  if (role === 'admin') redirect('/nurse')

  redirect('/login?error=missing_profile')
}
