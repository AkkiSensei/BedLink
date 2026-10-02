import { holdReservation, acceptReservation, rejectReservation } from './transitions'
import { executeReservationFallback } from './fallback'
import { expireReservation, processExpiredReservations } from './expiry'
import type {
  HoldReservationParams,
  HoldReservationResult,
  AcceptReservationParams,
  AcceptReservationResult,
  RejectReservationParams,
  RejectReservationResult,
  ExpireReservationParams,
  ExpireReservationResult,
  FallbackParams,
  FallbackResult,
  ExpiryJobResult,
} from './types'

/**
 * Unified server-side domain service for managing the BedLink
 * Reservation State Machine, concurrency protection, and dynamic fallback.
 */
export class ReservationService {
  constructor(private client: any) {}

  /**
   * Atomically creates a HELD reservation for an available physical bed.
   */
  async hold(params: HoldReservationParams): Promise<HoldReservationResult> {
    return holdReservation(this.client, params)
  }

  /**
   * Atomically confirms hospital receipt/acceptance of a held reservation.
   */
  async accept(params: AcceptReservationParams): Promise<AcceptReservationResult> {
    return acceptReservation(this.client, params)
  }

  /**
   * Atomically rejects a held reservation, releases the bed, and triggers dynamic fallback.
   */
  async reject(params: RejectReservationParams): Promise<RejectReservationResult> {
    return rejectReservation(this.client, params)
  }

  /**
   * Atomically expires a due held reservation, releases the bed, and triggers dynamic fallback.
   */
  async expire(params: ExpireReservationParams): Promise<ExpireReservationResult> {
    return expireReservation(this.client, params)
  }

  /**
   * Re-evaluates current state against the deterministic ranking engine and holds the next candidate.
   */
  async fallback(params: FallbackParams): Promise<FallbackResult> {
    return executeReservationFallback(this.client, params)
  }

  /**
   * Authoritative server-side batch processor for due expired reservations.
   */
  async processDueExpiries(
    evaluationTime: Date | string | number,
    autoFallback: boolean = true
  ): Promise<ExpiryJobResult> {
    return processExpiredReservations(this.client, evaluationTime, autoFallback)
  }
}
