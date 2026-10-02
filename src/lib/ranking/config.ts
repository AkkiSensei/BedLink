import type { RankingConfig } from './types'

export const DEFAULT_RANKING_CONFIG: RankingConfig = {
  AVERAGE_AMBULANCE_SPEED_KMH: 40,
  MAX_TRAVEL_SCORE: 60,
  FRESHNESS_TIERS: [
    { maxAgeSeconds: 30, points: 30 },
    { maxAgeSeconds: 60, points: 20 },
    { maxAgeSeconds: 120, points: 10 },
  ],
  FRESHNESS_STALE_POINTS: 0,
  MAX_LOAD_PENALTY: 50,
} as const
