import type { RolePinConfig } from './pins'
import type { UserRole } from '@/lib/types/database'

export const BEDLINK_PIN_COOKIE = 'bedlink_pin_session'

export interface PinSessionData {
  userId: string
  role: UserRole
  hospitalId: string | null
  email: string
  fullName: string
  createdAt: number
}

/**
 * Encodes session data to cookie value
 */
export function encodePinSession(data: PinSessionData): string {
  return Buffer.from(JSON.stringify(data)).toString('base64')
}

/**
 * Decodes session data from cookie value
 */
export function decodePinSession(value?: string | null): PinSessionData | null {
  if (!value) return null
  try {
    const raw = Buffer.from(value, 'base64').toString('utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && parsed.userId && parsed.role) {
      return parsed as PinSessionData
    }
    return null
  } catch {
    return null
  }
}

/**
 * Sets the PIN session cookie using next/headers cookies()
 */
export function setPinSessionCookie(cookieStore: any, config: RolePinConfig) {
  const session: PinSessionData = {
    userId: config.userId,
    role: config.role,
    hospitalId: config.hospitalId,
    email: config.email,
    fullName: config.fullName,
    createdAt: Date.now(),
  }

  const encoded = encodePinSession(session)
  const isProduction = process.env.NODE_ENV === 'production'

  cookieStore.set(BEDLINK_PIN_COOKIE, encoded, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })
}

/**
 * Clears the PIN session cookie
 */
export function clearPinSessionCookie(cookieStore: any) {
  cookieStore.delete(BEDLINK_PIN_COOKIE)
}

/**
 * Extracts PIN session from NextRequest or cookies() store
 */
export function getPinSessionFromCookies(cookiesObj: any): PinSessionData | null {
  try {
    const cookie = typeof cookiesObj?.get === 'function' ? cookiesObj.get(BEDLINK_PIN_COOKIE) : null
    const val = cookie?.value || (typeof cookie === 'string' ? cookie : null)
    return decodePinSession(val)
  } catch {
    return null
  }
}
