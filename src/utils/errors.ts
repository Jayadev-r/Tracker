/**
 * Domain-specific typed errors for PaisaTrack.
 */

export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainError'
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends DomainError {
  constructor(entityName: string, id: string) {
    super(`${entityName} with id '${id}' was not found.`)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

export class RefundExceededError extends DomainError {
  constructor(requestedPaise: number, remainingPaise: number) {
    super(
      `Refund amount of ${requestedPaise} paise exceeds remaining refundable balance of ${remainingPaise} paise.`
    )
    this.name = 'RefundExceededError'
  }
}
