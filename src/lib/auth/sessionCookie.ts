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

const DEV_SESSION_SECRET = 'bedlink-development-session-secret'
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function getSessionSecret(): string {
  const secret = process.env.BEDLINK_PIN_SESSION_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('BEDLINK_PIN_SESSION_SECRET must be configured in production')
  }
  return DEV_SESSION_SECRET
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))))
}

export async function encodePinSession(data: PinSessionData): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(data)))
  return `${payload}.${await sign(payload)}`
}

export async function decodePinSession(value?: string | null): Promise<PinSessionData | null> {
  if (!value) return null
  try {
    const [payload, providedSignature] = value.split('.')
    if (!payload || !providedSignature) return null
    const expectedSignature = await sign(payload)
    const expected = fromBase64Url(expectedSignature)
    const provided = fromBase64Url(providedSignature)
    if (expected.length !== provided.length) return null
    let mismatch = 0
    for (let i = 0; i < expected.length; i += 1) mismatch |= expected[i] ^ provided[i]
    if (mismatch !== 0) return null
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Partial<PinSessionData>
    if (
      !parsed ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.fullName !== 'string' ||
      typeof parsed.createdAt !== 'number' ||
      !Number.isFinite(parsed.createdAt) ||
      Date.now() - parsed.createdAt > SESSION_MAX_AGE_MS ||
      Date.now() - parsed.createdAt < -60_000 ||
      !['nurse', 'dispatch', 'hospital', 'admin'].includes(parsed.role || '')
    ) {
      return null
    }
    return parsed as PinSessionData
  } catch {
    return null
  }
}

/**
 * Sets the PIN session cookie using next/headers cookies()
 */
export async function setPinSessionCookie(cookieStore: any, config: RolePinConfig) {
  const session: PinSessionData = {
    userId: config.userId,
    role: config.role,
    hospitalId: config.hospitalId,
    email: config.email,
    fullName: config.fullName,
    createdAt: Date.now(),
  }

  const encoded = await encodePinSession(session)
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
export async function getPinSessionFromCookies(cookiesObj: any): Promise<PinSessionData | null> {
  try {
    const cookie = typeof cookiesObj?.get === 'function' ? cookiesObj.get(BEDLINK_PIN_COOKIE) : null
    const val = cookie?.value || (typeof cookie === 'string' ? cookie : null)
    return await decodePinSession(val)
  } catch {
    return null
  }
}
