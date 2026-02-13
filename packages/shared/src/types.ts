import type {
  API_KEY_PREFIX_BY_ENVIRONMENT,
  ENVIRONMENT_NAMES,
  NOTIFICATION_STATUSES,
  PROJECT_MEMBER_ROLES,
  WEBHOOK_DELIVERY_STATUSES,
  WEBHOOK_EVENTS
} from './constants'

export type EnvironmentName = (typeof ENVIRONMENT_NAMES)[number]

export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number]

export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number]

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number]

export type ApiKeyPrefix = (typeof API_KEY_PREFIX_BY_ENVIRONMENT)[EnvironmentName]

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

export interface BatchSendNotificationsInput {
  notifications: SendNotificationInput[]
}

export interface CreateUserTokenInput {
  userId: string
  ttlSeconds?: number
}

export interface CreateUserTokenResponse {
  token: string
  expiresAt: string
}

export interface NotificationRecord {
  id: string
  userId: string
  type: string
  title: string
  body: string | null
  data: Record<string, JsonValue>
  status: NotificationStatus
  createdAt: string
  readAt: string | null
  archivedAt: string | null
}

export interface NotificationsListResponse {
  items: NotificationRecord[]
  nextCursor: string | null
}

export interface MarkReadResponse {
  id: string
  readAt: string
}

export interface MarkAllReadResponse {
  updatedCount: number
}

export interface ArchiveResponse {
  id: string
  archivedAt: string
}

export interface NotificationCreatedEvent {
  event: 'notification.created'
  data: NotificationRecord
}

export interface NotificationReadEvent {
  event: 'notification.read'
  data: {
    id: string
    readAt: string
  }
}

export type StreamEvent = NotificationCreatedEvent | NotificationReadEvent
