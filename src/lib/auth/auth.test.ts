import { describe, expect, it, beforeEach } from 'vitest'
import {
  decodePinSession,
  encodePinSession,
} from './sessionCookie'
import {
  checkPinRateLimit,
  clearPinRateLimit,
  getPinRateLimitKey,
} from './rateLimit'

describe('PIN session security', () => {
  beforeEach(() => {
    process.env.BEDLINK_PIN_SESSION_SECRET = 'test-session-secret'
  })

  it('accepts an untampered signed session and rejects a modified token', async () => {
    const session = {
      userId: '00000000-0000-4000-8000-000000000001',
      role: 'nurse' as const,
      hospitalId: null,
      email: 'nurse@example.com',
      fullName: 'Test Nurse',
      createdAt: Date.now(),
    }
    const token = await encodePinSession(session)

    await expect(decodePinSession(token)).resolves.toMatchObject(session)
    await expect(decodePinSession(`${token}tampered`)).resolves.toBeNull()
  })

  it('rejects expired sessions', async () => {
    const token = await encodePinSession({
      userId: '00000000-0000-4000-8000-000000000001',
      role: 'nurse',
      hospitalId: null,
      email: 'nurse@example.com',
      fullName: 'Test Nurse',
      createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    })

    await expect(decodePinSession(token)).resolves.toBeNull()
  })
})

describe('PIN rate limiting', () => {
  it('limits repeated attempts and can be cleared after success', () => {
    const key = getPinRateLimitKey('127.0.0.1', 'test-agent')
    clearPinRateLimit(key)
    const now = Date.now()

    for (let i = 0; i < 5; i += 1) {
      expect(checkPinRateLimit(key, now).allowed).toBe(true)
    }
    expect(checkPinRateLimit(key, now).allowed).toBe(false)

    clearPinRateLimit(key)
    expect(checkPinRateLimit(key, now).allowed).toBe(true)
  })
})
