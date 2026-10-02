export class ReservationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReservationError'
  }
}

export class ReservationNotFoundError extends ReservationError {
  constructor(reservationId: string) {
    super(`Reservation not found: ${reservationId}`)
    this.name = 'ReservationNotFoundError'
  }
}

export class ReservationStateError extends ReservationError {
  constructor(message: string) {
    super(message)
    this.name = 'ReservationStateError'
  }
}

export class ReservationConflictError extends ReservationError {
  constructor(message: string) {
    super(message)
    this.name = 'ReservationConflictError'
  }
}

export class ReservationExpiredError extends ReservationError {
  constructor(message: string) {
    super(message)
    this.name = 'ReservationExpiredError'
  }
}

export class StaleReservationError extends ReservationError {
  constructor(message: string) {
    super(message)
    this.name = 'StaleReservationError'
  }
}

export class NoEligibleHospitalError extends ReservationError {
  constructor(bedRequestId: string) {
    super(`No eligible hospital available for BedRequest: ${bedRequestId}`)
    this.name = 'NoEligibleHospitalError'
  }
}
