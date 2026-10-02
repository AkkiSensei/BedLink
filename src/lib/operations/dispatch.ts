import { requireDispatchAccess, requireRole } from '@/lib/auth/server'
import { ReservationService } from '@/lib/reservations/service'
import { rankHospitals } from '@/lib/ranking'
import type { BedCapability, BedRequest, Reservation, Hospital, Bed } from '@/lib/types/database'
import {
  ForbiddenOperationError,
  NotFoundOperationError,
  toOperationError,
} from './errors'
import type {
  CreateBedRequestInput,
  DispatchBedRequestView,
  DispatchReservationView,
  DispatchReservationHistoryView,
  DispatchRankedCandidateView,
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

    // Retrieve all reservations for this BedRequest to build complete attempt history and active view
    let reservationHistory: DispatchReservationHistoryView[] = []
    let activeReservationView: DispatchReservationView | null = null

    if (typeof client?.query === 'function') {
      const res = await client.query(
        `SELECT r.id, r.hospital_id, h.name as hospital_name, r.bed_id, b.room_number, b.capabilities, r.status,
                r.attempt_number, r.hold_expires_at, r.created_at
         FROM public.reservations r
         LEFT JOIN public.hospitals h ON h.id = r.hospital_id
         LEFT JOIN public.beds b ON b.id = r.bed_id AND b.hospital_id = r.hospital_id
         WHERE r.bed_request_id = $1
         ORDER BY r.attempt_number ASC;`,
        [bedRequest.id]
      )
      reservationHistory = res.rows.map((row: any) => ({
        id: row.id,
        hospital_id: row.hospital_id,
        hospital_name: row.hospital_name || 'Authorized Hospital',
        bed_id: row.bed_id,
        status: row.status,
        attempt_number: row.attempt_number,
        hold_expires_at: row.hold_expires_at,
        created_at: row.created_at,
      }))

      if (bedRequest.current_active_reservation_id) {
        const activeRow = res.rows.find(
          (r: any) => r.id === bedRequest!.current_active_reservation_id
        )
        if (activeRow) {
          activeReservationView = {
            id: activeRow.id,
            hospital_id: activeRow.hospital_id,
            hospital_name: activeRow.hospital_name,
            bed_id: activeRow.bed_id,
            room_number: activeRow.room_number ?? null,
            capabilities: activeRow.capabilities ?? [],
            status: activeRow.status,
            attempt_number: activeRow.attempt_number,
            hold_expires_at: activeRow.hold_expires_at,
            created_at: activeRow.created_at,
          }
        }
      }
    } else if (typeof client?.from === 'function') {
      const { data, error } = await client
        .from('reservations')
        .select(
          `id, hospital_id, bed_id, status, attempt_number, hold_expires_at, created_at,
           hospitals:hospital_id ( name ),
           beds:bed_id ( room_number, capabilities )`
        )
        .eq('bed_request_id', bedRequest.id)
        .order('attempt_number', { ascending: true })
      if (!error && data) {
        reservationHistory = data.map((d: any) => ({
          id: d.id,
          hospital_id: d.hospital_id,
          hospital_name: (d.hospitals as any)?.name || 'Authorized Hospital',
          bed_id: d.bed_id,
          status: d.status,
          attempt_number: d.attempt_number,
          hold_expires_at: d.hold_expires_at,
          created_at: d.created_at,
        }))

        if (bedRequest.current_active_reservation_id) {
          const activeItem = data.find(
            (d: any) => d.id === bedRequest!.current_active_reservation_id
          )
          if (activeItem) {
            activeReservationView = {
              id: activeItem.id,
              hospital_id: activeItem.hospital_id,
              hospital_name: (activeItem.hospitals as any)?.name,
              bed_id: activeItem.bed_id,
              room_number: (activeItem.beds as any)?.room_number ?? null,
              capabilities: (activeItem.beds as any)?.capabilities ?? [],
              status: activeItem.status,
              attempt_number: activeItem.attempt_number,
              hold_expires_at: activeItem.hold_expires_at,
              created_at: activeItem.created_at,
            }
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
      reservation_history: reservationHistory,
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

/**
 * Narrowly-scoped Dispatch read operation:
 * Evaluates and returns the authoritative ranked hospital candidates for a specific BedRequest.
 * Reuses the pure Phase 4 deterministic ranking engine.
 * Protects dispatch ownership isolation.
 */
export async function getDispatchRankedCandidates(
  bedRequestId: string,
  client?: any
): Promise<DispatchRankedCandidateView[]> {
  try {
    const authContext = await requireRole(['dispatch', 'admin'], client)
    const { user, profile } = authContext

    const validId = validateUUID(bedRequestId, 'bedRequestId')

    // 1. Fetch BedRequest and verify authorization
    const bedRequestView = await getDispatchBedRequest(validId, client)

    // 2. Fetch hospitals and beds state
    let hospitals: Hospital[] = []
    let beds: Bed[] = []

    if (typeof client?.query === 'function') {
      const hospRes = await client.query(`SELECT * FROM public.hospitals;`)
      hospitals = hospRes.rows.map((h: any) => ({
        ...h,
        latitude: Number(h.latitude),
        longitude: Number(h.longitude),
        current_load_percent: Number(h.current_load_percent),
      }))

      const bedsRes = await client.query(`SELECT * FROM public.beds;`)
      beds = bedsRes.rows
    } else if (typeof client?.from === 'function') {
      const hospRes = await client.from('hospitals').select('*')
      if (hospRes.error) throw hospRes.error
      hospitals = hospRes.data.map((h: any) => ({
        ...h,
        latitude: Number(h.latitude),
        longitude: Number(h.longitude),
        current_load_percent: Number(h.current_load_percent),
      }))

      const bedsRes = await client.from('beds').select('*')
      if (bedsRes.error) throw bedsRes.error
      beds = bedsRes.data
    } else {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      const supabase = await createServerSupabaseClient()
      const hospRes = await supabase.from('hospitals').select('*')
      if (hospRes.error) throw hospRes.error
      hospitals = hospRes.data.map((h: any) => ({
        ...h,
        latitude: Number(h.latitude),
        longitude: Number(h.longitude),
        current_load_percent: Number(h.current_load_percent),
      }))

      const bedsRes = await supabase.from('beds').select('*')
      if (bedsRes.error) throw bedsRes.error
      beds = bedsRes.data
    }

    // 3. Evaluate deterministic ranking engine using the request's created_at evaluation timestamp
    const evaluationTime = new Date(bedRequestView.created_at || Date.now())
    const rankingResult = rankHospitals(
      bedRequestView,
      hospitals,
      beds,
      evaluationTime
    )

    // 4. Map candidates to DispatchRankedCandidateView
    const bedMap = new Map<string, Bed>()
    for (const b of beds) {
      bedMap.set(b.id, b)
    }

    const activeHospitalId = bedRequestView.active_reservation?.hospital_id

    const rankedViews: DispatchRankedCandidateView[] = rankingResult.candidates.map(
      (c, idx) => {
        const matchedBed = c.matched_bed_id ? bedMap.get(c.matched_bed_id) : undefined
        const isCurrentOffer = Boolean(
          activeHospitalId && c.hospital_id === activeHospitalId
        )

        return {
          rank: idx + 1,
          hospital_id: c.hospital_id,
          hospital_name: c.hospital_name,
          estimated_travel_time_minutes: c.estimated_travel_time_minutes,
          bed_data_freshness_seconds: c.bed_data_freshness_seconds,
          current_load_percent: c.current_load_percent,
          score: c.score,
          matched_bed_id: c.matched_bed_id,
          matched_bed_room_number: matchedBed?.room_number ?? null,
          matched_bed_capabilities: matchedBed?.capabilities ?? [],
          is_current_offer: isCurrentOffer,
          breakdown: {
            travel_component: c.travel_component,
            freshness_component: c.freshness_component,
            load_penalty: c.load_penalty,
          },
        }
      }
    )

    return rankedViews
  } catch (err) {
    throw toOperationError(err)
  }
}
