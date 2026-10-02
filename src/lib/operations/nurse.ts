import { requireRole } from '@/lib/auth/server'
import type { Bed, BedCapability, BedStatus } from '@/lib/types/database'
import {
  ForbiddenOperationError,
  NotFoundOperationError,
  ConflictOperationError,
  ValidationOperationError,
  toOperationError,
} from './errors'
import type { NurseBedView, UpdateNurseBedInput } from './types'
import {
  validateUUID,
  validateBedStatus,
  validateCapabilities,
  validateRoomNumber,
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
    const authContext = await requireRole(['nurse', 'admin'], client)
    const { profile } = authContext

    let hospitalId: string
    if (profile.role === 'nurse') {
      if (!profile.hospital_id) {
        throw new ForbiddenOperationError('Nurse profile missing hospital affiliation')
      }
      hospitalId = profile.hospital_id
    } else {
      // Admin role
      hospitalId = options?.targetHospitalId || profile.hospital_id || ''
    }

    let beds: Bed[] = []

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
      } else {
        const res = await client.query(
          `SELECT id, hospital_id, capabilities, status, room_number, last_updated_at, created_at
           FROM public.beds
           ORDER BY hospital_id ASC, room_number ASC NULLS LAST, created_at ASC;`
        )
        beds = res.rows
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
    }

    return beds.map((b) => ({
      id: b.id,
      hospital_id: b.hospital_id,
      capabilities: b.capabilities,
      status: b.status,
      room_number: b.room_number,
      last_updated_at: b.last_updated_at,
      created_at: b.created_at,
    }))
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
    // If bed is currently held or has an active held reservation, block status/capability modification
    if (validatedStatus !== undefined || validatedCapabilities !== undefined) {
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
          'Cannot modify status or capabilities of a physical bed while it is held by an active emergency reservation'
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
