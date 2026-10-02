import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import type { UserRole } from '@/lib/types/database'

const ROLE_ROUTE_PREFIXES: Record<string, UserRole[]> = {
  '/nurse': ['nurse', 'admin'],
  '/dispatch': ['dispatch', 'admin'],
  '/hospital': ['hospital', 'admin'],
  '/admin': ['admin'],
}

const PUBLIC_EXACT_ROUTES = ['/', '/login', '/signup']

export async function middleware(request: NextRequest) {
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

  // 3. Find matching protected route rule
  const matchedPrefix = Object.keys(ROLE_ROUTE_PREFIXES).find(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )

  // If not a protected prefix and not static, continue with refreshed session
  if (!matchedPrefix) {
    return response
  }

  // 4. Enforce authentication on protected prefix
  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required' },
        { status: 401 }
      )
    }
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    redirectUrl.searchParams.set('unauthorized', '1')
    return NextResponse.redirect(redirectUrl)
  }

  // 5. Enforce role-based access control by resolving profile from database
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  const userRole = (profile?.role as UserRole) || null
  const allowedRoles = ROLE_ROUTE_PREFIXES[matchedPrefix]

  if (!userRole || !allowedRoles.includes(userRole)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient role permissions' },
        { status: 403 }
      )
    }
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
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
