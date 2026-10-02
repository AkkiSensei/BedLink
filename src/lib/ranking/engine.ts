import type {
  RankedHospitalCandidate,
  RankingResult,
  RankHospitalsParams,
  RankCandidateInputsParams,
  ExcludedHospital,
  RankingConfig,
  BedRequest,
  Hospital,
  Bed,
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
  const { request, candidates, config: userConfig, evaluationTime } = params
  const config: RankingConfig = { ...DEFAULT_RANKING_CONFIG, ...userConfig }

  // 1. Validate evaluationTime is explicitly provided
  if (evaluationTime === undefined || evaluationTime === null) {
    throw new RankingValidationError(
      'evaluationTime is required for deterministic hospital ranking'
    )
  }

  const evalDate =
    evaluationTime instanceof Date
      ? evaluationTime
      : new Date(evaluationTime)

  if (isNaN(evalDate.getTime())) {
    throw new RankingValidationError(
      `evaluationTime must be a valid Date, ISO string, or timestamp. Received: ${evaluationTime}`
    )
  }

  // 2. Validate request inputs
  validateRequiredCapabilities(request.required_capabilities)
  validateCoordinates(
    request.ambulance_latitude,
    request.ambulance_longitude,
    'Ambulance'
  )

  // 3. Check for duplicate hospital records in the candidate input
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
      evalDate
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
    timestamp: evalDate.toISOString(),
  }
}

/**
 * Standard entrypoint that accepts raw hospital and bed lists,
 * maps them to candidate inputs, and executes the ranking engine.
 *
 * evaluationTime is a REQUIRED parameter for deterministic ranking.
 */
export function rankHospitals(
  request: Pick<
    BedRequest,
    'required_capabilities' | 'ambulance_latitude' | 'ambulance_longitude'
  > & {
    id?: string
    attempted_hospitals?: string[]
  },
  hospitals: Hospital[],
  beds: Bed[],
  evaluationTime: Date | string | number,
  config?: Partial<RankingConfig>
): RankingResult
export function rankHospitals(params: RankHospitalsParams): RankingResult
export function rankHospitals(
  requestOrParams:
    | (Pick<
        BedRequest,
        'required_capabilities' | 'ambulance_latitude' | 'ambulance_longitude'
      > & {
        id?: string
        attempted_hospitals?: string[]
      })
    | RankHospitalsParams,
  hospitalsArg?: Hospital[],
  bedsArg?: Bed[],
  evaluationTimeArg?: Date | string | number,
  configArg?: Partial<RankingConfig>
): RankingResult {
  let request: any
  let hospitals: Hospital[]
  let beds: Bed[]
  let evaluationTime: Date | string | number
  let config: Partial<RankingConfig> | undefined

  if ('hospitals' in requestOrParams) {
    request = requestOrParams.request
    hospitals = requestOrParams.hospitals
    beds = requestOrParams.beds
    evaluationTime = requestOrParams.evaluationTime
    config = requestOrParams.config
  } else {
    request = requestOrParams
    hospitals = hospitalsArg!
    beds = bedsArg!
    evaluationTime = evaluationTimeArg!
    config = configArg
  }

  const candidateInputs = hospitals.map((hospital) => ({
    hospital,
    beds: beds.filter((b) => b.hospital_id === hospital.id),
  }))

  return rankHospitalCandidates({
    request,
    candidates: candidateInputs,
    evaluationTime,
    config,
  })
}
