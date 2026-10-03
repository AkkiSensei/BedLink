const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

interface AttemptBucket {
  count: number
  resetAt: number
}

const attempts = new Map<string, AttemptBucket>()
type RateLimitClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: unknown }>
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

export function checkPinRateLimit(identifier: string, now = Date.now()): RateLimitResult {
  if (attempts.size > 10_000) {
    for (const [key, bucket] of attempts) {
      if (bucket.resetAt <= now) attempts.delete(key)
    }
  }
  const current = attempts.get(identifier)
  if (!current || current.resetAt <= now) {
    attempts.set(identifier, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  if (current.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
    }
  }

  current.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}

export function clearPinRateLimit(identifier: string): void {
  attempts.delete(identifier)
}

export function getPinRateLimitKey(ip: string | null, userAgent: string | null): string {
  const safeIp = (ip || 'unknown').slice(0, 64)
  const safeAgent = (userAgent || 'unknown').slice(0, 128)
  return `${safeIp}:${safeAgent}`
}

export async function checkPersistentPinRateLimit(
  client: RateLimitClient | null,
  identifier: string,
  now = Date.now()
): Promise<RateLimitResult> {
  if (client) {
    const { data, error } = await client.rpc('check_pin_rate_limit', {
      p_identifier: identifier,
      p_now: new Date(now).toISOString(),
    })
    if (!error && data && typeof data === 'object') {
      const result = data as { allowed?: boolean; retry_after_seconds?: number }
      if (typeof result.allowed === 'boolean') {
        return {
          allowed: result.allowed,
          retryAfterSeconds: Math.max(0, Number(result.retry_after_seconds) || 0),
        }
      }
    }
  }

  return checkPinRateLimit(identifier, now)
}

export async function clearPersistentPinRateLimit(
  client: RateLimitClient | null,
  identifier: string
): Promise<void> {
  if (client) {
    const { error } = await client.rpc('clear_pin_rate_limit', {
      p_identifier: identifier,
    })
    if (!error) return
  }
  clearPinRateLimit(identifier)
}
