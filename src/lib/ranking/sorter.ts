import type { RankedHospitalCandidate } from './types'

/**
 * Deterministic candidate comparison function adhering to the locked ranking priority:
 * 1. score DESC (higher score wins)
 * 2. estimated_travel_time_minutes ASC (shorter ETA wins)
 * 3. freshness_age_seconds ASC (fresher/smaller age wins; missing/unknown placed last)
 * 4. current_load_percent ASC (lower load wins)
 * 5. hospital_id ASC (lexicographical tie-breaker)
 */
export function compareCandidates(
  a: RankedHospitalCandidate,
  b: RankedHospitalCandidate
): number {
  // 1. score DESC
  if (b.score !== a.score) {
    return b.score - a.score
  }

  // 2. estimated_travel_time_minutes ASC
  if (a.estimated_travel_time_minutes !== b.estimated_travel_time_minutes) {
    return a.estimated_travel_time_minutes - b.estimated_travel_time_minutes
  }

  // 3. freshness_age_seconds ASC
  const ageA =
    a.bed_data_freshness_seconds === null ||
    a.bed_data_freshness_seconds === undefined
      ? Number.POSITIVE_INFINITY
      : a.bed_data_freshness_seconds
  const ageB =
    b.bed_data_freshness_seconds === null ||
    b.bed_data_freshness_seconds === undefined
      ? Number.POSITIVE_INFINITY
      : b.bed_data_freshness_seconds

  if (ageA !== ageB) {
    return ageA - ageB
  }

  // 4. current_load_percent ASC
  if (a.current_load_percent !== b.current_load_percent) {
    return a.current_load_percent - b.current_load_percent
  }

  // 5. hospital_id ASC
  return a.hospital_id.localeCompare(b.hospital_id)
}

/**
 * Deterministically sorts an array of candidates in place and returns it.
 */
export function sortCandidatesDeterministically(
  candidates: RankedHospitalCandidate[]
): RankedHospitalCandidate[] {
  return [...candidates].sort(compareCandidates)
}
