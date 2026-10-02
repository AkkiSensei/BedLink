import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import type { UserRole } from '@/lib/types/database'

const ROLE_ROUTE_PREFIXES: Record<string, UserRole[]> = {
  '/nurse': ['nurse', 'admin'],
  '/dispatch': ['dispatch', 'admin'],
  '/hospital': ['hospital', 'admin'],
}

const PUBLIC_EXACT_ROUTES = ['/login']

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

  // 3. If accessing root "/", redirect to /login or role home
  if (pathname === '/') {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    // Authenticated user hitting root: resolve role and redirect
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    const role = profile?.role as UserRole | null
    if (role === 'nurse') return NextResponse.redirect(new URL('/nurse', request.url))
    if (role === 'dispatch') return NextResponse.redirect(new URL('/dispatch', request.url))
    if (role === 'hospital') return NextResponse.redirect(new URL('/hospital', request.url))
    if (role === 'admin') return NextResponse.redirect(new URL('/nurse', request.url))
    return NextResponse.redirect(new URL('/login', request.url))
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
  if (!user) {
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

  // 6. Enforce role-based access control by resolving profile from database
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
