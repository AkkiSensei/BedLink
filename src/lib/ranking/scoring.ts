import type { RankingConfig, ScoreBreakdown } from './types'
import { DEFAULT_RANKING_CONFIG } from './config'

/**
 * Calculates travel component score.
 * Formula: max(0, MAX_TRAVEL_SCORE - estimatedTravelTimeMinutes)
 * Maximum = 60 points. If ETA >= 60, score = 0.
 */
export function calculateTravelComponent(
  estimatedTravelTimeMinutes: number,
  config: RankingConfig = DEFAULT_RANKING_CONFIG
): number {
  if (estimatedTravelTimeMinutes < 0) {
    return config.MAX_TRAVEL_SCORE
  }
  return Math.max(0, config.MAX_TRAVEL_SCORE - estimatedTravelTimeMinutes)
}

/**
 * Calculates freshness component score based on bed data age tiers:
 * - age < 30s  -> 30 points
 * - 30 <= age < 60s -> 20 points
 * - 60 <= age < 120s -> 10 points
 * - age >= 120s -> 0 points
 * - Missing/unknown -> 0 points
 */
export function calculateFreshnessComponent(
  freshnessAgeSeconds: number | null | undefined,
  config: RankingConfig = DEFAULT_RANKING_CONFIG
): number {
  if (
    freshnessAgeSeconds === null ||
    freshnessAgeSeconds === undefined ||
    isNaN(freshnessAgeSeconds)
  ) {
    return config.FRESHNESS_STALE_POINTS
  }

  const age = Math.max(0, freshnessAgeSeconds)

  for (const tier of config.FRESHNESS_TIERS) {
    if (age < tier.maxAgeSeconds) {
      return tier.points
    }
  }

  return config.FRESHNESS_STALE_POINTS
}

/**
 * Calculates current load penalty.
 * Formula: (currentLoadPercent / 100) * MAX_LOAD_PENALTY
 * Maximum penalty = 50 points (at 100% load).
 */
export function calculateLoadPenalty(
  currentLoadPercent: number,
  config: RankingConfig = DEFAULT_RANKING_CONFIG
): number {
  const clampedLoad = Math.min(100, Math.max(0, currentLoadPercent))
  const penalty = (clampedLoad * config.MAX_LOAD_PENALTY) / 100
  return Math.round(penalty * 100) / 100
}

/**
 * Calculates the overall hospital candidate score.
 * Formula: TravelComponent + FreshnessComponent - LoadPenalty
 * Theoretical range: -50 to +90.
 */
export function calculateFinalScore(
  travelComponent: number,
  freshnessComponent: number,
  loadPenalty: number
): number {
  const rawScore = travelComponent + freshnessComponent - loadPenalty
  return Math.round(rawScore * 100) / 100
}

/**
 * Generates the full breakdown of numeric components for dispatch transparency.
 */
export function computeScoreBreakdown(
  estimatedTravelTimeMinutes: number,
  freshnessAgeSeconds: number | null,
  currentLoadPercent: number,
  config: RankingConfig = DEFAULT_RANKING_CONFIG
): ScoreBreakdown {
  const travel_component = calculateTravelComponent(
    estimatedTravelTimeMinutes,
    config
  )
  const freshness_component = calculateFreshnessComponent(
    freshnessAgeSeconds,
    config
  )
  const load_penalty = calculateLoadPenalty(currentLoadPercent, config)

  return {
    bed_match: true,
    estimated_travel_time_minutes: estimatedTravelTimeMinutes,
    bed_data_freshness_seconds: freshnessAgeSeconds,
    current_load_percent: currentLoadPercent,
    travel_component,
    freshness_component,
    load_penalty,
  }
}
