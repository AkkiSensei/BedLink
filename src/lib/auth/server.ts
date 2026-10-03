import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Profile, UserRole } from '@/lib/types/database'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { UnauthorizedError, ForbiddenError } from './errors'

export interface AuthContext {
  user: User
  profile: Profile
}

/**
 * Resolves the authenticated Supabase user from the session.
 * Does not throw; returns null if unauthenticated.
 */
export async function getCurrentUser(
  client?: SupabaseClient
): Promise<User | null> {
  let user: User | null = null
  try {
    const supabase = client ?? (await createServerSupabaseClient())
    const {
      data: { user: supabaseUser },
      error,
    } = await supabase.auth.getUser()

    if (!error && supabaseUser) {
      user = supabaseUser
    }
  } catch (error) {
    console.warn('[BedLink Auth] Supabase user lookup failed:', error)
  }

  if (user) {
    return user
  }

  // Fallback to PIN session cookie
  try {
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    const { getPinSessionFromCookies } = await import('./sessionCookie')
    const pinSession = await getPinSessionFromCookies(cookieStore)
    if (pinSession) {
      return {
        id: pinSession.userId,
        email: pinSession.email,
        phone: '',
        confirmed_at: new Date(pinSession.createdAt).toISOString(),
        email_confirmed_at: new Date(pinSession.createdAt).toISOString(),
        phone_confirmed_at: undefined,
        last_sign_in_at: new Date(pinSession.createdAt).toISOString(),
        role: 'authenticated',
        updated_at: new Date(pinSession.createdAt).toISOString(),
        is_anonymous: false,
        app_metadata: {},
        user_metadata: { full_name: pinSession.fullName },
        aud: 'authenticated',
        created_at: new Date(pinSession.createdAt).toISOString(),
      }
    }
  } catch (error) {
    console.warn('[BedLink Auth] PIN session fallback lookup failed:', error)
  }

  return null
}

/**
 * Resolves the authoritative application profile from public.profiles table.
 * Does NOT assume JWT claims contain the role.
 */
export async function getCurrentProfile(
  client?: SupabaseClient,
  userId?: string
): Promise<Profile | null> {
  let targetUserId = userId
  if (!targetUserId) {
    const user = await getCurrentUser(client)
    if (!user) return null
    targetUserId = user.id
  }

  const supabase = client ?? (await createServerSupabaseClient())

  if (typeof (supabase as any)?.query === 'function') {
    const res = await (supabase as any).query(
      `SELECT user_id, role, hospital_id, full_name, created_at, updated_at
       FROM public.profiles
       WHERE user_id = $1;`,
      [targetUserId]
    )
    if (res.rows[0]) {
      return res.rows[0] as Profile
    }
  } else if (typeof (supabase as any)?.from === 'function') {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, role, hospital_id, full_name, created_at, updated_at')
      .eq('user_id', targetUserId)
      .maybeSingle()

    if (!error && data) {
      return data as Profile
    }
  }

  // Fallback to PIN session cookie if profile row in DB is not reachable
  try {
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    const { getPinSessionFromCookies } = await import('./sessionCookie')
    const pinSession = await getPinSessionFromCookies(cookieStore)
    if (pinSession && (!targetUserId || pinSession.userId === targetUserId)) {
      return {
        user_id: pinSession.userId,
        role: pinSession.role,
        hospital_id: pinSession.hospitalId,
        full_name: pinSession.fullName,
        created_at: new Date(pinSession.createdAt).toISOString(),
        updated_at: new Date(pinSession.createdAt).toISOString(),
      } as Profile
    }
  } catch (error) {
    console.warn('[BedLink Auth] Profile PIN fallback lookup failed:', error)
  }

  return null
}

/**
 * Asserts that a user is authenticated.
 * Throws UnauthorizedError (401) if not.
 */
export async function requireUser(
  client?: SupabaseClient
): Promise<User> {
  const user = await getCurrentUser(client)
  if (!user) {
    throw new UnauthorizedError('Authentication required')
  }
  return user
}

/**
 * Asserts that a user is authenticated and has a valid profile record.
 * Throws UnauthorizedError (401) if unauthenticated.
 * Throws ForbiddenError (403) if profile record is missing.
 */
export async function requireProfile(
  client?: SupabaseClient
): Promise<AuthContext> {
  const supabase = client ?? (await createServerSupabaseClient())
  const user = await requireUser(supabase)

  const profile = await getCurrentProfile(supabase, user.id)
  if (!profile) {
    throw new ForbiddenError('Profile identity not found')
  }

  return { user, profile }
}

/**
 * Asserts that the authenticated user's profile role matches one of the allowed roles.
 * Throws UnauthorizedError (401) if unauthenticated.
 * Throws ForbiddenError (403) if role is unauthorized.
 */
export async function requireRole(
  allowedRoles: UserRole | UserRole[],
  client?: SupabaseClient
): Promise<AuthContext> {
  const context = await requireProfile(client)
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]

  if (!allowed.includes(context.profile.role)) {
    throw new ForbiddenError(
      `Forbidden: role '${context.profile.role}' does not have required permissions (expected: ${allowed.join(', ')})`
    )
  }

  return context
}

/**
 * Asserts that the caller has authorization for operations on a specific hospital.
 * Admin role has global administrative access.
 * Nurse and Hospital roles MUST belong to the specified hospitalId.
 * Dispatch role is strictly denied hospital operational access.
 */
export async function requireHospitalAccess(
  hospitalId: string,
  client?: SupabaseClient
): Promise<AuthContext> {
  const context = await requireProfile(client)
  const { profile } = context

  // Admin has global system access
  if (profile.role === 'admin') {
    return context
  }

  // Dispatch is not affiliated with hospitals and cannot access hospital operational resources
  if (profile.role === 'dispatch') {
    throw new ForbiddenError('Forbidden: dispatch role cannot access hospital-specific operations')
  }

  // Nurse or Hospital staff must belong to this specific hospital
  if (profile.hospital_id !== hospitalId) {
    throw new ForbiddenError(
      `Forbidden: user belongs to hospital '${profile.hospital_id}', cannot access hospital '${hospitalId}'`
    )
  }

  return context
}

/**
 * Asserts that the caller has dispatch permissions.
 * Only dispatch users (or admin) are permitted.
 * Verifies that dispatch has no hospital affiliation (hospital_id === null).
 */
export async function requireDispatchAccess(
  client?: SupabaseClient
): Promise<AuthContext> {
  const context = await requireRole(['dispatch', 'admin'], client)
  if (context.profile.role === 'dispatch' && context.profile.hospital_id !== null) {
    throw new ForbiddenError('Invariant violation: dispatch role must not have a hospital affiliation')
  }
  return context
}

/**
 * Asserts that the caller has system administrator permissions.
 */
export async function requireAdmin(
  client?: SupabaseClient
): Promise<AuthContext> {
  return requireRole('admin', client)
}
