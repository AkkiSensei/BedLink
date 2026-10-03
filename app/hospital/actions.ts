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

export interface RefreshReservationsActionResult {
  success: boolean
  reservations?: HospitalReservationView[]
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
  } catch (err: unknown) {
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
  } catch (err: unknown) {
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

    const statuses = options?.includeHistory
      ? ['held', 'accepted', 'rejected', 'expired']
      : ['held']
    const reservations = await getHospitalReservations(client, {
      targetHospitalId: options?.targetHospitalId,
      statuses: statuses as any,
    })
    return {
      success: true,
      reservations,
      serverTime: new Date().toISOString(),
    }
  } catch (err: unknown) {
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

