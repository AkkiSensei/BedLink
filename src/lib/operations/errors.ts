import { AuthError, UnauthorizedError, ForbiddenError } from '@/lib/auth/errors'
import {
  ReservationError,
  ReservationNotFoundError,
  ReservationConflictError,
  ReservationExpiredError,
  StaleReservationError,
  ReservationStateError,
  NoEligibleHospitalError,
} from '@/lib/reservations/errors'
import { RankingValidationError } from '@/lib/ranking'

export type OperationErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'STALE_RESERVATION'
  | 'EXPIRED_RESERVATION'
  | 'DOMAIN_ERROR'
  | 'INTERNAL_ERROR'

/**
 * Base Application Operation Error
 */
export class OperationError extends Error {
  readonly code: OperationErrorCode
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(
    message: string,
    code: OperationErrorCode,
    status: number,
    details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'OperationError'
    this.code = code
    this.status = status
    this.details = details
    Object.setPrototypeOf(this, new.target.prototype)
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      ...(this.details ? { details: this.details } : {}),
    }
  }
}

export class UnauthenticatedOperationError extends OperationError {
  constructor(message: string = 'Authentication required') {
    super(message, 'UNAUTHENTICATED', 401)
    this.name = 'UnauthenticatedOperationError'
  }
}

export class ForbiddenOperationError extends OperationError {
  constructor(
    message: string = 'Access denied: insufficient permissions or organizational boundary violation',
    details?: Record<string, unknown>
  ) {
    super(message, 'FORBIDDEN', 403, details)
    this.name = 'ForbiddenOperationError'
  }
}

export class ValidationOperationError extends OperationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details)
    this.name = 'ValidationOperationError'
  }
}

export class NotFoundOperationError extends OperationError {
  constructor(message: string = 'Resource not found', details?: Record<string, unknown>) {
    super(message, 'NOT_FOUND', 404, details)
    this.name = 'NotFoundOperationError'
  }
}

export class ConflictOperationError extends OperationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, details)
    this.name = 'ConflictOperationError'
  }
}

export class StaleReservationOperationError extends OperationError {
  constructor(
    message: string = 'Stale reservation: reservation is no longer active for this request',
    details?: Record<string, unknown>
  ) {
    super(message, 'STALE_RESERVATION', 409, details)
    this.name = 'StaleReservationOperationError'
  }
}

export class ExpiredReservationOperationError extends OperationError {
  constructor(
    message: string = 'Reservation hold has expired',
    details?: Record<string, unknown>
  ) {
    super(message, 'EXPIRED_RESERVATION', 410, details)
    this.name = 'ExpiredReservationOperationError'
  }
}

export class DomainOperationError extends OperationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'DOMAIN_ERROR', 422, details)
    this.name = 'DomainOperationError'
  }
}

export class InternalOperationError extends OperationError {
  constructor(
    message: string = 'An unexpected internal error occurred',
    details?: Record<string, unknown>
  ) {
    super(message, 'INTERNAL_ERROR', 500, details)
    this.name = 'InternalOperationError'
  }
}

/**
 * Translates domain, auth, validation, or database exceptions into safe,
 * standardized OperationError objects without exposing SQL internals or credentials.
 */
export function toOperationError(error: unknown): OperationError {
  if (error instanceof OperationError) {
    return error
  }

  if (error instanceof UnauthorizedError) {
    return new UnauthenticatedOperationError(error.message)
  }

  if (error instanceof ForbiddenError) {
    return new ForbiddenOperationError(error.message)
  }

  if (error instanceof AuthError) {
    return new UnauthenticatedOperationError(error.message)
  }

  if (error instanceof StaleReservationError) {
    return new StaleReservationOperationError(error.message)
  }

  if (error instanceof ReservationExpiredError) {
    return new ExpiredReservationOperationError(error.message)
  }

  if (error instanceof ReservationNotFoundError) {
    return new NotFoundOperationError(error.message)
  }

  if (error instanceof ReservationConflictError) {
    return new ConflictOperationError(error.message)
  }

  if (error instanceof ReservationStateError) {
    return new ConflictOperationError(error.message)
  }

  if (error instanceof NoEligibleHospitalError) {
    return new DomainOperationError(error.message)
  }

  if (error instanceof RankingValidationError) {
    return new ValidationOperationError(error.message)
  }

  if (error instanceof ReservationError) {
    return new DomainOperationError(error.message)
  }

  // Handle generic error or SQL error safely
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
      return new ConflictOperationError('Resource conflict: duplicate entry violates system constraints')
    }
    if (msg.includes('check constraint')) {
      return new ValidationOperationError('Invalid data: supplied input violates schema constraints')
    }
    if (msg.includes('violates foreign key')) {
      return new NotFoundOperationError('Referenced resource does not exist')
    }
    if (msg.includes('row-level security') || msg.includes('permission denied')) {
      return new ForbiddenOperationError('Access denied by row-level security policy')
    }
    // Return sanitized message if safe, or generic message
    return new InternalOperationError('Internal operation failure')
  }

  return new InternalOperationError('An unexpected internal error occurred')
}
