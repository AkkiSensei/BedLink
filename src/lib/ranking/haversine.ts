import { DEFAULT_RANKING_CONFIG } from './config'
import { RankingValidationError } from './errors'

const EARTH_RADIUS_KM = 6371

/**
 * Validates geographical coordinates according to WGS84 bounds.
 */
export function validateCoordinates(lat: number, lon: number, label: string = 'Coordinate'): void {
  if (typeof lat !== 'number' || isNaN(lat) || lat < -90 || lat > 90) {
    throw new RankingValidationError(
      `${label} latitude must be a valid number between -90 and 90. Received: ${lat}`
    )
  }
  if (typeof lon !== 'number' || isNaN(lon) || lon < -180 || lon > 180) {
    throw new RankingValidationError(
      `${label} longitude must be a valid number between -180 and 180. Received: ${lon}`
    )
  }
}

/**
 * Calculates great-circle distance between two points on Earth using the Haversine formula.
 * @returns Distance in kilometers.
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  validateCoordinates(lat1, lon1, 'Source (ambulance)')
  validateCoordinates(lat2, lon2, 'Destination (hospital)')

  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_KM * c
}

/**
 * Calculates deterministic estimated travel time in minutes based on distance and average speed.
 * Formula: (distanceKm / speedKmh) * 60
 * @returns Rounded travel time in minutes.
 */
export function calculateEtaMinutes(
  distanceKm: number,
  speedKmh: number = DEFAULT_RANKING_CONFIG.AVERAGE_AMBULANCE_SPEED_KMH
): number {
  if (typeof distanceKm !== 'number' || isNaN(distanceKm) || distanceKm < 0) {
    throw new RankingValidationError(
      `Distance must be a non-negative number. Received: ${distanceKm}`
    )
  }
  if (typeof speedKmh !== 'number' || isNaN(speedKmh) || speedKmh <= 0) {
    throw new RankingValidationError(
      `Ambulance speed must be a positive number. Received: ${speedKmh}`
    )
  }

  const hours = distanceKm / speedKmh
  return Math.round(hours * 60)
}
