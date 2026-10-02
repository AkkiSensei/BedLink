export class RankingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RankingError'
  }
}

export class RankingValidationError extends RankingError {
  constructor(message: string) {
    super(message)
    this.name = 'RankingValidationError'
  }
}
