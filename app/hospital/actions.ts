'use server'

import {
  acceptHospitalReservation,
  rejectHospitalReservation,
  getHospitalReservations,
} from '@/lib/operations/hospital'
import { toOperationError } from '@/lib/operations/errors'
import type {
  AcceptHospitalReservationInput,
  RejectHospitalReservationInput,
  HospitalReservationView,
} from '@/lib/operations/types'
import type {
  AcceptReservationResult,
  RejectReservationResult,
} from '@/lib/reservations/types'

export interface AcceptReservationActionResult {
  success: boolean
  result?: AcceptReservationResult
  error?: {
    code: string
    message: string
    status: number
  }
}

export interface RejectReservationActionResult {
  success: boolean
  result?: RejectReservationResult
  error?: {
    code: string
    message: string
    status: number
  }
}

export interface NetworkActiveHoldInfo {
  reservationId: string
  hospitalId: string
  hospitalName: string
  holdExpiresAt: string
  requiredCapabilities?: string[]
  roomNumber?: string
}

export interface RefreshReservationsActionResult {
  success: boolean
  reservations?: HospitalReservationView[]
  networkActiveHold?: NetworkActiveHoldInfo | null
  serverTime?: string
  error?: {
    code: string
    message: string
    status: number
  }
}

/**
 * Server Action: Accepts an active emergency reservation offer on behalf of the hospital.
 * Enforces server-side authority:
 * - Hospital ownership check
 * - 120s hold expiration check
 * - Invariant: Reservation transitions to ACCEPTED, Physical Bed remains HELD (ACCEPTED != OCCUPIED).
 */
export async function acceptHospitalReservationAction(
  input: AcceptHospitalReservationInput
): Promise<AcceptReservationActionResult> {
  try {
    const result = await acceptHospitalReservation({
      reservationId: input.reservationId,
      evaluationTime: input.evaluationTime || new Date(),
    })
    return {
      success: true,
      result,
    }
  } catch (err: any) {
    const opErr = toOperationError(err)
    return {
      success: false,
      error: {
        code: opErr.code,
        message: opErr.message,
        status: opErr.status,
      },
    }
  }
}

/**
 * Server Action: Rejects an active emergency reservation offer on behalf of the hospital.
 * Enforces server-side authority:
 * - Hospital ownership check
 * - Invariant: Reservation transitions to REJECTED, Physical Bed released back to AVAILABLE.
 * - Dynamic fallback re-ranking triggered for BedRequest.
 */
export async function rejectHospitalReservationAction(
  input: RejectHospitalReservationInput
): Promise<RejectReservationActionResult> {
  try {
    const result = await rejectHospitalReservation({
      reservationId: input.reservationId,
      evaluationTime: input.evaluationTime || new Date(),
    })
    return {
      success: true,
      result,
    }
  } catch (err: any) {
    const opErr = toOperationError(err)
    return {
      success: false,
      error: {
        code: opErr.code,
        message: opErr.message,
        status: opErr.status,
      },
    }
  }
}

/**
 * Server Action: Refreshes emergency reservation holds (and optionally history) for the authenticated hospital.
 */
export async function refreshHospitalReservationsAction(options?: {
  targetHospitalId?: string
  includeHistory?: boolean
}): Promise<RefreshReservationsActionResult> {
  try {
    const { createServerSupabaseClient } = await import('@/lib/supabase/server')
    const client = await createServerSupabaseClient()
    try {
      const { ReservationService } = await import('@/lib/reservations/service')
      const reservationService = new ReservationService(client)
      await reservationService.processDueExpiries(new Date(), true)
    } catch {}

    const statuses = options?.includeHistory === false
      ? ['held']
      : ['held', 'accepted', 'rejected', 'expired']
    const reservations = await getHospitalReservations(client, {
      targetHospitalId: options?.targetHospitalId,
      statuses: statuses as any,
    })

    // Discover if there is an active emergency hold assigned to another facility in the network
    let networkActiveHold: NetworkActiveHoldInfo | null = null
    try {
      const activeHospId = options?.targetHospitalId || reservations[0]?.hospital_id
      if (typeof (client as any)?.query === 'function') {
        const netRes = await (client as any).query(
          `SELECT r.id, r.hospital_id, r.hold_expires_at, h.name as hospital_name,
                  br.required_capabilities, b.room_number
           FROM public.reservations r
           JOIN public.hospitals h ON h.id = r.hospital_id
           JOIN public.bed_requests br ON br.id = r.bed_request_id
           LEFT JOIN public.beds b ON b.id = r.bed_id
           WHERE r.status = 'held' AND r.hold_expires_at > now()
           ${activeHospId ? `AND r.hospital_id != $1` : ''}
           ORDER BY r.hold_expires_at ASC
           LIMIT 1;`,
          activeHospId ? [activeHospId] : []
        )
        if (netRes.rows && netRes.rows[0]) {
          networkActiveHold = {
            reservationId: netRes.rows[0].id,
            hospitalId: netRes.rows[0].hospital_id,
            hospitalName: netRes.rows[0].hospital_name,
            holdExpiresAt: netRes.rows[0].hold_expires_at,
            requiredCapabilities: netRes.rows[0].required_capabilities,
            roomNumber: netRes.rows[0].room_number,
          }
        }
      } else if (typeof (client as any)?.from === 'function') {
        let q = (client as any)
          .from('reservations')
          .select('id, hospital_id, hold_expires_at, hospitals(name), bed_requests(required_capabilities), beds(room_number)')
          .eq('status', 'held')
          .gt('hold_expires_at', new Date().toISOString())
        if (activeHospId) {
          q = q.neq('hospital_id', activeHospId)
        }
        const { data: netData } = await q.order('hold_expires_at', { ascending: true }).limit(1)
        if (netData && netData[0]) {
          networkActiveHold = {
            reservationId: netData[0].id,
            hospitalId: netData[0].hospital_id,
            hospitalName: netData[0].hospitals?.name || 'Network Hospital',
            holdExpiresAt: netData[0].hold_expires_at,
            requiredCapabilities: netData[0].bed_requests?.required_capabilities,
            roomNumber: netData[0].beds?.room_number,
          }
        }
      }
    } catch {
      // non-critical discovery
    }

    return {
      success: true,
      reservations,
      networkActiveHold,
      serverTime: new Date().toISOString(),
    }
  } catch (err: any) {
    const opErr = toOperationError(err)
    return {
      success: false,
      error: {
        code: opErr.code,
        message: opErr.message,
        status: opErr.status,
      },
    }
  }
}

export const syncAndExpireDueReservationsAction = refreshHospitalReservationsAction

export interface GetHospitalStatisticsActionResult {
  success: boolean
  data?: import('@/lib/operations/types').HospitalStatisticsData
  error?: {
    code: string
    message: string
    status: number
  }
}

/**
 * Server Action: Retrieves comprehensive statistics, development recommendations,
 * and historical attendance ledger for hospital operations.
 */
export async function getHospitalStatisticsAction(options?: {
  targetHospitalId?: string
  timeFilter?: import('@/lib/operations/types').StatisticsTimeFilter
}): Promise<GetHospitalStatisticsActionResult> {
  try {
    const { getHospitalStatistics } = await import('@/lib/operations/hospital')
    const { createServerSupabaseClient } = await import('@/lib/supabase/server')
    const client = await createServerSupabaseClient()
    const data = await getHospitalStatistics(client, options)
    return {
      success: true,
      data,
    }
  } catch (err: any) {
    const opErr = toOperationError(err)
    return {
      success: false,
      error: {
        code: opErr.code,
        message: opErr.message,
        status: opErr.status,
      },
    }
  }
}

