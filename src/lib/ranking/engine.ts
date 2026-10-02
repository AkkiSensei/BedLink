import type {
  RankedHospitalCandidate,
  RankingResult,
  RankHospitalsParams,
  RankCandidateInputsParams,
  ExcludedHospital,
  RankingConfig,
} from './types'
import { DEFAULT_RANKING_CONFIG } from './config'
import { RankingValidationError } from './errors'
import {
  validateCoordinates,
  haversineDistanceKm,
  calculateEtaMinutes,
} from './haversine'
import {
  validateRequiredCapabilities,
  evaluateHospitalEligibility,
} from './eligibility'
import {
  computeScoreBreakdown,
  calculateFinalScore,
} from './scoring'
import { sortCandidatesDeterministically } from './sorter'

/**
 * Pure, deterministic ranking engine for BedLink hospitals.
 * Evaluates candidates using:
 * 1. Hard Eligibility Gate (operational status, not attempted, available matching bed)
 * 2. Numeric Scoring (Travel Component + Freshness Component - Load Penalty)
 * 3. Deterministic Sorting (Score DESC, ETA ASC, Freshness ASC, Load ASC, Hospital ID ASC)
 */
export function rankHospitalCandidates(
  params: RankCandidateInputsParams
): RankingResult {
  const { request, candidates, config: userConfig, referenceTime } = params
  const config: RankingConfig = { ...DEFAULT_RANKING_CONFIG, ...userConfig }

  // 1. Validate request inputs
  validateRequiredCapabilities(request.required_capabilities)
  validateCoordinates(
    request.ambulance_latitude,
    request.ambulance_longitude,
    'Ambulance'
  )

  const refDate =
    referenceTime instanceof Date
      ? referenceTime
      : referenceTime
      ? new Date(referenceTime)
      : new Date()

  // 2. Check for duplicate hospital records in the candidate input
  const seenHospitalIds = new Set<string>()
  for (const candidate of candidates) {
    if (seenHospitalIds.has(candidate.hospital.id)) {
      throw new RankingValidationError(
        `Duplicate hospital record detected for hospital ID '${candidate.hospital.id}' (${candidate.hospital.name}). Data inconsistency must be resolved.`
      )
    }
    seenHospitalIds.add(candidate.hospital.id)
  }

  const evaluatedCandidates: RankedHospitalCandidate[] = []
  const excludedHospitals: ExcludedHospital[] = []

  const attemptedHospitals = request.attempted_hospitals ?? []

  // 3. Evaluate each hospital
  for (const item of candidates) {
    const { hospital, beds, etaMinutes: explicitEta, distanceKm: explicitDistance } = item

    // Validate hospital coordinates
    validateCoordinates(hospital.latitude, hospital.longitude, `Hospital '${hospital.name}'`)

    // Evaluate hard eligibility gate
    const evaluation = evaluateHospitalEligibility(
      hospital,
      beds,
      request.required_capabilities,
      attemptedHospitals,
      refDate
    )

    if (!evaluation.isEligible) {
      excludedHospitals.push({
        hospital_id: hospital.id,
        hospital_name: hospital.name,
        reason: evaluation.exclusionReason ?? 'no_matching_available_bed',
      })
      continue
    }

    // Determine travel time (ETA in minutes)
    let etaMinutes: number
    if (explicitEta !== undefined) {
      if (typeof explicitEta !== 'number' || isNaN(explicitEta) || explicitEta < 0) {
        throw new RankingValidationError(
          `Explicit ETA for hospital '${hospital.name}' must be a non-negative number. Received: ${explicitEta}`
        )
      }
      etaMinutes = Math.round(explicitEta)
    } else {
      const distanceKm =
        explicitDistance !== undefined
          ? explicitDistance
          : haversineDistanceKm(
              request.ambulance_latitude,
              request.ambulance_longitude,
              hospital.latitude,
              hospital.longitude
            )
      etaMinutes = calculateEtaMinutes(distanceKm, config.AVERAGE_AMBULANCE_SPEED_KMH)
    }

    const freshnessAgeSeconds = evaluation.freshnessAgeSeconds ?? null
    const currentLoadPercent = hospital.current_load_percent

    // Compute score breakdown components
    const breakdown = computeScoreBreakdown(
      etaMinutes,
      freshnessAgeSeconds,
      currentLoadPercent,
      config
    )

    const score = calculateFinalScore(
      breakdown.travel_component,
      breakdown.freshness_component,
      breakdown.load_penalty
    )

    evaluatedCandidates.push({
      hospital_id: hospital.id,
      hospital_name: hospital.name,
      score,
      bed_match: true,
      estimated_travel_time_minutes: etaMinutes,
      bed_data_freshness_seconds: freshnessAgeSeconds,
      current_load_percent: currentLoadPercent,
      travel_component: breakdown.travel_component,
      freshness_component: breakdown.freshness_component,
      load_penalty: breakdown.load_penalty,
      breakdown,
      matched_bed_id: evaluation.matchedBed?.id,
    })
  }

  // 4. Deterministic sorting
  const sortedCandidates = sortCandidatesDeterministically(evaluatedCandidates)

  return {
    request_id: request.id,
    candidates: sortedCandidates,
    total_hospitals_evaluated: candidates.length,
    eligible_hospitals_count: sortedCandidates.length,
    excluded_hospitals: excludedHospitals,
    timestamp: refDate.toISOString(),
  }
}

/**
 * Standard entrypoint that accepts raw hospital and bed lists,
 * maps them to candidate inputs, and executes the ranking engine.
 */
export function rankHospitals(params: RankHospitalsParams): RankingResult {
  const { request, hospitals, beds, referenceTime, config } = params

  const candidateInputs = hospitals.map((hospital) => ({
    hospital,
    beds: beds.filter((b) => b.hospital_id === hospital.id),
  }))

  return rankHospitalCandidates({
    request,
    candidates: candidateInputs,
    referenceTime,
    config,
  })
}
