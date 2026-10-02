export class AuthError extends Error {
  readonly status: number

  constructor(message: string, status: number = 401) {
    super(message)
    this.name = 'AuthError'
    this.status = status
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message: string = 'Authentication required') {
    super(message, 401)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends AuthError {
  constructor(message: string = 'Access denied: insufficient permissions or organizational boundary violation') {
    super(message, 403)
    this.name = 'ForbiddenError'
  }
}
