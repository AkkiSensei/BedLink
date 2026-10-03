'use server'

import {
  createDispatchBedRequest,
  getDispatchBedRequest,
  listDispatchBedRequests,
  getDispatchRankedCandidates,
  selectDispatchHospital,
} from '@/lib/operations/dispatch'
import { toOperationError } from '@/lib/operations/errors'
import type {
  CreateBedRequestInput,
  DispatchBedRequestView,
  DispatchRankedCandidateView,
} from '@/lib/operations/types'

export interface CreateRequestActionResult {
  success: boolean
  request?: DispatchBedRequestView
  error?: {
    code: string
    message: string
    status: number
  }
}

export interface ListRequestsActionResult {
  success: boolean
  requests?: DispatchBedRequestView[]
  error?: {
    code: string
    message: string
    status: number
  }
}

export interface GetRequestActionResult {
  success: boolean
  request?: DispatchBedRequestView
  error?: {
    code: string
    message: string
    status: number
  }
}

/**
 * Server Action: Creates an emergency BedRequest on behalf of the authenticated Dispatch user.
 * Authoritative ranking and reservation hold are triggered server-side.
 */
export async function createEmergencyRequestAction(
  input: CreateBedRequestInput
): Promise<CreateRequestActionResult> {
  try {
    const request = await createDispatchBedRequest(input)
    return {
      success: true,
      request,
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
 * Server Action: Fetches all BedRequests created by the authenticated Dispatcher (or all for Admin).
 */
export async function fetchDispatchRequestsAction(): Promise<ListRequestsActionResult> {
  try {
    const { createServerSupabaseClient } = await import('@/lib/supabase/server')
    const client = await createServerSupabaseClient()
    try {
      const { ReservationService } = await import('@/lib/reservations/service')
      const reservationService = new ReservationService(client)
      await reservationService.processDueExpiries(new Date(), true)
    } catch {}

    const requests = await listDispatchBedRequests(client)
    return {
      success: true,
      requests,
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

export const refreshRequestsAction = fetchDispatchRequestsAction

/**
 * Server Action: Fetches a single BedRequest and its current active reservation.
 */
export async function fetchDispatchBedRequestAction(
  bedRequestId: string
): Promise<GetRequestActionResult> {
  try {
    const request = await getDispatchBedRequest(bedRequestId)
    return {
      success: true,
      request,
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

export interface RankedCandidatesActionResult {
  success: boolean
  candidates?: DispatchRankedCandidateView[]
  error?: {
    code: string
    message: string
    status: number
  }
}

/**
 * Server Action: Fetches authoritative ranked hospital candidates for a BedRequest.
 */
export async function fetchRankedCandidatesAction(
  bedRequestId: string
): Promise<RankedCandidatesActionResult> {
  try {
    const candidates = await getDispatchRankedCandidates(bedRequestId)
    return {
      success: true,
      candidates,
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

export interface SelectHospitalActionResult {
  success: boolean
  request?: DispatchBedRequestView
  error?: {
    code: string
    message: string
    status: number
  }
}

/**
 * Server Action: Selects an eligible hospital for a BedRequest, creating an active HELD reservation.
 */
export async function selectHospitalAction(
  bedRequestId: string,
  hospitalId: string
): Promise<SelectHospitalActionResult> {
  try {
    const request = await selectDispatchHospital({ bedRequestId, hospitalId })
    return {
      success: true,
      request,
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

