import type {
  Hospital,
  Bed,
  BedCapability,
  BedRequest,
} from '@/lib/types/database'

export type {
  Hospital,
  Bed,
  BedCapability,
  BedRequest,
}

export interface RankingConfig {
  AVERAGE_AMBULANCE_SPEED_KMH: number
  MAX_TRAVEL_SCORE: number
  FRESHNESS_TIERS: readonly {
    maxAgeSeconds: number
    points: number
  }[]
  FRESHNESS_STALE_POINTS: number
  MAX_LOAD_PENALTY: number
}

export interface ScoreBreakdown {
  bed_match: boolean
  estimated_travel_time_minutes: number
  bed_data_freshness_seconds: number | null
  current_load_percent: number
  travel_component: number
  freshness_component: number
  load_penalty: number
}

export interface RankedHospitalCandidate {
  hospital_id: string
  hospital_name: string
  score: number
  bed_match: boolean
  estimated_travel_time_minutes: number
  bed_data_freshness_seconds: number | null
  current_load_percent: number
  travel_component: number
  freshness_component: number
  load_penalty: number
  breakdown: ScoreBreakdown
  matched_bed_id?: string
}

export type ExclusionReason =
  | 'non_operational'
  | 'already_attempted'
  | 'no_matching_available_bed'
  | 'invalid_coordinates'

export interface ExcludedHospital {
  hospital_id: string
  hospital_name: string
  reason: ExclusionReason
}

export interface RankingResult {
  request_id?: string
  candidates: RankedHospitalCandidate[]
  total_hospitals_evaluated: number
  eligible_hospitals_count: number
  excluded_hospitals: ExcludedHospital[]
  timestamp: string
}

export interface HospitalCandidateInput {
  hospital: Hospital
  beds: Bed[]
  distanceKm?: number
  etaMinutes?: number
}

export interface RankHospitalsParams {
  request: Pick<
    BedRequest,
    'required_capabilities' | 'ambulance_latitude' | 'ambulance_longitude'
  > & {
    id?: string
    attempted_hospitals?: string[]
  }
  hospitals: Hospital[]
  beds: Bed[]
  evaluationTime: Date | string | number
  config?: Partial<RankingConfig>
}

export interface RankCandidateInputsParams {
  request: Pick<
    BedRequest,
    'required_capabilities' | 'ambulance_latitude' | 'ambulance_longitude'
  > & {
    id?: string
    attempted_hospitals?: string[]
  }
  candidates: HospitalCandidateInput[]
  evaluationTime: Date | string | number
  config?: Partial<RankingConfig>
}
