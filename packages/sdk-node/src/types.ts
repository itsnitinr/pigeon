export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[]

export interface SendNotificationInput {
  userId: string
  type: string
  title: string
  body?: string | null
  data?: Record<string, JsonValue>
  idempotencyKey?: string
}

export interface SendNotificationResponse {
  id: string
  status: 'queued' | 'delivered' | 'failed'
}

export type SendBatchInput = SendNotificationInput[]

export interface CreateUserTokenInput {
  userId: string
  ttlSeconds?: number
}

export interface CreateUserTokenResponse {
  token: string
  expiresAt: string
}

export interface PigeonClientOptions {
  apiKey: string
  baseUrl?: string
  timeoutMs?: number
  fetch?: typeof fetch
}
