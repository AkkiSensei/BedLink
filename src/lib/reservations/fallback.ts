import { rankHospitals } from '@/lib/ranking'
import type { Hospital, Bed, BedRequest } from '@/lib/types/database'
import {
  ReservationError,
  ReservationNotFoundError,
  ReservationConflictError,
} from './errors'
import { holdReservation } from './transitions'
import type { FallbackParams, FallbackResult } from './types'

/**
 * Loads current database state and executes dynamic fallback re-ranking.
 * Fallback is ALWAYS:
 * current state -> eligibility gate -> fresh ranking -> next reservation
 */
export async function executeReservationFallback(
  client: any,
  params: FallbackParams
): Promise<FallbackResult> {
  const { bedRequestId, evaluationTime } = params

  if (evaluationTime === undefined || evaluationTime === null) {
    throw new ReservationError(
      'evaluationTime is required for deterministic fallback re-ranking'
    )
  }

  const evalDate =
    evaluationTime instanceof Date
      ? evaluationTime
      : new Date(evaluationTime)

  if (isNaN(evalDate.getTime())) {
    throw new ReservationError(
      `evaluationTime must be a valid Date, ISO string, or timestamp. Received: ${evaluationTime}`
    )
  }

  // 1. Fetch current BedRequest state
  let bedRequest: BedRequest | null = null
  if (typeof client.query === 'function') {
    let res = await client
      .query(`SELECT * FROM public.get_bed_request_for_fallback($1);`, [bedRequestId])
      .catch(() => null)

    if (!res || !res.rows || res.rows.length === 0) {
      res = await client.query(
        `SELECT * FROM public.bed_requests WHERE id = $1;`,
        [bedRequestId]
      )
    }
    const raw = res.rows[0] ?? null
    if (raw) {
      bedRequest = {
        ...raw,
        ambulance_latitude: Number(raw.ambulance_latitude),
        ambulance_longitude: Number(raw.ambulance_longitude),
      }
    }
  } else if (typeof client.from === 'function') {
    const { data, error } = await client
      .from('bed_requests')
      .select('*')
      .eq('id', bedRequestId)
      .single()
    if (error) {
      throw new ReservationNotFoundError(bedRequestId)
    }
    bedRequest = {
      ...data,
      ambulance_latitude: Number(data.ambulance_latitude),
      ambulance_longitude: Number(data.ambulance_longitude),
    }
  }

  if (!bedRequest) {
    throw new ReservationNotFoundError(bedRequestId)
  }

  // 2. Fetch current hospitals and beds state
  let hospitals: Hospital[] = []
  let beds: Bed[] = []

  if (typeof client.query === 'function') {
    const hospRes = await client.query(`SELECT * FROM public.hospitals;`)
    hospitals = hospRes.rows.map((h: any) => ({
      ...h,
      latitude: Number(h.latitude),
      longitude: Number(h.longitude),
      current_load_percent: Number(h.current_load_percent),
    }))

    const bedsRes = await client.query(`SELECT * FROM public.beds;`)
    beds = bedsRes.rows
  } else if (typeof client.from === 'function') {
    const hospRes = await client.from('hospitals').select('*')
    if (hospRes.error) throw new ReservationError(hospRes.error.message)
    hospitals = hospRes.data.map((h: any) => ({
      ...h,
      latitude: Number(h.latitude),
      longitude: Number(h.longitude),
      current_load_percent: Number(h.current_load_percent),
    }))

    const bedsRes = await client.from('beds').select('*')
    if (bedsRes.error) throw new ReservationError(bedsRes.error.message)
    beds = bedsRes.data
  }

  // 3. Run ranking engine with authoritative evaluationTime
  const rankingResult = rankHospitals(
    bedRequest,
    hospitals,
    beds,
    evalDate
  )

  if (rankingResult.candidates.length === 0) {
    // Terminal fallback state: no candidate hospitals remain
    if (typeof client.query === 'function') {
      await client.query(
        `UPDATE public.bed_requests 
         SET status = 'fallback', current_active_reservation_id = NULL, updated_at = $1 
         WHERE id = $2;`,
        [evalDate.toISOString(), bedRequestId]
      )
    } else if (typeof client.from === 'function') {
      await client
        .from('bed_requests')
        .update({
          status: 'fallback',
          current_active_reservation_id: null,
          updated_at: evalDate.toISOString(),
        })
        .eq('id', bedRequestId)
    }

    return {
      hasCandidate: false,
      bedRequestId,
      reason: 'No eligible hospitals remaining matching required capabilities',
    }
  }

  // 4. Determine next attempt_number
  let nextAttemptNumber = 1
  if (typeof client.query === 'function') {
    const maxRes = await client.query(
      `SELECT COALESCE(MAX(attempt_number), 0) + 1 as next_attempt 
       FROM public.reservations 
       WHERE bed_request_id = $1;`,
      [bedRequestId]
    )
    nextAttemptNumber = Number(maxRes.rows[0]?.next_attempt ?? 1)
  } else if (typeof client.from === 'function') {
    const { data } = await client
      .from('reservations')
      .select('attempt_number')
      .eq('bed_request_id', bedRequestId)
      .order('attempt_number', { ascending: false })
      .limit(1)
    nextAttemptNumber = (data?.[0]?.attempt_number ?? 0) + 1
  }

  // 5. Attempt hold on candidates in ranked priority (handling concurrent bed contention cleanly)
  for (const candidate of rankingResult.candidates) {
    if (!candidate.matched_bed_id) {
      continue
    }

    try {
      const holdResult = await holdReservation(client, {
        bedRequestId,
        hospitalId: candidate.hospital_id,
        bedId: candidate.matched_bed_id,
        attemptNumber: nextAttemptNumber,
        evaluationTime: evalDate,
      })

      return {
        hasCandidate: true,
        reservation: holdResult,
        bedRequestId,
      }
    } catch (err: any) {
      // If a concurrent transaction claimed this bed, continue to next candidate
      if (err instanceof ReservationConflictError || err.message?.includes('already')) {
        continue
      }
      throw err
    }
  }

  // If all candidate holds failed due to concurrency contention:
  return {
    hasCandidate: false,
    bedRequestId,
    reason: 'All candidate beds were claimed by concurrent reservations',
  }
}
