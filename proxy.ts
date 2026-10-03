import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import type { UserRole } from '@/lib/types/database'
import { getPinSessionFromCookies } from '@/lib/auth/sessionCookie'

const ROLE_ROUTE_PREFIXES: Record<string, UserRole[]> = {
  '/nurse': ['nurse', 'admin'],
  '/dispatch': ['dispatch', 'admin'],
  '/hospital': ['hospital', 'admin'],
}

const PUBLIC_EXACT_ROUTES = ['/login']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Allow public assets and static paths without authentication
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/api/auth') ||
    PUBLIC_EXACT_ROUTES.includes(pathname)
  ) {
    return NextResponse.next()
  }

  // 2. Refresh session and resolve user via Supabase
  const { response, user, supabase } = await updateSession(request)

  // Also resolve PIN session cookie
  const pinSession = await getPinSessionFromCookies(request.cookies)

  let effectiveUserId = user?.id ?? pinSession?.userId ?? null
  let effectiveRole: UserRole | null = null

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    effectiveRole = (profile?.role as UserRole) || (pinSession?.userId === user.id ? pinSession.role : null)
  } else if (pinSession) {
    effectiveRole = pinSession.role
  }

  // 3. If accessing root "/", redirect to /login or role home
  if (pathname === '/') {
    if (!effectiveUserId || !effectiveRole) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    if (effectiveRole === 'nurse') return NextResponse.redirect(new URL('/nurse', request.url))
    if (effectiveRole === 'dispatch') return NextResponse.redirect(new URL('/dispatch', request.url))
    if (effectiveRole === 'hospital') return NextResponse.redirect(new URL('/hospital', request.url))
    if (effectiveRole === 'admin') return NextResponse.redirect(new URL('/nurse', request.url))
    return NextResponse.redirect(new URL('/login?error=missing_profile', request.url))
  }

  // 4. Find matching protected route rule
  const matchedPrefix = Object.keys(ROLE_ROUTE_PREFIXES).find(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )

  // If not a protected prefix, continue with refreshed session
  if (!matchedPrefix) {
    return response
  }

  // 5. Enforce authentication on protected prefix
  if (!effectiveUserId || !effectiveRole) {
    // Only allow demo parameter through if explicit evaluation mode is enabled via environment
    const allowDemo =
      process.env.ALLOW_DEMO_BYPASS === 'true' ||
      process.env.NEXT_PUBLIC_ALLOW_DEMO_BYPASS === 'true'
    const demoParam = request.nextUrl.searchParams.get('demo')
    if (allowDemo && demoParam) {
      return response
    }

    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required' },
        { status: 401 }
      )
    }
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // 6. Enforce role-based access control
  const allowedRoles = ROLE_ROUTE_PREFIXES[matchedPrefix]

  if (!allowedRoles.includes(effectiveRole)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient role permissions' },
        { status: 403 }
      )
    }
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('forbidden', '1')
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
