import type {
  BedRequest,
  Reservation,
  Hospital,
  Bed,
  ReservationStatus,
  BedRequestStatus,
  BedStatus,
} from '@/lib/types/database'

export type {
  BedRequest,
  Reservation,
  Hospital,
  Bed,
  ReservationStatus,
  BedRequestStatus,
  BedStatus,
}

export interface HoldReservationParams {
  bedRequestId: string
  hospitalId: string
  bedId: string
  attemptNumber: number
  holdDurationSeconds?: number
  evaluationTime: Date | string | number
}

export interface HoldReservationResult {
  success: boolean
  reservation_id: string
  bed_request_id: string
  hospital_id: string
  bed_id: string
  status: 'held'
  attempt_number: number
  hold_expires_at: string
}

export interface AcceptReservationParams {
  reservationId: string
  evaluationTime: Date | string | number
}

export interface AcceptReservationResult {
  success: boolean
  status: 'accepted'
  reservation_id: string
  bed_request_id: string
  hospital_id: string
  bed_id: string
  idempotent?: boolean
}

export interface RejectReservationParams {
  reservationId: string
  evaluationTime: Date | string | number
  autoFallback?: boolean
}

export interface RejectReservationResult {
  success: boolean
  status: 'rejected'
  reservation_id: string
  bed_request_id: string
  rejected_hospital_id: string
  released_bed_id: string
  attempt_number: number
  idempotent?: boolean
  fallbackReservation?: HoldReservationResult | null
  noCandidatesRemaining?: boolean
}

export interface ExpireReservationParams {
  reservationId: string
  evaluationTime: Date | string | number
  autoFallback?: boolean
}

export interface ExpireReservationResult {
  success: boolean
  status: 'expired'
  reservation_id: string
  bed_request_id: string
  expired_hospital_id: string
  released_bed_id: string
  attempt_number: number
  idempotent?: boolean
  fallbackReservation?: HoldReservationResult | null
  noCandidatesRemaining?: boolean
}

export interface FallbackParams {
  bedRequestId: string
  evaluationTime: Date | string | number
}

export interface FallbackResult {
  hasCandidate: boolean
  reservation?: HoldReservationResult
  bedRequestId: string
  reason?: string
}

export interface ExpiryJobResult {
  checked_at: string
  processed_count: number
  expired_reservations: ExpireReservationResult[]
  errors: { reservationId: string; error: string }[]
}
