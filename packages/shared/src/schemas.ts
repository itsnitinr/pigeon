import { z } from 'zod'

import {
  DEFAULT_NOTIFICATIONS_PAGE_SIZE,
  DEFAULT_USER_TOKEN_TTL_SECONDS,
  ENVIRONMENT_NAMES,
  MAX_BATCH_SEND_SIZE,
  MAX_NOTIFICATIONS_PAGE_SIZE,
  NOTIFICATION_STATUSES,
  PROJECT_MEMBER_ROLES,
  WEBHOOK_DELIVERY_STATUSES,
  WEBHOOK_EVENTS
} from './constants'
import type { JsonValue } from './types'

export const uuidSchema = z.string().uuid()

export const environmentNameSchema = z.enum(ENVIRONMENT_NAMES)

export const projectMemberRoleSchema = z.enum(PROJECT_MEMBER_ROLES)

export const notificationStatusSchema = z.enum(NOTIFICATION_STATUSES)

export const webhookEventSchema = z.enum(WEBHOOK_EVENTS)

export const webhookDeliveryStatusSchema = z.enum(WEBHOOK_DELIVERY_STATUSES)

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)])
)

export const notificationDataSchema = z.record(jsonValueSchema).default({})

export const sendNotificationInputSchema = z.object({
  userId: z.string().min(1).max(255),
  type: z.string().min(1).max(255),
  title: z.string().min(1).max(255),
  body: z.string().max(10_000).nullable().optional(),
  data: notificationDataSchema.optional(),
  idempotencyKey: z.string().min(1).max(255).optional()
})

export const sendBatchNotificationsInputSchema = z.object({
  notifications: z.array(sendNotificationInputSchema).min(1).max(MAX_BATCH_SEND_SIZE)
})

export const createUserTokenInputSchema = z.object({
  userId: z.string().min(1).max(255),
  ttlSeconds: z.number().int().positive().max(60 * 60 * 24).default(DEFAULT_USER_TOKEN_TTL_SECONDS)
})

export const notificationsListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_NOTIFICATIONS_PAGE_SIZE).default(DEFAULT_NOTIFICATIONS_PAGE_SIZE),
  cursor: uuidSchema.optional(),
  unread: z.coerce.boolean().optional().default(false)
})

export const notificationPathParamSchema = z.object({
  id: uuidSchema
})

export const userPathParamSchema = z.object({
  userId: z.string().min(1).max(255)
})

export const jwtPayloadSchema = z.object({
  sub: z.string().min(1),
  pid: uuidSchema,
  eid: uuidSchema,
  iat: z.number().int().positive().optional(),
  exp: z.number().int().positive()
})

export const notificationRecordSchema = z.object({
  id: uuidSchema,
  userId: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  body: z.string().nullable(),
  data: notificationDataSchema,
  status: notificationStatusSchema,
  createdAt: z.string().datetime(),
  readAt: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable()
})

export const notificationsListResponseSchema = z.object({
  items: z.array(notificationRecordSchema),
  nextCursor: uuidSchema.nullable()
})

export const createUserTokenResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime()
})

export const streamEventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('notification.created'),
    data: notificationRecordSchema
  }),
  z.object({
    event: z.literal('notification.read'),
    data: z.object({
      id: uuidSchema,
      readAt: z.string().datetime()
    })
  })
])

export type SendNotificationInputSchema = z.infer<typeof sendNotificationInputSchema>
export type SendBatchNotificationsInputSchema = z.infer<typeof sendBatchNotificationsInputSchema>
export type CreateUserTokenInputSchema = z.infer<typeof createUserTokenInputSchema>
export type NotificationsListQuerySchema = z.infer<typeof notificationsListQuerySchema>
export type JwtPayloadSchema = z.infer<typeof jwtPayloadSchema>
