import { requireDispatchAccess, requireRole } from '@/lib/auth/server'
import { ReservationService } from '@/lib/reservations/service'
import { rankHospitals } from '@/lib/ranking'
import type { BedCapability, BedRequest, Reservation, Hospital, Bed } from '@/lib/types/database'
import {
  ForbiddenOperationError,
  NotFoundOperationError,
  ValidationOperationError,
  toOperationError,
} from './errors'
import type {
  CreateBedRequestInput,
  SelectDispatchHospitalInput,
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
    if (!client) {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      client = await createServerSupabaseClient()
    }
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
    if (!client) {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      client = await createServerSupabaseClient()
    }
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
    if (!client) {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      client = await createServerSupabaseClient()
    }
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
  client?: any,
  explicitEvaluationTime?: Date | string
): Promise<DispatchRankedCandidateView[]> {
  try {
    if (!client) {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      client = await createServerSupabaseClient()
    }
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

    // 3. For ranking evaluation: the bed currently held by THIS request's active reservation
    // is treated as available for this request's candidate evaluation.
    const activeBedId = bedRequestView.active_reservation?.bed_id
    const rankingBeds = beds.map((b) => {
      if (activeBedId && b.id === activeBedId) {
        return { ...b, status: 'available' as const }
      }
      return b
    })

    // 4. Evaluate deterministic ranking engine using authoritative evaluation timestamp
    const evaluationTime = explicitEvaluationTime
      ? (explicitEvaluationTime instanceof Date ? explicitEvaluationTime : new Date(explicitEvaluationTime))
      : new Date(bedRequestView.active_reservation?.created_at || bedRequestView.created_at || Date.now())

    const rankingResult = rankHospitals(
      bedRequestView,
      hospitals,
      rankingBeds,
      evaluationTime
    )

    // 4. Map candidates to DispatchRankedCandidateView
    const bedMap = new Map<string, Bed>()
    for (const b of beds) {
      bedMap.set(b.id, b)
    }

    const hospMap = new Map<string, Hospital>()
    for (const h of hospitals) {
      hospMap.set(h.id, h)
    }

    const activeHospitalId = bedRequestView.active_reservation?.hospital_id

    const rankedViews: DispatchRankedCandidateView[] = rankingResult.candidates.map(
      (c, idx) => {
        const matchedBed = c.matched_bed_id ? bedMap.get(c.matched_bed_id) : undefined
        const hosp = hospMap.get(c.hospital_id)
        const isCurrentOffer = Boolean(
          activeHospitalId && c.hospital_id === activeHospitalId
        )

        const matchingBedsCount = rankingBeds.filter(
          (b) =>
            b.hospital_id === c.hospital_id &&
            b.status === 'available' &&
            bedRequestView.required_capabilities.every((cap) => b.capabilities.includes(cap))
        ).length

        return {
          rank: idx + 1,
          hospital_id: c.hospital_id,
          hospital_name: c.hospital_name,
          latitude: hosp?.latitude,
          longitude: hosp?.longitude,
          estimated_travel_time_minutes: c.estimated_travel_time_minutes,
          bed_data_freshness_seconds: c.bed_data_freshness_seconds,
          current_load_percent: c.current_load_percent,
          score: c.score,
          matched_bed_id: c.matched_bed_id,
          matched_bed_room_number: matchedBed?.room_number ?? null,
          matched_bed_capabilities: matchedBed?.capabilities ?? [],
          available_matching_beds_count: matchingBedsCount,
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

/**
 * Selects an eligible hospital for a BedRequest, holding an available matching bed
 * and transitioning the request to active offer.
 * If an active reservation already exists, cleanly releases it before holding the selected hospital.
 */
export async function selectDispatchHospital(
  input: SelectDispatchHospitalInput,
  client?: any
): Promise<DispatchBedRequestView> {
  try {
    if (!client) {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      client = await createServerSupabaseClient()
    }
    const authContext = await requireRole(['dispatch', 'admin'], client)
    const { user, profile } = authContext

    const validBedRequestId = validateUUID(input.bedRequestId, 'bedRequestId')
    const validHospitalId = validateUUID(input.hospitalId, 'hospitalId')

    // 1. Fetch BedRequest and verify authorization
    const bedRequestView = await getDispatchBedRequest(validBedRequestId, client)

    if (profile.role === 'dispatch' && bedRequestView.created_by !== user.id) {
      throw new ForbiddenOperationError(
        'Forbidden: Dispatch users may only select hospitals for their own BedRequests'
      )
    }

    // 2. If the selected hospital is already the active offer, return as is
    if (
      bedRequestView.active_reservation &&
      bedRequestView.active_reservation.hospital_id === validHospitalId &&
      bedRequestView.active_reservation.status === 'held'
    ) {
      return bedRequestView
    }

    // 3. Find matching available bed at the target hospital
    let matchingBed: Bed | null = null
    const requiredCaps = bedRequestView.required_capabilities

    if (typeof client?.query === 'function') {
      const res = await client.query(
        `SELECT * FROM public.beds WHERE hospital_id = $1 AND status = 'available';`,
        [validHospitalId]
      )
      const availableBeds = res.rows as Bed[]
      matchingBed = availableBeds.find((b) =>
        requiredCaps.every((reqCap) => b.capabilities.includes(reqCap))
      ) ?? null
    } else if (typeof client?.from === 'function') {
      const { data, error } = await client
        .from('beds')
        .select('*')
        .eq('hospital_id', validHospitalId)
        .eq('status', 'available')
      if (error) throw error
      const availableBeds = (data || []) as Bed[]
      matchingBed = availableBeds.find((b) =>
        requiredCaps.every((reqCap) => b.capabilities.includes(reqCap))
      ) ?? null
    } else {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      const supabase = await createServerSupabaseClient()
      const { data, error } = await supabase
        .from('beds')
        .select('*')
        .eq('hospital_id', validHospitalId)
        .eq('status', 'available')
      if (error) throw error
      const availableBeds = (data || []) as Bed[]
      matchingBed = availableBeds.find((b) =>
        requiredCaps.every((reqCap) => b.capabilities.includes(reqCap))
      ) ?? null
    }

    if (!matchingBed) {
      throw new ValidationOperationError(
        `Selected hospital has no available beds matching required capabilities: [${requiredCaps.join(', ')}]`
      )
    }

    const reservationService = new ReservationService(client)
    const now = new Date()

    // 4. If there is currently an active reservation, release it first
    if (bedRequestView.current_active_reservation_id && bedRequestView.active_reservation?.status === 'held') {
      await reservationService.reject({
        reservationId: bedRequestView.current_active_reservation_id,
        evaluationTime: now,
        autoFallback: false,
      })
    }

    // 5. Determine next attempt number
    const nextAttempt = (bedRequestView.reservation_history?.length ?? 0) + 1

    // 6. Hold reservation at target hospital
    await reservationService.hold({
      bedRequestId: validBedRequestId,
      hospitalId: validHospitalId,
      bedId: matchingBed.id,
      attemptNumber: nextAttempt,
      evaluationTime: now,
    })

    // 7. Return updated BedRequest view
    return await getDispatchBedRequest(validBedRequestId, client)
  } catch (err) {
    throw toOperationError(err)
  }
}

