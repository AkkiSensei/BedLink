import { requireDispatchAccess, requireRole } from '@/lib/auth/server'
import { ReservationService } from '@/lib/reservations/service'
import type { BedCapability, BedRequest, Reservation } from '@/lib/types/database'
import {
  ForbiddenOperationError,
  NotFoundOperationError,
  toOperationError,
} from './errors'
import type {
  CreateBedRequestInput,
  DispatchBedRequestView,
  DispatchReservationView,
} from './types'
import {
  validateAmbulancePhone,
  validateCapabilities,
  validateCoordinates,
  validateEvaluationTime,
  validateUUID,
} from './validation'

/**
 * Creates an emergency BedRequest on behalf of the authenticated Dispatch user
 * and immediately triggers initial hospital ranking and reservation hold attempt #1.
 */
export async function createDispatchBedRequest(
  input: CreateBedRequestInput,
  client?: any
): Promise<DispatchBedRequestView> {
  try {
    const authContext = await requireDispatchAccess(client)
    const { user } = authContext

    // 1. Validate inputs
    const required_capabilities = validateCapabilities(
      input.required_capabilities,
      'required_capabilities'
    )
    const { latitude, longitude } = validateCoordinates(
      input.ambulance_latitude,
      input.ambulance_longitude,
      'Ambulance'
    )
    const ambulance_phone = validateAmbulancePhone(input.ambulance_phone)
    const evaluationTime = validateEvaluationTime(
      input.evaluationTime,
      'evaluationTime'
    )

    // 2. Authoritative identity and timestamps
    const created_by = user.id
    const nowIso = new Date().toISOString()

    let newBedRequest: BedRequest

    if (typeof client?.query === 'function') {
      const res = await client.query(
        `INSERT INTO public.bed_requests (
           required_capabilities,
           ambulance_latitude,
           ambulance_longitude,
           ambulance_phone,
           status,
           current_active_reservation_id,
           attempted_hospitals,
           created_by,
           created_at,
           updated_at
         ) VALUES ($1, $2, $3, $4, 'pending', NULL, ARRAY[]::uuid[], $5, $6, $7)
         RETURNING *;`,
        [
          required_capabilities,
          latitude,
          longitude,
          ambulance_phone,
          created_by,
          nowIso,
          nowIso,
        ]
      )
      const raw = res.rows[0]
      newBedRequest = {
        ...raw,
        ambulance_latitude: Number(raw.ambulance_latitude),
        ambulance_longitude: Number(raw.ambulance_longitude),
      }
    } else if (typeof client?.from === 'function') {
      const { data, error } = await client
        .from('bed_requests')
        .insert({
          required_capabilities,
          ambulance_latitude: latitude,
          ambulance_longitude: longitude,
          ambulance_phone,
          status: 'pending',
          current_active_reservation_id: null,
          attempted_hospitals: [],
          created_by,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select()
        .single()
      if (error) throw error
      newBedRequest = {
        ...data,
        ambulance_latitude: Number(data.ambulance_latitude),
        ambulance_longitude: Number(data.ambulance_longitude),
      }
    } else {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      const supabase = await createServerSupabaseClient()
      const { data, error } = await supabase
        .from('bed_requests')
        .insert({
          required_capabilities,
          ambulance_latitude: latitude,
          ambulance_longitude: longitude,
          ambulance_phone,
          status: 'pending',
          current_active_reservation_id: null,
          attempted_hospitals: [],
          created_by,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select()
        .single()
      if (error) throw error
      newBedRequest = {
        ...data,
        ambulance_latitude: Number(data.ambulance_latitude),
        ambulance_longitude: Number(data.ambulance_longitude),
      }
    }

    // 3. Trigger initial hospital ranking & reservation hold attempt #1 via ReservationService
    const reservationService = new ReservationService(client)
    await reservationService.fallback({
      bedRequestId: newBedRequest.id,
      evaluationTime,
    })

    // 4. Return populated view model
    return await getDispatchBedRequest(newBedRequest.id, client)
  } catch (err) {
    throw toOperationError(err)
  }
}

/**
 * Retrieves a single BedRequest and its current active reservation offer for Dispatch.
 * Enforces ownership boundary: Dispatch users can only view their own BedRequests.
 */
export async function getDispatchBedRequest(
  bedRequestId: string,
  client?: any
): Promise<DispatchBedRequestView> {
  try {
    const authContext = await requireRole(['dispatch', 'admin'], client)
    const { user, profile } = authContext

    const validId = validateUUID(bedRequestId, 'bedRequestId')

    let bedRequest: BedRequest | null = null

    if (typeof client?.query === 'function') {
      const res = await client.query(
        `SELECT * FROM public.bed_requests WHERE id = $1;`,
        [validId]
      )
      const raw = res.rows[0] ?? null
      if (raw) {
        bedRequest = {
          ...raw,
          ambulance_latitude: Number(raw.ambulance_latitude),
          ambulance_longitude: Number(raw.ambulance_longitude),
        }
      }
    } else if (typeof client?.from === 'function') {
      const { data, error } = await client
        .from('bed_requests')
        .select('*')
        .eq('id', validId)
        .maybeSingle()
      if (error) throw error
      if (data) {
        bedRequest = {
          ...data,
          ambulance_latitude: Number(data.ambulance_latitude),
          ambulance_longitude: Number(data.ambulance_longitude),
        }
      }
    } else {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      const supabase = await createServerSupabaseClient()
      const { data, error } = await supabase
        .from('bed_requests')
        .select('*')
        .eq('id', validId)
        .maybeSingle()
      if (error) throw error
      if (data) {
        bedRequest = {
          ...data,
          ambulance_latitude: Number(data.ambulance_latitude),
          ambulance_longitude: Number(data.ambulance_longitude),
        }
      }
    }

    if (!bedRequest) {
      throw new NotFoundOperationError(`BedRequest not found: ${validId}`)
    }

    // Enforce dispatch ownership isolation
    if (profile.role === 'dispatch' && bedRequest.created_by !== user.id) {
      throw new ForbiddenOperationError(
        'Forbidden: Dispatch users may only view their own BedRequests'
      )
    }

    // Retrieve active reservation if present
    let activeReservationView: DispatchReservationView | null = null

    if (bedRequest.current_active_reservation_id) {
      if (typeof client?.query === 'function') {
        const res = await client.query(
          `SELECT r.id, r.hospital_id, h.name as hospital_name, r.bed_id, r.status,
                  r.attempt_number, r.hold_expires_at, r.created_at
           FROM public.reservations r
           LEFT JOIN public.hospitals h ON h.id = r.hospital_id
           WHERE r.id = $1;`,
          [bedRequest.current_active_reservation_id]
        )
        const row = res.rows[0]
        if (row) {
          activeReservationView = {
            id: row.id,
            hospital_id: row.hospital_id,
            hospital_name: row.hospital_name,
            bed_id: row.bed_id,
            status: row.status,
            attempt_number: row.attempt_number,
            hold_expires_at: row.hold_expires_at,
            created_at: row.created_at,
          }
        }
      } else if (typeof client?.from === 'function') {
        const { data, error } = await client
          .from('reservations')
          .select(
            `id, hospital_id, bed_id, status, attempt_number, hold_expires_at, created_at,
             hospitals:hospital_id ( name )`
          )
          .eq('id', bedRequest.current_active_reservation_id)
          .maybeSingle()
        if (error) throw error
        if (data) {
          activeReservationView = {
            id: data.id,
            hospital_id: data.hospital_id,
            hospital_name: (data.hospitals as any)?.name,
            bed_id: data.bed_id,
            status: data.status,
            attempt_number: data.attempt_number,
            hold_expires_at: data.hold_expires_at,
            created_at: data.created_at,
          }
        }
      }
    }

    return {
      id: bedRequest.id,
      status: bedRequest.status,
      required_capabilities: bedRequest.required_capabilities,
      ambulance_latitude: bedRequest.ambulance_latitude,
      ambulance_longitude: bedRequest.ambulance_longitude,
      ambulance_phone: bedRequest.ambulance_phone,
      current_active_reservation_id: bedRequest.current_active_reservation_id,
      attempted_hospitals: bedRequest.attempted_hospitals,
      created_by: bedRequest.created_by,
      created_at: bedRequest.created_at,
      updated_at: bedRequest.updated_at,
      active_reservation: activeReservationView,
    }
  } catch (err) {
    throw toOperationError(err)
  }
}

/**
 * Lists BedRequests for the authenticated Dispatch user (or all if admin).
 */
export async function listDispatchBedRequests(
  client?: any
): Promise<DispatchBedRequestView[]> {
  try {
    const authContext = await requireRole(['dispatch', 'admin'], client)
    const { user, profile } = authContext

    let requests: BedRequest[] = []

    if (typeof client?.query === 'function') {
      let queryStr = `SELECT * FROM public.bed_requests`
      const params: any[] = []
      if (profile.role === 'dispatch') {
        queryStr += ` WHERE created_by = $1`
        params.push(user.id)
      }
      queryStr += ` ORDER BY created_at DESC;`
      const res = await client.query(queryStr, params)
      requests = res.rows.map((raw: any) => ({
        ...raw,
        ambulance_latitude: Number(raw.ambulance_latitude),
        ambulance_longitude: Number(raw.ambulance_longitude),
      }))
    } else if (typeof client?.from === 'function') {
      let query = client.from('bed_requests').select('*').order('created_at', { ascending: false })
      if (profile.role === 'dispatch') {
        query = query.eq('created_by', user.id)
      }
      const { data, error } = await query
      if (error) throw error
      requests = (data || []).map((raw: any) => ({
        ...raw,
        ambulance_latitude: Number(raw.ambulance_latitude),
        ambulance_longitude: Number(raw.ambulance_longitude),
      }))
    }

    const views: DispatchBedRequestView[] = []
    for (const r of requests) {
      views.push(await getDispatchBedRequest(r.id, client))
    }
    return views
  } catch (err) {
    throw toOperationError(err)
  }
}
