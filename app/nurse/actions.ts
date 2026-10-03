'use server'

import {
  updateNurseBed,
  getNurseBeds,
  confirmNurseInventory,
  admitEmsPatient,
  dischargeEmsPatient,
} from '@/lib/operations/nurse'
import { toOperationError } from '@/lib/operations/errors'
import type {
  NurseBedView,
  AdmitEmsPatientInput,
  AdmitEmsPatientResult,
  DischargeEmsPatientInput,
  DischargeEmsPatientResult,
} from '@/lib/operations/types'
import type { BedStatus } from '@/lib/types/database'

export interface UpdateBedActionResult {
  success: boolean
  bed?: NurseBedView
  error?: {
    code: string
    message: string
    status: number
  }
}

export interface RefreshBedsActionResult {
  success: boolean
  beds?: NurseBedView[]
  error?: {
    code: string
    message: string
    status: number
  }
}

export interface ConfirmInventoryActionResult {
  success: boolean
  confirmedAt?: string
  message?: string
  error?: {
    code: string
    message: string
    status: number
  }
}

/**
 * Server Action: Fast operational status update for a nurse's hospital bed.
 * Delegates to the Phase 6 updateNurseBed operation.
 */
export async function updateBedStatusAction(
  bedId: string,
  newStatus: BedStatus
): Promise<UpdateBedActionResult> {
  try {
    const updatedBed = await updateNurseBed({
      bedId,
      status: newStatus,
    })

    return {
      success: true,
      bed: updatedBed,
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
 * Server Action: Refreshes the bed inventory for the authenticated nurse.
 * Delegates to the Phase 6 getNurseBeds operation.
 */
export async function refreshNurseBedsAction(
  options?: { targetHospitalId?: string }
): Promise<RefreshBedsActionResult> {
  try {
    const beds = await getNurseBeds(undefined, options)
    return {
      success: true,
      beds,
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
 * Server Action: Explicitly confirms that displayed hospital bed inventory is accurate.
 * Delegates to confirmNurseInventory operation.
 */
export async function confirmNurseInventoryAction(): Promise<ConfirmInventoryActionResult> {
  try {
    const result = await confirmNurseInventory()
    return {
      success: true,
      confirmedAt: result.confirmed_at,
      message: result.message,
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

export interface AdmitEmsPatientActionResult {
  success: boolean
  result?: AdmitEmsPatientResult
  error?: {
    code: string
    message: string
    status: number
  }
}

/**
 * Server Action: Admits an incoming EMS-reserved patient.
 * Transitions EMS reservation -> ADMITTED -> OCCUPIED.
 */
export async function admitEmsPatientAction(
  input: AdmitEmsPatientInput
): Promise<AdmitEmsPatientActionResult> {
  try {
    const result = await admitEmsPatient(input)
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

export interface DischargeEmsPatientActionResult {
  success: boolean
  result?: DischargeEmsPatientResult
  error?: {
    code: string
    message: string
    status: number
  }
}

/**
 * Server Action: The Nurse discharges an EMS-admitted patient.
 * Transitions OCCUPIED -> AVAILABLE.
 * Persists discharge timestamp, reservation association, and authoritative bed status.
 */
export async function dischargeEmsPatientAction(
  input: DischargeEmsPatientInput
): Promise<DischargeEmsPatientActionResult> {
  try {
    const result = await dischargeEmsPatient(input)
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

