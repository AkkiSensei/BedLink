import { requireRole } from '@/lib/auth/server'
import { ReservationService } from '@/lib/reservations/service'
import type { AcceptReservationResult, RejectReservationResult } from '@/lib/reservations/types'
import {
  ForbiddenOperationError,
  NotFoundOperationError,
  toOperationError,
} from './errors'
import type {
  AcceptHospitalReservationInput,
  HospitalReservationView,
  RejectHospitalReservationInput,
} from './types'
import { validateEvaluationTime, validateUUID } from './validation'

/**
 * Retrieves active emergency reservation offers currently held for the authenticated hospital.
 * Enforces strict hospital boundary: Hospital users can only query reservations for their own hospital.
 */
export async function getHospitalReservations(
  client?: any,
  options?: { targetHospitalId?: string }
): Promise<HospitalReservationView[]> {
  try {
    const authContext = await requireRole(['hospital', 'admin'], client)
    const { profile } = authContext

    let hospitalId: string
    if (profile.role === 'hospital') {
      if (!profile.hospital_id) {
        throw new ForbiddenOperationError('Hospital profile missing hospital affiliation')
      }
      hospitalId = profile.hospital_id
    } else {
      // Admin
      hospitalId = options?.targetHospitalId || profile.hospital_id || ''
    }

    let rows: any[] = []

    if (typeof client?.query === 'function') {
      let queryStr = `
        SELECT r.id, r.bed_request_id, r.hospital_id, r.bed_id, r.status,
               r.attempt_number, r.hold_expires_at, r.created_at,
               br.required_capabilities, br.ambulance_latitude,
               br.ambulance_longitude, br.ambulance_phone
        FROM public.reservations r
        JOIN public.bed_requests br ON br.id = r.bed_request_id
        WHERE r.status = 'held'
      `
      const params: any[] = []
      if (hospitalId) {
        queryStr += ` AND r.hospital_id = $1`
        params.push(hospitalId)
      }
      queryStr += ` ORDER BY r.created_at DESC;`

      const res = await client.query(queryStr, params)
      rows = res.rows
    } else if (typeof client?.from === 'function') {
      let query = client
        .from('reservations')
        .select(
          `id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at, created_at,
           bed_requests:bed_request_id (
             required_capabilities, ambulance_latitude, ambulance_longitude, ambulance_phone
           )`
        )
        .eq('status', 'held')
        .order('created_at', { ascending: false })

      if (hospitalId) {
        query = query.eq('hospital_id', hospitalId)
      }

      const { data, error } = await query
      if (error) throw error
      rows = (data || []).map((r: any) => ({
        id: r.id,
        bed_request_id: r.bed_request_id,
        hospital_id: r.hospital_id,
        bed_id: r.bed_id,
        status: r.status,
        attempt_number: r.attempt_number,
        hold_expires_at: r.hold_expires_at,
        created_at: r.created_at,
        required_capabilities: r.bed_requests?.required_capabilities,
        ambulance_latitude: r.bed_requests?.ambulance_latitude,
        ambulance_longitude: r.bed_requests?.ambulance_longitude,
        ambulance_phone: r.bed_requests?.ambulance_phone,
      }))
    }

    return rows.map((r) => ({
      id: r.id,
      bed_request_id: r.bed_request_id,
      hospital_id: r.hospital_id,
      bed_id: r.bed_id,
      status: r.status,
      attempt_number: r.attempt_number,
      hold_expires_at: r.hold_expires_at,
      created_at: r.created_at,
      required_capabilities: r.required_capabilities,
      ambulance_latitude: Number(r.ambulance_latitude),
      ambulance_longitude: Number(r.ambulance_longitude),
      ambulance_phone: r.ambulance_phone,
    }))
  } catch (err) {
    throw toOperationError(err)
  }
}

/**
 * Accepts an active emergency reservation offer on behalf of the hospital.
 * Enforces hospital ownership, active reservation check, and authoritative expiry timing.
 */
export async function acceptHospitalReservation(
  input: AcceptHospitalReservationInput,
  client?: any
): Promise<AcceptReservationResult> {
  try {
    const authContext = await requireRole(['hospital', 'admin'], client)
    const { profile } = authContext

    // 1. Validate inputs
    const reservationId = validateUUID(input.reservationId, 'reservationId')
    const evaluationTime = validateEvaluationTime(
      input.evaluationTime,
      'evaluationTime'
    )

    // 2. Fetch reservation to verify organizational ownership boundary
    let reservation: any = null
    if (typeof client?.query === 'function') {
      const res = await client.query(
        `SELECT * FROM public.reservations WHERE id = $1;`,
        [reservationId]
      )
      reservation = res.rows[0] ?? null
    } else if (typeof client?.from === 'function') {
      const { data, error } = await client
        .from('reservations')
        .select('*')
        .eq('id', reservationId)
        .maybeSingle()
      if (error) throw error
      reservation = data
    }

    if (!reservation) {
      throw new NotFoundOperationError(`Reservation not found: ${reservationId}`)
    }

    // 3. Enforce organizational hospital boundary
    if (profile.role === 'hospital') {
      if (reservation.hospital_id !== profile.hospital_id) {
        throw new ForbiddenOperationError(
          `Forbidden: Hospital users cannot accept reservations offered to another hospital (${reservation.hospital_id})`
        )
      }
    }

    // 4. Delegate to Phase 5 domain service (atomic acceptance state machine)
    const reservationService = new ReservationService(client)
    return await reservationService.accept({
      reservationId,
      evaluationTime,
    })
  } catch (err) {
    throw toOperationError(err)
  }
}

/**
 * Rejects an active emergency reservation offer on behalf of the hospital
 * and atomically triggers dynamic fallback re-ranking for the BedRequest.
 * Enforces hospital ownership, active reservation check, and authoritative timing.
 */
export async function rejectHospitalReservation(
  input: RejectHospitalReservationInput,
  client?: any
): Promise<RejectReservationResult> {
  try {
    const authContext = await requireRole(['hospital', 'admin'], client)
    const { profile } = authContext

    // 1. Validate inputs
    const reservationId = validateUUID(input.reservationId, 'reservationId')
    const evaluationTime = validateEvaluationTime(
      input.evaluationTime,
      'evaluationTime'
    )

    // 2. Fetch reservation to verify organizational ownership boundary
    let reservation: any = null
    if (typeof client?.query === 'function') {
      const res = await client.query(
        `SELECT * FROM public.reservations WHERE id = $1;`,
        [reservationId]
      )
      reservation = res.rows[0] ?? null
    } else if (typeof client?.from === 'function') {
      const { data, error } = await client
        .from('reservations')
        .select('*')
        .eq('id', reservationId)
        .maybeSingle()
      if (error) throw error
      reservation = data
    }

    if (!reservation) {
      throw new NotFoundOperationError(`Reservation not found: ${reservationId}`)
    }

    // 3. Enforce organizational hospital boundary
    if (profile.role === 'hospital') {
      if (reservation.hospital_id !== profile.hospital_id) {
        throw new ForbiddenOperationError(
          `Forbidden: Hospital users cannot reject reservations offered to another hospital (${reservation.hospital_id})`
        )
      }
    }

    // 4. Delegate to Phase 5 domain service (atomic rejection & dynamic fallback state machine)
    const reservationService = new ReservationService(client)
    return await reservationService.reject({
      reservationId,
      evaluationTime,
      autoFallback: true,
    })
  } catch (err) {
    throw toOperationError(err)
  }
}
