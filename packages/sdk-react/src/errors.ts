export class PigeonReactError extends Error {
  readonly code: string

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PigeonReactError'
    this.code = code
  }
}

export class PigeonReactApiError extends PigeonReactError {
  readonly status: number
  readonly requestId?: string
  readonly details?: unknown

  constructor(params: {
    status: number
    code: string
    message: string
    requestId?: string
    details?: unknown
  }) {
    super(params.code, params.message)
    this.name = 'PigeonReactApiError'
    this.status = params.status

    if (params.requestId) {
      this.requestId = params.requestId
    }

    if (params.details !== undefined) {
      this.details = params.details
    }
  }
}
