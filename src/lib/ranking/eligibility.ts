import type {
  Hospital,
  Bed,
  BedCapability,
  ExclusionReason,
} from './types'
import { RankingValidationError } from './errors'

/**
 * Validates that the requested capabilities array is non-empty and well-formed.
 */
export function validateRequiredCapabilities(
  requiredCapabilities: BedCapability[]
): void {
  if (
    !Array.isArray(requiredCapabilities) ||
    requiredCapabilities.length === 0
  ) {
    throw new RankingValidationError(
      'BedRequest required_capabilities must be a non-empty array of capabilities'
    )
  }
}

/**
 * Checks whether a single bed matches all requested capabilities and is available.
 */
export function isBedMatching(
  bed: Bed,
  requiredCapabilities: BedCapability[]
): boolean {
  if (bed.status !== 'available') {
    return false
  }
  if (!Array.isArray(bed.capabilities)) {
    return false
  }
  return requiredCapabilities.every((cap) => bed.capabilities.includes(cap))
}

export interface EligibilityEvaluation {
  isEligible: boolean
  exclusionReason?: ExclusionReason
  matchedBed?: Bed
  freshnessAgeSeconds?: number | null
}

/**
 * Evaluates whether a hospital passes the hard BedLink eligibility gate,
 * and if so, identifies the freshest available matching bed.
 */
export function evaluateHospitalEligibility(
  hospital: Hospital,
  beds: Bed[],
  requiredCapabilities: BedCapability[],
  attemptedHospitals: string[] = [],
  referenceTime: Date = new Date()
): EligibilityEvaluation {
  validateRequiredCapabilities(requiredCapabilities)

  // 1. Operational status gate
  if (hospital.operational_status !== 'operational') {
    return {
      isEligible: false,
      exclusionReason: 'non_operational',
    }
  }

  // 2. Not already attempted gate
  if (attemptedHospitals.includes(hospital.id)) {
    return {
      isEligible: false,
      exclusionReason: 'already_attempted',
    }
  }

  // Filter beds belonging to this hospital
  const hospitalBeds = beds.filter((b) => b.hospital_id === hospital.id)

  // Filter matching available beds
  const matchingAvailableBeds = hospitalBeds.filter((b) =>
    isBedMatching(b, requiredCapabilities)
  )

  if (matchingAvailableBeds.length === 0) {
    return {
      isEligible: false,
      exclusionReason: 'no_matching_available_bed',
    }
  }

  // 3. Find the freshest available matching bed
  const refTimeMs = referenceTime.getTime()
  let freshestBed: Bed = matchingAvailableBeds[0]
  let freshestAgeSeconds: number | null = null

  for (const bed of matchingAvailableBeds) {
    let bedAgeSeconds: number | null = null

    if (bed.last_updated_at) {
      const bedTimeMs = new Date(bed.last_updated_at).getTime()
      if (!isNaN(bedTimeMs)) {
        // Prevent negative age due to sub-second clock drift
        bedAgeSeconds = Math.max(0, Math.floor((refTimeMs - bedTimeMs) / 1000))
      }
    }

    if (freshestAgeSeconds === null) {
      freshestBed = bed
      freshestAgeSeconds = bedAgeSeconds
    } else if (
      bedAgeSeconds !== null &&
      bedAgeSeconds < freshestAgeSeconds
    ) {
      freshestBed = bed
      freshestAgeSeconds = bedAgeSeconds
    }
  }

  return {
    isEligible: true,
    matchedBed: freshestBed,
    freshnessAgeSeconds: freshestAgeSeconds,
  }
}
