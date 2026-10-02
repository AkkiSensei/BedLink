import type { BedCapability, BedStatus } from '@/lib/types/database'
import { ValidationOperationError } from './errors'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const VALID_CAPABILITIES: readonly BedCapability[] = [
  'general',
  'oxygen',
  'icu',
  'ventilator',
]

const VALID_BED_STATUSES: readonly BedStatus[] = [
  'available',
  'held',
  'occupied',
  'maintenance',
]

/**
 * Validates that a string is a well-formed UUID v1-v5.
 */
export function validateUUID(value: unknown, fieldName: string = 'id'): string {
  if (typeof value !== 'string' || !UUID_REGEX.test(value.trim())) {
    throw new ValidationOperationError(
      `${fieldName} must be a valid UUID. Received: ${String(value)}`
    )
  }
  return value.trim()
}

/**
 * Validates coordinates according to WGS84 standard bounds.
 */
export function validateCoordinates(
  lat: unknown,
  lon: unknown,
  context: string = 'Ambulance'
): { latitude: number; longitude: number } {
  const nLat = typeof lat === 'number' ? lat : Number(lat)
  const nLon = typeof lon === 'number' ? lon : Number(lon)

  if (
    lat === null ||
    lat === undefined ||
    typeof lat === 'boolean' ||
    typeof nLat !== 'number' ||
    isNaN(nLat) ||
    !isFinite(nLat) ||
    nLat < -90 ||
    nLat > 90
  ) {
    throw new ValidationOperationError(
      `${context} latitude must be a valid number between -90 and 90. Received: ${String(lat)}`
    )
  }

  if (
    lon === null ||
    lon === undefined ||
    typeof lon === 'boolean' ||
    typeof nLon !== 'number' ||
    isNaN(nLon) ||
    !isFinite(nLon) ||
    nLon < -180 ||
    nLon > 180
  ) {
    throw new ValidationOperationError(
      `${context} longitude must be a valid number between -180 and 180. Received: ${String(lon)}`
    )
  }

  // Safeguard against uninitialized default (0, 0) GPS coordinates
  if (Math.abs(nLat) < 0.00001 && Math.abs(nLon) < 0.00001) {
    throw new ValidationOperationError(
      `${context} coordinates (0, 0) indicate uninitialized default GPS telemetry. Real emergency coordinates are required.`
    )
  }

  return { latitude: nLat, longitude: nLon }
}

/**
 * Validates that capabilities is a non-empty array of valid BedCapability strings without duplicates.
 */
export function validateCapabilities(
  caps: unknown,
  fieldName: string = 'required_capabilities'
): BedCapability[] {
  if (!Array.isArray(caps) || caps.length === 0) {
    throw new ValidationOperationError(
      `${fieldName} must be a non-empty array of bed capabilities.`
    )
  }

  const seen = new Set<BedCapability>()
  for (const c of caps) {
    if (typeof c !== 'string' || !VALID_CAPABILITIES.includes(c as BedCapability)) {
      throw new ValidationOperationError(
        `Invalid capability '${String(c)}' in ${fieldName}. Allowed values: ${VALID_CAPABILITIES.join(', ')}`
      )
    }
    seen.add(c as BedCapability)
  }

  return Array.from(seen)
}

/**
 * Validates that status is one of the valid BedStatus values.
 */
export function validateBedStatus(status: unknown, fieldName: string = 'status'): BedStatus {
  if (typeof status !== 'string' || !VALID_BED_STATUSES.includes(status as BedStatus)) {
    throw new ValidationOperationError(
      `Invalid ${fieldName} '${String(status)}'. Allowed values: ${VALID_BED_STATUSES.join(', ')}`
    )
  }
  return status as BedStatus
}

/**
 * Validates an optional ambulance contact phone number.
 * Enforces emergency contact standards: requires between 7 and 15 digits (ITU-T E.164).
 */
export function validateAmbulancePhone(phone: unknown): string | null {
  if (phone === null || phone === undefined || phone === '') {
    return null
  }

  if (typeof phone !== 'string') {
    throw new ValidationOperationError('Ambulance phone must be a string')
  }

  const trimmed = phone.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.length < 7 || trimmed.length > 30) {
    throw new ValidationOperationError('Ambulance phone length must be between 7 and 30 characters')
  }

  // Permitted phone characters: digits, leading +, hyphens, spaces, parentheses
  const PHONE_REGEX = /^\+?[0-9()\- ]+$/
  if (!PHONE_REGEX.test(trimmed)) {
    throw new ValidationOperationError(
      'Ambulance phone contains invalid characters. Only numbers, +, -, (), and spaces are permitted.'
    )
  }

  // Count raw digits to ensure it contains a genuine phone number
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) {
    throw new ValidationOperationError(
      `Ambulance phone must contain between 7 and 15 digits according to emergency communication standards. Received ${digits.length} digits.`
    )
  }

  return trimmed
}

/**
 * Validates an optional room number string.
 */
export function validateRoomNumber(roomNumber: unknown): string | null {
  if (roomNumber === null || roomNumber === undefined) {
    return null
  }
  if (typeof roomNumber !== 'string') {
    throw new ValidationOperationError('Room number must be a string')
  }
  const trimmed = roomNumber.trim()
  if (trimmed.length > 50) {
    throw new ValidationOperationError('Room number cannot exceed 50 characters')
  }
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Parses and validates an optional or required evaluation timestamp.
 */
export function validateEvaluationTime(
  time: unknown,
  fieldName: string = 'evaluationTime'
): Date {
  if (time === null || time === undefined) {
    return new Date()
  }

  const d = time instanceof Date ? time : new Date(time as any)
  if (isNaN(d.getTime())) {
    throw new ValidationOperationError(
      `${fieldName} must be a valid date or timestamp. Received: ${String(time)}`
    )
  }

  return d
}
