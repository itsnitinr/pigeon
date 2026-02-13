import {
  PigeonApiError,
  type PigeonApiErrorPayload,
  PigeonNetworkError,
  PigeonValidationError,
} from './errors'
import type {
  CreateUserTokenInput,
  CreateUserTokenResponse,
  PigeonClientOptions,
  SendBatchInput,
  SendNotificationInput,
  SendNotificationResponse,
} from './types'

const DEFAULT_BASE_URL = 'http://localhost:3001'
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_BATCH_SIZE = 100
const MAX_TOKEN_TTL_SECONDS = 60 * 60 * 24

type NotificationStatus = SendNotificationResponse['status']

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJsonBody(raw: string): unknown {
  if (!raw.trim()) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function isNotificationStatus(value: unknown): value is NotificationStatus {
  return value === 'queued' || value === 'delivered' || value === 'failed'
}

function parseSendNotificationResponse(payload: unknown): SendNotificationResponse {
  if (!isObjectRecord(payload)) {
    throw new PigeonValidationError('Invalid response: expected an object for send()')
  }

  const notificationId = payload.notificationId
  const status = payload.status

  if (typeof notificationId !== 'string' || !isNotificationStatus(status)) {
    throw new PigeonValidationError('Invalid response shape from send()', payload)
  }

  return {
    id: notificationId,
    status,
  }
}

function parseCreateUserTokenResponse(payload: unknown): CreateUserTokenResponse {
  if (!isObjectRecord(payload)) {
    throw new PigeonValidationError('Invalid response: expected an object for createUserToken()')
  }

  if (typeof payload.token !== 'string' || typeof payload.expiresAt !== 'string') {
    throw new PigeonValidationError('Invalid response shape from createUserToken()', payload)
  }

  return {
    token: payload.token,
    expiresAt: payload.expiresAt,
  }
}

function parseApiErrorPayload(status: number, payload: unknown): PigeonApiErrorPayload {
  const fallback: PigeonApiErrorPayload = {
    code: `HTTP_${status}`,
    message: `Request failed with status ${status}`,
  }

  if (!isObjectRecord(payload) || !isObjectRecord(payload.error)) {
    return fallback
  }

  const code = payload.error.code
  const message = payload.error.message
  const requestId = payload.error.requestId
  const details = payload.error.details

  if (typeof code !== 'string' || typeof message !== 'string') {
    return fallback
  }

  const parsed: PigeonApiErrorPayload = {
    code,
    message,
    details,
  }

  if (typeof requestId === 'string') {
    parsed.requestId = requestId
  }

  return parsed
}

function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new PigeonValidationError(`${fieldName} must be a non-empty string`)
  }
}

function validateNotificationInput(input: SendNotificationInput): void {
  assertNonEmptyString(input.userId, 'userId')
  assertNonEmptyString(input.type, 'type')
  assertNonEmptyString(input.title, 'title')

  if (input.body !== undefined && input.body !== null && typeof input.body !== 'string') {
    throw new PigeonValidationError('body must be a string, null, or undefined')
  }

  if (input.idempotencyKey !== undefined) {
    assertNonEmptyString(input.idempotencyKey, 'idempotencyKey')
  }

  if (input.data !== undefined && !isObjectRecord(input.data)) {
    throw new PigeonValidationError('data must be an object')
  }
}

function validateCreateUserTokenInput(input: CreateUserTokenInput): void {
  assertNonEmptyString(input.userId, 'userId')

  if (input.ttlSeconds === undefined) {
    return
  }

  if (
    !Number.isInteger(input.ttlSeconds) ||
    input.ttlSeconds <= 0 ||
    input.ttlSeconds > MAX_TOKEN_TTL_SECONDS
  ) {
    throw new PigeonValidationError(
      `ttlSeconds must be a positive integer <= ${MAX_TOKEN_TTL_SECONDS}`,
    )
  }
}

export class Pigeon {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: PigeonClientOptions) {
    assertNonEmptyString(options.apiKey, 'apiKey')
    this.apiKey = options.apiKey

    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    try {
      // Validate base URL eagerly so errors surface at startup.
      new URL(this.baseUrl)
    } catch {
      throw new PigeonValidationError('baseUrl must be a valid URL')
    }

    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new PigeonValidationError('timeoutMs must be a positive integer')
    }

    const resolvedFetch = options.fetch ?? globalThis.fetch
    if (typeof resolvedFetch !== 'function') {
      throw new PigeonValidationError('No fetch implementation available')
    }
    this.fetchImpl = resolvedFetch
  }

  async send(input: SendNotificationInput): Promise<SendNotificationResponse> {
    validateNotificationInput(input)

    return this.request(
      '/v1/notifications',
      {
        method: 'POST',
        body: input,
      },
      parseSendNotificationResponse,
    )
  }

  async sendBatch(notifications: SendBatchInput): Promise<SendNotificationResponse[]> {
    if (!Array.isArray(notifications)) {
      throw new PigeonValidationError('sendBatch expects an array of notifications')
    }

    if (notifications.length === 0) {
      throw new PigeonValidationError('sendBatch requires at least one notification')
    }

    if (notifications.length > MAX_BATCH_SIZE) {
      throw new PigeonValidationError(`sendBatch supports up to ${MAX_BATCH_SIZE} notifications`)
    }

    return Promise.all(notifications.map((notification) => this.send(notification)))
  }

  async createUserToken(input: CreateUserTokenInput): Promise<CreateUserTokenResponse> {
    validateCreateUserTokenInput(input)

    return this.request(
      `/v1/users/${encodeURIComponent(input.userId)}/token`,
      {
        method: 'POST',
        body: {
          ttlSeconds: input.ttlSeconds,
        },
      },
      parseCreateUserTokenResponse,
    )
  }

  private async request<T>(
    path: string,
    options: {
      method: 'GET' | 'POST'
      body?: unknown
    },
    parseResponse: (payload: unknown) => T,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl)
    const abortController = new AbortController()
    const timeout = setTimeout(() => {
      abortController.abort()
    }, this.timeoutMs)

    let response: Response
    try {
      const requestInit: RequestInit = {
        method: options.method,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        signal: abortController.signal,
      }

      if (options.body !== undefined) {
        requestInit.body = JSON.stringify(options.body)
      }

      response = await this.fetchImpl(url, requestInit)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PigeonNetworkError(`Request timed out after ${this.timeoutMs}ms`, {
          cause: error,
        })
      }

      throw new PigeonNetworkError('Failed to reach Pigeon API', {
        cause: error instanceof Error ? error : undefined,
      })
    } finally {
      clearTimeout(timeout)
    }

    const rawBody = await response.text()
    const payload = parseJsonBody(rawBody)

    if (!response.ok) {
      throw new PigeonApiError(response.status, parseApiErrorPayload(response.status, payload))
    }

    return parseResponse(payload)
  }
}
