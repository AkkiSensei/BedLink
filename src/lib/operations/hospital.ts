import { requireRole } from '@/lib/auth/server'
import { ReservationService } from '@/lib/reservations/service'
import type { AcceptReservationResult, RejectReservationResult } from '@/lib/reservations/types'
import {
  ConflictOperationError,
  ExpiredReservationOperationError,
  ForbiddenOperationError,
  NotFoundOperationError,
  toOperationError,
} from './errors'
import type {
  AcceptHospitalReservationInput,
  HospitalReservationView,
  RejectHospitalReservationInput,
  HospitalStatisticsData,
  StatisticsTimeFilter,
  HospitalDailyTrendPoint,
  HospitalDevelopmentInsight,
  HospitalAcuityStats,
} from './types'
import { validateEvaluationTime, validateUUID } from './validation'
import { haversineDistanceKm, calculateEtaMinutes } from '@/lib/ranking/haversine'

export interface GetHospitalReservationsOptions {
  targetHospitalId?: string
  statuses?: ('held' | 'accepted' | 'rejected' | 'expired')[]
  limit?: number
  since?: Date | string
}

/**
 * Retrieves emergency reservation offers held or past for the authenticated hospital.
 * Defaults to 'held' status to preserve operational queue isolation.
 * When statuses array is provided, retrieves matching active and historical offers.
 */
export async function getHospitalReservations(
  client?: any,
  options?: GetHospitalReservationsOptions
): Promise<HospitalReservationView[]> {
  try {
    if (!client) {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      client = await createServerSupabaseClient()
    }

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

    const targetStatuses =
      options?.statuses && options.statuses.length > 0
        ? options.statuses
        : ['held']

    let rows: any[] = []

    if (typeof client?.query === 'function') {
      const params: any[] = []
      let queryStr = `
        SELECT r.id, r.bed_request_id, r.hospital_id, r.bed_id, r.status,
               r.attempt_number, r.hold_expires_at, r.created_at, r.updated_at,
               br.required_capabilities, br.ambulance_latitude,
               br.ambulance_longitude, br.ambulance_phone,
               b.room_number, b.capabilities as bed_capabilities,
               h.name as hospital_name, h.latitude as hospital_latitude, h.longitude as hospital_longitude
        FROM public.reservations r
        JOIN public.bed_requests br ON br.id = r.bed_request_id
        LEFT JOIN public.beds b ON b.id = r.bed_id
        LEFT JOIN public.hospitals h ON h.id = r.hospital_id
      `

      if (targetStatuses.length === 1 && targetStatuses[0] === 'held') {
        queryStr += ` WHERE r.status = 'held'`
      } else {
        params.push(targetStatuses)
        queryStr += ` WHERE r.status = ANY($${params.length})`
      }

      if (hospitalId) {
        params.push(hospitalId)
        queryStr += ` AND r.hospital_id = $${params.length}`
      }

      if (options?.since) {
        params.push(new Date(options.since).toISOString())
        queryStr += ` AND r.created_at >= $${params.length}`
      }

      if (targetStatuses.length === 1 && targetStatuses[0] === 'held') {
        queryStr += ` ORDER BY r.hold_expires_at ASC, r.created_at ASC`
      } else {
        queryStr += ` ORDER BY r.created_at DESC`
      }

      if (options?.limit && options.limit > 0) {
        params.push(options.limit)
        queryStr += ` LIMIT $${params.length}`
      }
      queryStr += `;`

      const res = await client.query(queryStr, params)
      rows = res.rows
    } else if (typeof client?.from === 'function') {
      let query = client
        .from('reservations')
        .select(
          `id, bed_request_id, hospital_id, bed_id, status, attempt_number, hold_expires_at, created_at, updated_at,
           bed_requests!reservations_bed_request_id_fkey (
             required_capabilities, ambulance_latitude, ambulance_longitude, ambulance_phone
           ),
           beds (
             room_number, capabilities
           ),
           hospitals (
             name, latitude, longitude
           )`
        )

      if (targetStatuses.length === 1) {
        query = query.eq('status', targetStatuses[0])
      } else {
        query = query.in('status', targetStatuses)
      }

      if (hospitalId) {
        query = query.eq('hospital_id', hospitalId)
      }

      if (options?.since) {
        query = query.gte('created_at', new Date(options.since).toISOString())
      }

      if (targetStatuses.length === 1 && targetStatuses[0] === 'held') {
        query = query.order('hold_expires_at', { ascending: true })
      } else {
        query = query.order('created_at', { ascending: false })
      }

      if (options?.limit && options.limit > 0) {
        query = query.limit(options.limit)
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
        updated_at: r.updated_at,
        required_capabilities: r.bed_requests?.required_capabilities,
        ambulance_latitude: r.bed_requests?.ambulance_latitude,
        ambulance_longitude: r.bed_requests?.ambulance_longitude,
        ambulance_phone: r.bed_requests?.ambulance_phone,
        room_number: r.beds?.room_number,
        bed_capabilities: r.beds?.capabilities,
        hospital_name: r.hospitals?.name,
        hospital_latitude: r.hospitals?.latitude,
        hospital_longitude: r.hospitals?.longitude,
      }))
    }

    return rows.map((r) => {
      let eta: number | null = null
      let distanceKm: number | null = null
      if (
        r.ambulance_latitude !== undefined &&
        r.ambulance_longitude !== undefined &&
        r.hospital_latitude !== undefined &&
        r.hospital_longitude !== undefined
      ) {
        try {
          const distKm = haversineDistanceKm(
            Number(r.ambulance_latitude),
            Number(r.ambulance_longitude),
            Number(r.hospital_latitude),
            Number(r.hospital_longitude)
          )
          distanceKm = Math.round(distKm * 10) / 10
          eta = calculateEtaMinutes(distKm)
        } catch {
          eta = null
          distanceKm = null
        }
      }

      let decisionTimeSeconds: number | null = null
      if (r.status === 'accepted' || r.status === 'rejected') {
        const createdMs = new Date(r.created_at).getTime()
        const updatedMs = new Date(r.updated_at || r.created_at).getTime()
        decisionTimeSeconds = Math.max(0, Math.round((updatedMs - createdMs) / 1000))
      } else if (r.status === 'expired') {
        decisionTimeSeconds = 120
      }

      return {
        id: r.id,
        bed_request_id: r.bed_request_id,
        hospital_id: r.hospital_id,
        bed_id: r.bed_id,
        status: r.status,
        attempt_number: r.attempt_number,
        hold_expires_at: r.hold_expires_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
        required_capabilities: r.required_capabilities,
        ambulance_latitude: Number(r.ambulance_latitude),
        ambulance_longitude: Number(r.ambulance_longitude),
        ambulance_phone: r.ambulance_phone,
        hospital_name: r.hospital_name || undefined,
        hospital_latitude: r.hospital_latitude !== undefined ? Number(r.hospital_latitude) : null,
        hospital_longitude: r.hospital_longitude !== undefined ? Number(r.hospital_longitude) : null,
        distance_km: distanceKm,
        room_number: r.room_number ?? null,
        bed_capabilities: r.bed_capabilities || undefined,
        estimated_travel_time_minutes: eta,
        decision_time_seconds: decisionTimeSeconds,
      }
    })
  } catch (err) {
    throw toOperationError(err)
  }
}

/**
 * Computes authoritative hospital statistics, capacity development insights,
 * and historical attendance metrics for the given timeframe.
 */
export async function getHospitalStatistics(
  client?: any,
  options?: {
    targetHospitalId?: string
    timeFilter?: StatisticsTimeFilter
  }
): Promise<HospitalStatisticsData> {
  try {
    if (!client) {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      client = await createServerSupabaseClient()
    }

    const authContext = await requireRole(['hospital', 'admin'], client)
    const { profile } = authContext

    let hospitalId = options?.targetHospitalId || profile.hospital_id || ''
    if (profile.role === 'hospital' && profile.hospital_id) {
      hospitalId = options?.targetHospitalId || profile.hospital_id
    }

    let hospitalName = 'Authorized Emergency Facility'
    let hospitalCity = 'Emergency Operations'

    if (hospitalId) {
      if (typeof client?.query === 'function') {
        const hRes = await client.query(`SELECT name, city FROM public.hospitals WHERE id = $1;`, [hospitalId])
        if (hRes.rows[0]) {
          hospitalName = hRes.rows[0].name
          hospitalCity = hRes.rows[0].city
        }
      } else if (typeof client?.from === 'function') {
        const { data: hData } = await client
          .from('hospitals')
          .select('name, city')
          .eq('id', hospitalId)
          .maybeSingle()
        if (hData) {
          hospitalName = hData.name
          hospitalCity = hData.city
        }
      }
    }

    // Determine timeframe cutoff
    const timeFilter = options?.timeFilter || 'today'
    const now = new Date()
    let cutoff: Date | null = null

    if (timeFilter === 'today') {
      cutoff = new Date(now)
      cutoff.setHours(0, 0, 0, 0)
    } else if (timeFilter === '7days') {
      cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (timeFilter === '30days') {
      cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    }

    // Query all reservations for this hospital across all statuses
    const allOffers = await getHospitalReservations(client, {
      targetHospitalId: hospitalId || undefined,
      statuses: ['held', 'accepted', 'rejected', 'expired'],
    })

    // Filter by time window
    const filtered = cutoff
      ? allOffers.filter((r) => new Date(r.created_at).getTime() >= cutoff!.getTime())
      : allOffers

    // Compute basic metrics
    const totalAttended = filtered.length
    const admittedCount = filtered.filter((r) => r.status === 'accepted').length
    const rejectedCount = filtered.filter((r) => r.status === 'rejected').length
    const expiredCount = filtered.filter((r) => r.status === 'expired').length
    const activeCount = filtered.filter((r) => r.status === 'held').length

    const acceptanceRate = totalAttended > 0 ? Math.round((admittedCount / totalAttended) * 100) : 0
    const rejectionRate = totalAttended > 0 ? Math.round((rejectedCount / totalAttended) * 100) : 0
    const expiredRate = totalAttended > 0 ? Math.round((expiredCount / totalAttended) * 100) : 0

    const decisionTimes = filtered
      .filter((r) => typeof r.decision_time_seconds === 'number' && (r.status === 'accepted' || r.status === 'rejected'))
      .map((r) => r.decision_time_seconds as number)

    const avgDecisionTimeSeconds =
      decisionTimes.length > 0 ? Math.round(decisionTimes.reduce((a, b) => a + b, 0) / decisionTimes.length) : null
    const fastestDecisionSeconds = decisionTimes.length > 0 ? Math.min(...decisionTimes) : null
    const slowestDecisionSeconds = decisionTimes.length > 0 ? Math.max(...decisionTimes) : null

    // Acuity breakdown
    const acuityKeys: Array<'icu' | 'ventilator' | 'oxygen' | 'general'> = ['icu', 'ventilator', 'oxygen', 'general']
    const acuityBreakdown: Record<'icu' | 'ventilator' | 'oxygen' | 'general', HospitalAcuityStats> = {
      icu: { total: 0, admitted: 0, rejected: 0, expired: 0 },
      ventilator: { total: 0, admitted: 0, rejected: 0, expired: 0 },
      oxygen: { total: 0, admitted: 0, rejected: 0, expired: 0 },
      general: { total: 0, admitted: 0, rejected: 0, expired: 0 },
    }

    filtered.forEach((r) => {
      const caps = r.required_capabilities || []
      acuityKeys.forEach((key) => {
        if (caps.includes(key as any)) {
          acuityBreakdown[key].total++
          if (r.status === 'accepted') acuityBreakdown[key].admitted++
          else if (r.status === 'rejected') acuityBreakdown[key].rejected++
          else if (r.status === 'expired') acuityBreakdown[key].expired++
        }
      })
    })

    // Trend points (bucketed by hour if 'today', or by date if 7d/30d/all)
    const trendMap = new Map<string, { label: string; admitted: number; rejected: number; expired: number; total: number }>()

    if (timeFilter === 'today') {
      // 6 blocks of 4 hours
      for (let h = 0; h < 24; h += 4) {
        const key = `${h.toString().padStart(2, '0')}:00`
        const label = `${h}:00 - ${h + 4}:00`
        trendMap.set(key, { label, admitted: 0, rejected: 0, expired: 0, total: 0 })
      }
    } else {
      // Last 7 or 14 day buckets
      const daysCount = timeFilter === '7days' ? 7 : timeFilter === '30days' ? 14 : 10
      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        const key = d.toISOString().split('T')[0]
        const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        trendMap.set(key, { label, admitted: 0, rejected: 0, expired: 0, total: 0 })
      }
    }

    filtered.forEach((r) => {
      const createdDate = new Date(r.created_at)
      let key = ''
      if (timeFilter === 'today') {
        const hour = createdDate.getHours()
        const bucketHour = Math.floor(hour / 4) * 4
        key = `${bucketHour.toString().padStart(2, '0')}:00`
      } else {
        key = createdDate.toISOString().split('T')[0]
      }

      if (trendMap.has(key)) {
        const entry = trendMap.get(key)!
        entry.total++
        if (r.status === 'accepted') entry.admitted++
        else if (r.status === 'rejected') entry.rejected++
        else if (r.status === 'expired') entry.expired++
      }
    })

    const trendPoints: HospitalDailyTrendPoint[] = Array.from(trendMap.entries()).map(([dateKey, val]) => ({
      dateKey,
      label: val.label,
      admitted: val.admitted,
      rejected: val.rejected,
      expired: val.expired,
      total: val.total,
    }))

    // Generate intelligent development insights to help hospital evolve
    const insights: HospitalDevelopmentInsight[] = []

    if (totalAttended === 0) {
      insights.push({
        id: 'no-traffic',
        type: 'info',
        title: 'Emergency Console Online',
        message: 'No dispatch reservation offers recorded in this timeframe. Metrics will automatically update as live ambulances are dispatched.',
      })
    } else {
      // 1. Acceptance Performance
      if (acceptanceRate >= 75) {
        insights.push({
          id: 'high-acceptance',
          type: 'success',
          title: 'High Emergency Acceptance Rate',
          message: `${acceptanceRate}% of incoming ambulance offers were accepted and admitted. Your facility is maintaining optimal emergency reception readiness.`,
        })
      } else if (rejectionRate > 25) {
        insights.push({
          id: 'high-rejection',
          type: 'warning',
          title: 'Emergency Diversion Pressure Detected',
          message: `${rejectionRate}% of incoming requests were rejected. Bed availability or staffing constraints may be causing emergency diversion.`,
          actionItem: 'Review ward turnarounds and coordinate with nurse station to expedite discharges for inbound emergency capacity.',
        })
      }

      // 2. Decision Velocity
      if (avgDecisionTimeSeconds !== null) {
        if (avgDecisionTimeSeconds <= 45) {
          insights.push({
            id: 'fast-decision',
            type: 'success',
            title: 'Exemplary Response Latency',
            message: `Average decision time is ${avgDecisionTimeSeconds}s (benchmark: < 60s). Fast response protects incoming patients and minimizes EMS ambulance transit holding.`,
          })
        } else if (avgDecisionTimeSeconds > 90) {
          insights.push({
            id: 'slow-decision',
            type: 'warning',
            title: 'Triage Response Delay Alert',
            message: `Average decision latency is ${avgDecisionTimeSeconds}s, approaching the 120s hold expiration limit.`,
            actionItem: 'Ensure dedicated ED coordinator monitors the audio chimes on the console to prevent hold timeouts.',
          })
        }
      }

      // 3. Timeouts
      if (expiredCount > 0) {
        insights.push({
          id: 'expired-holds',
          type: 'critical',
          title: 'Reservation Hold Timeouts',
          message: `${expiredCount} emergency hold(s) timed out without an explicit accept or reject response, triggering automatic dispatch re-ranking.`,
          actionItem: 'Check sound volume and keep this console active on ED triage tablets to avoid missed holds.',
        })
      }

      // 4. ICU / Ventilator Acuity Focus
      if (acuityBreakdown.icu.total > 0) {
        const icuRejPercent = Math.round((acuityBreakdown.icu.rejected / (acuityBreakdown.icu.total || 1)) * 100)
        if (icuRejPercent > 30) {
          insights.push({
            id: 'icu-stress',
            type: 'warning',
            title: 'ICU / Critical Care Capacity Bottleneck',
            message: `${icuRejPercent}% of ICU bed requests were declined due to lack of available high-acuity capacity.`,
            actionItem: 'Consider re-allocating 1-2 step-down beds to high-dependency or ICU status during peak surge windows.',
          })
        }
      }
    }

    return {
      hospitalId,
      hospitalName,
      hospitalCity,
      timeFilter,
      metrics: {
        totalAttended,
        admittedCount,
        rejectedCount,
        expiredCount,
        activeCount,
        acceptanceRate,
        rejectionRate,
        expiredRate,
        avgDecisionTimeSeconds,
        fastestDecisionSeconds,
        slowestDecisionSeconds,
      },
      acuityBreakdown,
      trendPoints,
      insights,
      history: filtered,
      generatedAt: now.toISOString(),
    }
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
    if (!client) {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      client = await createServerSupabaseClient()
    }

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

    // 4. Authoritative state guard: reservation must not be expired or in incompatible terminal status
    if (reservation.status === 'expired') {
      throw new ExpiredReservationOperationError(
        `Cannot accept reservation ${reservationId} in terminal status expired`
      )
    }
    if (reservation.status !== 'held' && reservation.status !== 'accepted') {
      throw new ConflictOperationError(
        `Cannot accept reservation ${reservationId} in status ${reservation.status}`
      )
    }
    if (reservation.status === 'held' && new Date(reservation.hold_expires_at).getTime() <= evaluationTime.getTime()) {
      throw new ExpiredReservationOperationError(
        `Reservation hold expired at ${reservation.hold_expires_at}, current time is ${evaluationTime.toISOString()}`
      )
    }

    // 5. Delegate to Phase 5 domain service (atomic acceptance state machine)
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
    if (!client) {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server')
      client = await createServerSupabaseClient()
    }

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

    // 4. Authoritative state guard: reservation must not be expired or in incompatible status
    if (reservation.status === 'expired') {
      throw new ExpiredReservationOperationError(
        `Cannot reject reservation ${reservationId} in status expired`
      )
    }
    if (reservation.status !== 'held' && reservation.status !== 'rejected') {
      throw new ConflictOperationError(
        `Cannot reject reservation ${reservationId} in status ${reservation.status}`
      )
    }

    // 5. Delegate to Phase 5 domain service (atomic rejection & dynamic fallback state machine)
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
