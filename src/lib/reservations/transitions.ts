import { RESERVATION_CONFIG } from './config'
import {
  ReservationError,
  ReservationNotFoundError,
  ReservationStateError,
  ReservationConflictError,
  ReservationExpiredError,
  StaleReservationError,
} from './errors'
import type {
  HoldReservationParams,
  HoldReservationResult,
  AcceptReservationParams,
  AcceptReservationResult,
  RejectReservationParams,
  RejectReservationResult,
} from './types'

/**
 * Normalizes database execution between a SupabaseClient (rpc) and direct SQL executor (query).
 */
export async function executeRpc<T = any>(
  client: any,
  fnName: string,
  argsObj: Record<string, any>,
  argsPositional: any[]
): Promise<T> {
  if (client && typeof client.rpc === 'function') {
    const { data, error } = await client.rpc(fnName, argsObj)
    if (error) {
      throw mapDatabaseError(error.message || error.details || String(error))
    }
    return data as T
  }

  if (client && typeof client.query === 'function') {
    try {
      const placeholders = argsPositional.map((_, i) => `$${i + 1}`).join(', ')
      const queryStr = `SELECT public.${fnName}(${placeholders}) as result;`
      const res = await client.query(queryStr, argsPositional)
      return res.rows[0].result as T
    } catch (err: any) {
      throw mapDatabaseError(err.message || String(err))
    }
  }

  throw new ReservationError(
    `Unsupported database client passed to executeRpc. Client must provide .rpc or .query method.`
  )
}

/**
 * Maps raw PostgreSQL exceptions into strongly-typed domain errors.
 */
export function mapDatabaseError(msg: string): Error {
  if (msg.includes('not found')) {
    return new ReservationNotFoundError(msg)
  }
  if (msg.includes('expired')) {
    return new ReservationExpiredError(msg)
  }
  if (msg.includes('Stale reservation')) {
    return new StaleReservationError(msg)
  }
  if (
    msg.includes('already held') ||
    msg.includes('already has an active held') ||
    msg.includes('duplicate key value') ||
    msg.includes('idx_reservations_one_held_per_bed') ||
    msg.includes('idx_reservations_one_held_per_request') ||
    msg.includes('not available')
  ) {
    return new ReservationConflictError(msg)
  }
  if (
    msg.includes('Cannot accept reservation') ||
    msg.includes('Cannot reject reservation') ||
    msg.includes('Cannot expire reservation') ||
    msg.includes('in terminal status')
  ) {
    return new ReservationStateError(msg)
  }
  return new ReservationError(msg)
}

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
 * Atomically creates a HELD reservation and locks the corresponding physical bed.
 */
export async function holdReservation(
  client: any,
  params: HoldReservationParams
): Promise<HoldReservationResult> {
  const {
    bedRequestId,
    hospitalId,
    bedId,
    attemptNumber,
    holdDurationSeconds = RESERVATION_CONFIG.HOLD_DURATION_SECONDS,
    evaluationTime,
  } = params

  const evalIso = parseEvaluationTime(evaluationTime)

  const result = await executeRpc<HoldReservationResult>(
    client,
    'create_reservation_hold_atomic',
    {
      p_bed_request_id: bedRequestId,
      p_hospital_id: hospitalId,
      p_bed_id: bedId,
      p_attempt_number: attemptNumber,
      p_hold_duration_seconds: holdDurationSeconds,
      p_now: evalIso,
    },
    [bedRequestId, hospitalId, bedId, attemptNumber, holdDurationSeconds, evalIso]
  )

  return result
}

/**
 * Atomically marks a HELD reservation as ACCEPTED.
 * Invariant: physical bed remains HELD (ACCEPTED != OCCUPIED).
 */
export async function acceptReservation(
  client: any,
  params: AcceptReservationParams
): Promise<AcceptReservationResult> {
  const { reservationId, evaluationTime } = params
  const evalIso = parseEvaluationTime(evaluationTime)

  const result = await executeRpc<AcceptReservationResult>(
    client,
    'accept_reservation_atomic',
    {
      p_reservation_id: reservationId,
      p_now: evalIso,
    },
    [reservationId, evalIso]
  )

  return result
}

/**
 * Atomically marks a HELD reservation as REJECTED, releases the physical bed,
 * and appends the hospital to attempted_hospitals on the BedRequest.
 */
export async function rejectReservation(
  client: any,
  params: RejectReservationParams
): Promise<RejectReservationResult> {
  const { reservationId, evaluationTime, autoFallback = false } = params
  const evalIso = parseEvaluationTime(evaluationTime)

  const result = await executeRpc<RejectReservationResult>(
    client,
    'reject_reservation_atomic',
    {
      p_reservation_id: reservationId,
      p_now: evalIso,
    },
    [reservationId, evalIso]
  )

  if (autoFallback && result.success && !result.idempotent) {
    const { executeReservationFallback } = await import('./fallback')
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
