import { requireRole } from '@/lib/auth/server'
import type { Bed, BedCapability, BedStatus } from '@/lib/types/database'
import {
  ForbiddenOperationError,
  NotFoundOperationError,
  ConflictOperationError,
  ValidationOperationError,
  toOperationError,
} from './errors'
import type {
  NurseBedView,
  UpdateNurseBedInput,
  AdmitEmsPatientInput,
  AdmitEmsPatientResult,
  DischargeEmsPatientInput,
  DischargeEmsPatientResult,
} from './types'
import {
  validateUUID,
  validateBedStatus,
  validateCapabilities,
  validateRoomNumber,
  validateEvaluationTime,
} from './validation'

/**
 * Retrieves the operational bed inventory for the authenticated nurse's hospital.
 * Admin users can optionally specify targetHospitalId, or view all beds.
 */
export async function getNurseBeds(
  client?: any,
  options?: { targetHospitalId?: string }
): Promise<NurseBedView[]> {
  try {
    if (!client) {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      client = await createServerSupabaseClient()
    }
    const authContext = await requireRole(['nurse', 'admin'], client)
    const { profile } = authContext

    let hospitalId: string
    if (profile.role === 'nurse') {
      hospitalId = options?.targetHospitalId || profile.hospital_id || ''
      if (!hospitalId) {
        throw new ForbiddenOperationError('Nurse profile missing hospital affiliation')
      }
    } else {
      // Admin role
      hospitalId = options?.targetHospitalId || profile.hospital_id || ''
    }

    let beds: Bed[] = []
    const reservationsMap = new Map<string, any>()

    if (typeof client?.query === 'function') {
      if (hospitalId) {
        const res = await client.query(
          `SELECT id, hospital_id, capabilities, status, room_number, last_updated_at, created_at
           FROM public.beds
           WHERE hospital_id = $1
           ORDER BY room_number ASC NULLS LAST, created_at ASC;`,
          [hospitalId]
        )
        beds = res.rows

        const resvRes = await client.query(
          `SELECT id, bed_request_id, bed_id, status, admitted_at, discharged_at, bed_ready_at
           FROM public.reservations
           WHERE hospital_id = $1 AND ((status IN ('held', 'accepted') AND discharged_at IS NULL) OR (admitted_at IS NOT NULL AND discharged_at IS NULL))
           ORDER BY created_at DESC;`,
          [hospitalId]
        )
        for (const row of resvRes.rows) {
          if (!reservationsMap.has(row.bed_id)) {
            reservationsMap.set(row.bed_id, row)
          }
        }
      } else {
        const res = await client.query(
          `SELECT id, hospital_id, capabilities, status, room_number, last_updated_at, created_at
           FROM public.beds
           ORDER BY hospital_id ASC, room_number ASC NULLS LAST, created_at ASC;`
        )
        beds = res.rows

        const resvRes = await client.query(
          `SELECT id, bed_request_id, bed_id, status, admitted_at, discharged_at, bed_ready_at
           FROM public.reservations
           WHERE (status IN ('held', 'accepted') AND discharged_at IS NULL) OR (admitted_at IS NOT NULL AND discharged_at IS NULL)
           ORDER BY created_at DESC;`
        )
        for (const row of resvRes.rows) {
          if (!reservationsMap.has(row.bed_id)) {
            reservationsMap.set(row.bed_id, row)
          }
        }
      }
    } else if (typeof client?.from === 'function') {
      let query = client
        .from('beds')
        .select('id, hospital_id, capabilities, status, room_number, last_updated_at, created_at')
        .order('room_number', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })

      if (hospitalId) {
        query = query.eq('hospital_id', hospitalId)
      }

      const { data, error } = await query
      if (error) {
        throw error
      }
      beds = data || []

      let resvQuery = client
        .from('reservations')
        .select('id, bed_request_id, bed_id, status, admitted_at, discharged_at, bed_ready_at')
        .is('discharged_at', null)
        .order('created_at', { ascending: false })

      if (hospitalId) {
        resvQuery = resvQuery.eq('hospital_id', hospitalId)
      }
      const { data: resvData } = await resvQuery
      if (resvData) {
        for (const row of resvData) {
          if (!reservationsMap.has(row.bed_id)) {
            reservationsMap.set(row.bed_id, row)
          }
        }
      }
    } else {
      // Default server client fallback
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      const supabase = await createServerSupabaseClient()
      let query = supabase
        .from('beds')
        .select('id, hospital_id, capabilities, status, room_number, last_updated_at, created_at')
        .order('room_number', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })

      if (hospitalId) {
        query = query.eq('hospital_id', hospitalId)
      }

      const { data, error } = await query
      if (error) throw error
      beds = data || []

      let resvQuery = supabase
        .from('reservations')
        .select('id, bed_request_id, bed_id, status, admitted_at, discharged_at, bed_ready_at')
        .is('discharged_at', null)
        .order('created_at', { ascending: false })

      if (hospitalId) {
        resvQuery = resvQuery.eq('hospital_id', hospitalId)
      }
      const { data: resvData } = await resvQuery
      if (resvData) {
        for (const row of resvData) {
          if (!reservationsMap.has(row.bed_id)) {
            reservationsMap.set(row.bed_id, row)
          }
        }
      }
    }

    return beds.map((b) => {
      const emsRes = reservationsMap.get(b.id)
      return {
        id: b.id,
        hospital_id: b.hospital_id,
        capabilities: b.capabilities,
        status: b.status,
        room_number: b.room_number,
        last_updated_at: b.last_updated_at,
        created_at: b.created_at,
        active_ems_reservation: emsRes
          ? {
              reservation_id: emsRes.id,
              bed_request_id: emsRes.bed_request_id,
              status: emsRes.status,
              admitted_at: emsRes.admitted_at ?? null,
              discharged_at: emsRes.discharged_at ?? null,
              bed_ready_at: emsRes.bed_ready_at ?? null,
            }
          : null,
      }
    })
  } catch (err) {
    throw toOperationError(err)
  }
}

/**
 * Updates operational bed details (status, capabilities, room number) for a nurse's hospital bed.
 * Prevents modifying beds actively held by emergency reservations.
 * Prevents manually setting status to 'held'.
 */
export async function updateNurseBed(
  input: UpdateNurseBedInput,
  client?: any
): Promise<NurseBedView> {
  try {
    if (!client) {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      client = await createServerSupabaseClient()
    }
    const authContext = await requireRole(['nurse', 'admin'], client)
    const { profile } = authContext

    // 1. Validate input
    const bedId = validateUUID(input.bedId, 'bedId')

    if (
      input.status === undefined &&
      input.capabilities === undefined &&
      input.room_number === undefined
    ) {
      throw new ValidationOperationError(
        'At least one field (status, capabilities, room_number) must be provided for update'
      )
    }

    let validatedStatus: BedStatus | undefined
    if (input.status !== undefined) {
      validatedStatus = validateBedStatus(input.status)
      if (validatedStatus === 'held') {
        throw new ValidationOperationError(
          'Bed status "held" is managed exclusively by the authoritative reservation engine'
        )
      }
    }

    let validatedCapabilities: BedCapability[] | undefined
    if (input.capabilities !== undefined) {
      validatedCapabilities = validateCapabilities(input.capabilities)
    }

    let validatedRoomNumber: string | null | undefined
    if (input.room_number !== undefined) {
      validatedRoomNumber = validateRoomNumber(input.room_number)
    }

    // 2. Fetch existing bed to verify existence and ownership
    let bed: Bed | null = null

    if (typeof client?.query === 'function') {
      const res = await client.query(`SELECT * FROM public.beds WHERE id = $1;`, [bedId])
      bed = res.rows[0] ?? null
    } else if (typeof client?.from === 'function') {
      const { data, error } = await client.from('beds').select('*').eq('id', bedId).maybeSingle()
      if (error) throw error
      bed = data
    } else {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      const supabase = await createServerSupabaseClient()
      const { data, error } = await supabase.from('beds').select('*').eq('id', bedId).maybeSingle()
      if (error) throw error
      bed = data
    }

    if (!bed) {
      throw new NotFoundOperationError(`Bed not found with ID: ${bedId}`)
    }

    // 3. Enforce organizational hospital boundary
    if (profile.role === 'nurse') {
      if (bed.hospital_id !== profile.hospital_id) {
        throw new ForbiddenOperationError(
          `Forbidden: Nurse cannot access or update beds belonging to hospital ${bed.hospital_id}`
        )
      }
    }

    // 4. Invariant check: Protect active emergency reservation holds
    // If bed is currently held or has an active held reservation, block ANY modification
    let activeReservationCount = 0

    if (typeof client?.query === 'function') {
      const res = await client.query(
        `SELECT COUNT(*)::int as count FROM public.reservations WHERE bed_id = $1 AND status = 'held';`,
        [bedId]
      )
      activeReservationCount = res.rows[0]?.count ?? 0
    } else if (typeof client?.from === 'function') {
      const { count, error } = await client
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('bed_id', bedId)
        .eq('status', 'held')
      if (error) throw error
      activeReservationCount = count ?? 0
    }

    if (bed.status === 'held' || activeReservationCount > 0) {
      throw new ConflictOperationError(
        'Cannot modify status, capabilities, or details of a physical bed while it is held by an active emergency reservation'
      )
    }

    // 5. Enforce authoritative state transitions
    if (validatedStatus !== undefined && validatedStatus !== bed.status) {
      const isAllowedTransition =
        (bed.status === 'available' &&
          (validatedStatus === 'occupied' || validatedStatus === 'maintenance')) ||
        (bed.status === 'occupied' && validatedStatus === 'available') ||
        (bed.status === 'maintenance' && validatedStatus === 'available')

      if (!isAllowedTransition) {
        throw new ValidationOperationError(
          `Cannot transition bed from "${bed.status.toUpperCase()}" to "${validatedStatus.toUpperCase()}". Allowed transitions are: AVAILABLE → OCCUPIED (Admit Patient), OCCUPIED → AVAILABLE (Discharge Patient), AVAILABLE → MAINTENANCE (Mark Maintenance), and MAINTENANCE → AVAILABLE (Return to Available).`
        )
      }
    }

    // 5. Apply server-side timestamp and perform update
    const nowIso = new Date().toISOString()
    let updatedBed: Bed

    const newStatus = validatedStatus !== undefined ? validatedStatus : bed.status
    const newCapabilities =
      validatedCapabilities !== undefined ? validatedCapabilities : bed.capabilities
    const newRoomNumber =
      validatedRoomNumber !== undefined ? validatedRoomNumber : bed.room_number

    if (typeof client?.query === 'function') {
      const res = await client.query(
        `UPDATE public.beds
         SET status = $1,
             capabilities = $2,
             room_number = $3,
             last_updated_at = $4
         WHERE id = $5
         RETURNING *;`,
        [newStatus, newCapabilities, newRoomNumber, nowIso, bedId]
      )
      updatedBed = res.rows[0]
    } else if (typeof client?.from === 'function') {
      const { data, error } = await client
        .from('beds')
        .update({
          status: newStatus,
          capabilities: newCapabilities,
          room_number: newRoomNumber,
          last_updated_at: nowIso,
        })
        .eq('id', bedId)
        .select()
        .single()
      if (error) throw error
      updatedBed = data
    } else {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      const supabase = await createServerSupabaseClient()
      const { data, error } = await supabase
        .from('beds')
        .update({
          status: newStatus,
          capabilities: newCapabilities,
          room_number: newRoomNumber,
          last_updated_at: nowIso,
        })
        .eq('id', bedId)
        .select()
        .single()
      if (error) throw error
      updatedBed = data
    }

    return {
      id: updatedBed.id,
      hospital_id: updatedBed.hospital_id,
      capabilities: updatedBed.capabilities,
      status: updatedBed.status,
      room_number: updatedBed.room_number,
      last_updated_at: updatedBed.last_updated_at,
      created_at: updatedBed.created_at,
    }
  } catch (err) {
    throw toOperationError(err)
  }
}

export interface ConfirmNurseInventoryResult {
  hospital_id: string
  confirmed_at: string
  message: string
}

/**
 * Explicitly confirms that the nurse has checked the displayed hospital bed inventory
 * and confirms it is still accurate.
 *
 * Preserves bed freshness integrity: This does NOT blindly update bed.last_updated_at timestamps
 * for all beds or categories, preserving truthful telemetry and ranking freshness.
 * Instead, updates public.hospitals.updated_at as the authoritative hospital-level confirmation timestamp.
 */
export async function confirmNurseInventory(
  client?: any
): Promise<ConfirmNurseInventoryResult> {
  try {
    if (!client) {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      client = await createServerSupabaseClient()
    }
    const authContext = await requireRole(['nurse', 'admin'], client)
    const { profile } = authContext

    if (!profile.hospital_id) {
      throw new ForbiddenOperationError('Nurse profile missing hospital affiliation')
    }

    const hospitalId = profile.hospital_id
    const nowIso = new Date().toISOString()

    if (typeof client?.query === 'function') {
      await client.query(
        `UPDATE public.hospitals SET updated_at = $1 WHERE id = $2;`,
        [nowIso, hospitalId]
      )
    } else if (typeof client?.from === 'function') {
      const { error } = await client
        .from('hospitals')
        .update({ updated_at: nowIso })
        .eq('id', hospitalId)
      if (error) throw error
    } else {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      const supabase = await createServerSupabaseClient()
      const { error } = await supabase
        .from('hospitals')
        .update({ updated_at: nowIso })
        .eq('id', hospitalId)
      if (error) throw error
    }

    return {
      hospital_id: hospitalId,
      confirmed_at: nowIso,
      message: 'The Nurse has checked the displayed inventory and confirms it is still accurate.',
    }
  } catch (err) {
    throw toOperationError(err)
  }
}

/**
 * Admits an incoming EMS emergency patient into the hospital.
 * State transition: EMS reservation -> ADMITTED -> OCCUPIED
 * - Physical bed transitions held -> occupied
 * - Reservation records admitted_at
 * - BedRequest transitions to 'admitted'
 * Owned by Nursing staff (role: nurse or admin).
 */
export async function admitEmsPatient(
  input: AdmitEmsPatientInput,
  client?: any
): Promise<AdmitEmsPatientResult> {
  try {
    if (!client) {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      client = await createServerSupabaseClient()
    }
    const authContext = await requireRole(['nurse', 'admin'], client)
    const { profile } = authContext

    let hospitalId: string
    if (profile.role === 'nurse') {
      if (!profile.hospital_id) {
        throw new ForbiddenOperationError('Nurse profile missing hospital affiliation')
      }
      hospitalId = profile.hospital_id
    } else {
      hospitalId = profile.hospital_id || ''
    }

    const evaluationTime = validateEvaluationTime(
      input.evaluationTime,
      'evaluationTime'
    )
    const evalIso = evaluationTime.toISOString()

    // Find reservation either by input.reservationId or input.bedId
    let reservation: any = null
    if (input.reservationId) {
      const resId = validateUUID(input.reservationId, 'reservationId')
      if (typeof client?.query === 'function') {
        const res = await client.query(
          `SELECT * FROM public.reservations WHERE id = $1;`,
          [resId]
        )
        reservation = res.rows[0] ?? null
      } else {
        const { data, error } = await client
          .from('reservations')
          .select('*')
          .eq('id', resId)
          .maybeSingle()
        if (error) throw error
        reservation = data
      }
    } else if (input.bedId) {
      const bId = validateUUID(input.bedId, 'bedId')
      if (typeof client?.query === 'function') {
        const res = await client.query(
          `SELECT * FROM public.reservations
           WHERE bed_id = $1 AND status = 'accepted' AND discharged_at IS NULL
           ORDER BY created_at DESC LIMIT 1;`,
          [bId]
        )
        reservation = res.rows[0] ?? null
      } else {
        const { data, error } = await client
          .from('reservations')
          .select('*')
          .eq('bed_id', bId)
          .eq('status', 'accepted')
          .is('discharged_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) throw error
        reservation = data
      }
    } else {
      throw new ValidationOperationError('Either reservationId or bedId must be provided to admit EMS patient')
    }

    if (!reservation) {
      throw new NotFoundOperationError('No valid accepted EMS reservation found to admit')
    }

    if (profile.role === 'nurse' && reservation.hospital_id !== hospitalId) {
      throw new ForbiddenOperationError(
        `Forbidden: Nurse cannot admit reservations for hospital ${reservation.hospital_id}`
      )
    }

    if (reservation.status !== 'accepted') {
      throw new ConflictOperationError(
        `Cannot admit EMS patient: reservation is in status "${reservation.status}" (must be accepted)`
      )
    }

    if (reservation.admitted_at) {
      return {
        success: true,
        reservationId: reservation.id,
        bedId: reservation.bed_id,
        bedRequestId: reservation.bed_request_id,
        admittedAt: reservation.admitted_at,
        status: 'occupied',
        idempotent: true,
      }
    }

    // Call atomic RPC or execute queries
    if (typeof client?.query === 'function') {
      try {
        const rpcRes = await client.query(
          `SELECT public.admit_ems_patient_atomic($1, $2, $3::timestamptz) as result;`,
          [reservation.id, reservation.hospital_id, evalIso]
        )
        const result = rpcRes.rows[0]?.result
        return {
          success: true,
          reservationId: result.reservation_id,
          bedId: result.bed_id,
          bedRequestId: result.bed_request_id,
          admittedAt: result.admitted_at,
          status: 'occupied',
          idempotent: Boolean(result.idempotent),
        }
      } catch (err: any) {
        await client.query(
          `UPDATE public.reservations SET admitted_at = $1, updated_at = $1 WHERE id = $2;`,
          [evalIso, reservation.id]
        )
        await client.query(
          `UPDATE public.beds SET status = 'occupied', last_updated_at = $1 WHERE id = $2;`,
          [evalIso, reservation.bed_id]
        )
        await client.query(
          `UPDATE public.bed_requests SET status = 'admitted', updated_at = $1 WHERE id = $2;`,
          [evalIso, reservation.bed_request_id]
        )
        return {
          success: true,
          reservationId: reservation.id,
          bedId: reservation.bed_id,
          bedRequestId: reservation.bed_request_id,
          admittedAt: evalIso,
          status: 'occupied',
          idempotent: false,
        }
      }
    } else {
      try {
        const { data, error } = await client.rpc('admit_ems_patient_atomic', {
          p_reservation_id: reservation.id,
          p_hospital_id: reservation.hospital_id,
          p_now: evalIso,
        })
        if (!error && data) {
          return {
            success: true,
            reservationId: data.reservation_id,
            bedId: data.bed_id,
            bedRequestId: data.bed_request_id,
            admittedAt: data.admitted_at,
            status: 'occupied',
            idempotent: Boolean(data.idempotent),
          }
        }
      } catch {
        // Fallback
      }

      await client
        .from('reservations')
        .update({ admitted_at: evalIso, updated_at: evalIso })
        .eq('id', reservation.id)
      await client
        .from('beds')
        .update({ status: 'occupied', last_updated_at: evalIso })
        .eq('id', reservation.bed_id)
      await client
        .from('bed_requests')
        .update({ status: 'admitted', updated_at: evalIso })
        .eq('id', reservation.bed_request_id)

      return {
        success: true,
        reservationId: reservation.id,
        bedId: reservation.bed_id,
        bedRequestId: reservation.bed_request_id,
        admittedAt: evalIso,
        status: 'occupied',
        idempotent: false,
      }
    }
  } catch (err) {
    throw toOperationError(err)
  }
}

/**
 * Discharges an EMS-admitted patient from a hospital bed.
 * The Nurse, NOT Hospital Staff, owns the physical discharge action.
 *
 * For an EMS reservation that has resulted in an admitted patient:
 * State transition: OCCUPIED -> AVAILABLE
 *
 * Persists:
 * - discharge timestamp
 * - association with the EMS reservation/admission
 * - authoritative bed status
 *
 * Dispatch Operator receives availability update in realtime.
 *
 * Strict Invariants:
 * - Do NOT allow discharge of HELD beds (throws CONFLICT)
 * - Do NOT allow discharge of unrelated beds (throws CONFLICT)
 * - Do NOT allow discharge of another hospital's beds (throws FORBIDDEN)
 * - Do NOT allow discharge of beds without a valid admitted EMS workflow (throws CONFLICT)
 * - Prevent duplicate/stale actions (throws CONFLICT)
 */
export async function dischargeEmsPatient(
  input: DischargeEmsPatientInput,
  client?: any
): Promise<DischargeEmsPatientResult> {
  try {
    if (!client) {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      client = await createServerSupabaseClient()
    }

    // Role check: The Nurse, NOT Hospital Staff, owns the physical discharge action.
    const authContext = await requireRole(['nurse', 'admin'], client)
    const { profile } = authContext

    // 1. Validate inputs
    const bedId = validateUUID(input.bedId, 'bedId')
    const evaluationTime = validateEvaluationTime(
      input.evaluationTime,
      'evaluationTime'
    )
    const evalIso = evaluationTime.toISOString()

    // 2. Fetch bed to verify existence and hospital boundary
    let bed: Bed | null = null
    if (typeof client?.query === 'function') {
      const res = await client.query(`SELECT * FROM public.beds WHERE id = $1;`, [bedId])
      bed = res.rows[0] ?? null
    } else {
      const { data, error } = await client.from('beds').select('*').eq('id', bedId).maybeSingle()
      if (error) throw error
      bed = data
    }

    if (!bed) {
      throw new NotFoundOperationError(`Bed not found with ID: ${bedId}`)
    }

    // Hospital boundary check: cross-hospital discharge forbidden
    if (profile.role === 'nurse') {
      if (bed.hospital_id !== profile.hospital_id) {
        throw new ForbiddenOperationError(
          `Forbidden: Nurse cannot discharge beds belonging to another hospital (${bed.hospital_id})`
        )
      }
    }

    // Invariant: Do NOT allow discharge of HELD beds
    if (bed.status === 'held') {
      throw new ConflictOperationError(
        `Cannot discharge bed ${bedId}: Bed is currently held by an active emergency reservation`
      )
    }

    // Invariant: Bed must be currently occupied
    if (bed.status !== 'occupied') {
      throw new ConflictOperationError(
        `Cannot discharge bed with status "${bed.status}": Only occupied beds can be discharged`
      )
    }

    // 3. Find active admitted EMS reservation for this bed
    let activeReservation: any = null
    if (typeof client?.query === 'function') {
      const res = await client.query(
        `SELECT * FROM public.reservations
         WHERE bed_id = $1 AND hospital_id = $2 AND admitted_at IS NOT NULL AND discharged_at IS NULL
         ORDER BY admitted_at DESC LIMIT 1;`,
        [bedId, bed.hospital_id]
      )
      activeReservation = res.rows[0] ?? null
    } else {
      const { data, error } = await client
        .from('reservations')
        .select('*')
        .eq('bed_id', bedId)
        .eq('hospital_id', bed.hospital_id)
        .not('admitted_at', 'is', null)
        .is('discharged_at', null)
        .order('admitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      activeReservation = data
    }

    // Invariant: Do NOT allow discharge of unrelated beds / beds without valid admitted EMS workflow
    if (!activeReservation) {
      throw new ConflictOperationError(
        `Cannot perform EMS discharge on bed ${bedId}: Bed does not have an active admitted EMS patient workflow`
      )
    }

    // 4. Atomic discharge execution
    if (typeof client?.query === 'function') {
      try {
        const rpcRes = await client.query(
          `SELECT public.discharge_ems_patient_atomic($1, $2, $3::timestamptz) as result;`,
          [bedId, bed.hospital_id, evalIso]
        )
        const result = rpcRes.rows[0]?.result
        return {
          success: true,
          bedId,
          reservationId: result.reservation_id,
          bedRequestId: result.bed_request_id,
          hospitalId: bed.hospital_id,
          dischargedAt: result.discharged_at,
          status: 'available',
        }
      } catch (err: any) {
        // Fallback to direct SQL
        await client.query(
          `UPDATE public.reservations SET discharged_at = $1, updated_at = $1 WHERE id = $2;`,
          [evalIso, activeReservation.id]
        )
        await client.query(
          `UPDATE public.bed_requests SET status = 'closed', updated_at = $1 WHERE id = $2;`,
          [evalIso, activeReservation.bed_request_id]
        )
        await client.query(
          `UPDATE public.beds SET status = 'available', last_updated_at = $1 WHERE id = $2;`,
          [evalIso, bedId]
        )
        return {
          success: true,
          bedId,
          reservationId: activeReservation.id,
          bedRequestId: activeReservation.bed_request_id,
          hospitalId: bed.hospital_id,
          dischargedAt: evalIso,
          status: 'available',
        }
      }
    } else {
      try {
        const { data, error } = await client.rpc('discharge_ems_patient_atomic', {
          p_bed_id: bedId,
          p_hospital_id: bed.hospital_id,
          p_now: evalIso,
        })
        if (!error && data) {
          return {
            success: true,
            bedId,
            reservationId: data.reservation_id,
            bedRequestId: data.bed_request_id,
            hospitalId: bed.hospital_id,
            dischargedAt: data.discharged_at,
            status: 'available',
          }
        }
      } catch {
        // Fallback below
      }

      await client
        .from('reservations')
        .update({ discharged_at: evalIso, updated_at: evalIso })
        .eq('id', activeReservation.id)
      await client
        .from('bed_requests')
        .update({ status: 'closed', updated_at: evalIso })
        .eq('id', activeReservation.bed_request_id)
      await client
        .from('beds')
        .update({ status: 'available', last_updated_at: evalIso })
        .eq('id', bedId)

      return {
        success: true,
        bedId,
        reservationId: activeReservation.id,
        bedRequestId: activeReservation.bed_request_id,
        hospitalId: bed.hospital_id,
        dischargedAt: evalIso,
        status: 'available',
      }
    }
  } catch (err) {
    throw toOperationError(err)
  }
}

