import { ReservationError } from './errors'
import { executeRpc } from './transitions'
import { executeReservationFallback } from './fallback'
import type {
  ExpireReservationParams,
  ExpireReservationResult,
  ExpiryJobResult,
} from './types'

function parseEvaluationTime(evaluationTime: Date | string | number): string {
  if (evaluationTime === undefined || evaluationTime === null) {
    throw new ReservationError(
      'evaluationTime is required for deterministic reservation operations'
    )
  }
  const date =
    evaluationTime instanceof Date
      ? evaluationTime
      : new Date(evaluationTime)
  if (isNaN(date.getTime())) {
    throw new ReservationError(
      `evaluationTime must be a valid Date, ISO string, or timestamp. Received: ${evaluationTime}`
    )
  }
  return date.toISOString()
}

/**
 * Atomically expires a single HELD reservation whose hold_expires_at has passed,
 * releases the physical bed, marks hospital as attempted, and triggers dynamic fallback.
 *
 * Invariant: ACCEPTED reservations are NEVER expired.
 */
export async function expireReservation(
  client: any,
  params: ExpireReservationParams
): Promise<ExpireReservationResult> {
  const { reservationId, evaluationTime, autoFallback = true } = params
  const evalIso = parseEvaluationTime(evaluationTime)

  const result = await executeRpc<ExpireReservationResult>(
    client,
    'expire_reservation_atomic',
    {
      p_reservation_id: reservationId,
      p_now: evalIso,
    },
    [reservationId, evalIso]
  )

  if (autoFallback && result.success && !result.idempotent) {
    const fallbackRes = await executeReservationFallback(client, {
      bedRequestId: result.bed_request_id,
      evaluationTime,
    })
    return {
      ...result,
      fallbackReservation: fallbackRes.reservation ?? null,
      noCandidatesRemaining: !fallbackRes.hasCandidate,
    }
  }

  return result
}

/**
 * Server-side authoritative expiry processor.
 * Queries due HELD reservations (hold_expires_at <= evaluationTime)
 * and processes each transactionally.
 */
export async function processExpiredReservations(
  client: any,
  evaluationTime: Date | string | number,
  autoFallback: boolean = true
): Promise<ExpiryJobResult> {
  const evalIso = parseEvaluationTime(evaluationTime)

  let dueReservations: { reservation_id: string }[] = []

  if (typeof client.query === 'function') {
    const res = await client.query(
      `SELECT * FROM public.get_due_expired_reservations($1);`,
      [evalIso]
    )
    dueReservations = res.rows
  } else if (typeof client.rpc === 'function') {
    const { data, error } = await client.rpc('get_due_expired_reservations', {
      p_now: evalIso,
    })
    if (error) {
      throw new ReservationError(`Failed to fetch due expired reservations: ${error.message}`)
    }
    dueReservations = data ?? []
  }

  const processed: ExpireReservationResult[] = []
  const errors: { reservationId: string; error: string }[] = []

  for (const item of dueReservations) {
    try {
      const res = await expireReservation(client, {
        reservationId: item.reservation_id,
        evaluationTime,
        autoFallback,
      })
      processed.push(res)
    } catch (err: any) {
      errors.push({
        reservationId: item.reservation_id,
        error: err.message || String(err),
      })
    }
  }

  return {
    checked_at: evalIso,
    processed_count: processed.length,
    expired_reservations: processed,
    errors,
  }
}
