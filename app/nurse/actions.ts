'use server'

import { updateNurseBed, getNurseBeds } from '@/lib/operations/nurse'
import { toOperationError } from '@/lib/operations/errors'
import type { NurseBedView } from '@/lib/operations/types'
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
 * Server Action: Refreshes the bed inventory for the authenticated nurse.
 * Delegates to the Phase 6 getNurseBeds operation.
 */
export async function refreshNurseBedsAction(): Promise<RefreshBedsActionResult> {
  try {
    const beds = await getNurseBeds()
    return {
      success: true,
      beds,
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
