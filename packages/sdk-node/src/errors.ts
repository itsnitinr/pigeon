export interface PigeonApiErrorPayload {
  code: string
  message: string
  requestId?: string
  details?: unknown
}

export class PigeonError extends Error {
  readonly code: string

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PigeonError'
    this.code = code
  }
}

export class PigeonValidationError extends PigeonError {
  readonly details?: unknown

  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message)
    this.name = 'PigeonValidationError'
    this.details = details
  }
}

export class PigeonNetworkError extends PigeonError {
  constructor(message: string, options?: ErrorOptions) {
    super('NETWORK_ERROR', message, options)
    this.name = 'PigeonNetworkError'
  }
}

export class PigeonApiError extends PigeonError {
  readonly status: number
  readonly requestId?: string
  readonly details?: unknown

  constructor(status: number, payload: PigeonApiErrorPayload) {
    super(payload.code, payload.message)
    this.name = 'PigeonApiError'
    this.status = status

    if (payload.requestId) {
      this.requestId = payload.requestId
    }

    if (payload.details !== undefined) {
      this.details = payload.details
    }
  }
}
