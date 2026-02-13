import { endUsers, environments, notifications } from '@pigeon/db'
import { and, desc, eq, isNull, lt, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import {
  createUserTokenResponseSchema,
  notificationPathParamSchema,
  notificationsListQuerySchema,
  sendNotificationInputSchema,
  userPathParamSchema
} from '@pigeon/shared'
import { z } from 'zod'

import type {
  ArchiveResponse,
  CreateUserTokenResponse,
  JsonValue,
  MarkAllReadResponse,
  MarkReadResponse,
  NotificationsListResponse,
  StreamEvent
} from '@pigeon/shared'
import { db } from '../lib/db'
import { env } from '../lib/env'
import { ApiError } from '../lib/errors'
import { signHs256Jwt } from '../lib/jwt'
import {
  getUserEventChannel,
  parsePublishedRealtimeEvent,
  publishUserEvent,
  readUserEventsSince
} from '../lib/realtime'
import { createRedisSubscriber } from '../lib/redis'
import { enqueueNotificationDelivery } from '../lib/queue'
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'
import { createRateLimitMiddleware } from '../middleware/rate-limit'
import type { AppBindings } from '../types/context'

function toJsonRecord(value: unknown): Record<string, JsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, JsonValue>
}

function parseJson(rawText: string): unknown {
  if (!rawText.trim()) {
    return {}
  }

  try {
    return JSON.parse(rawText)
  } catch {
    throw new ApiError(400, 'BAD_REQUEST', 'Invalid JSON body')
  }
}

async function getEndUserId(environmentId: string, externalUserId: string): Promise<string | null> {
  const [endUser] = await db
    .select({ id: endUsers.id })
    .from(endUsers)
    .where(and(eq(endUsers.environmentId, environmentId), eq(endUsers.externalUserId, externalUserId)))
    .limit(1)

  return endUser?.id ?? null
}

const apiWriteRateLimitMiddleware = createRateLimitMiddleware({
  keyPrefix: 'ratelimit:api-key:write',
  limit: 100,
  windowMs: 1000,
  resolveIdentifier: (c) => c.get('apiKeyAuth').apiKeyId
})

const jwtReadRateLimitMiddleware = createRateLimitMiddleware({
  keyPrefix: 'ratelimit:jwt:read',
  limit: 1000,
  windowMs: 1000,
  resolveIdentifier: (c) => {
    const auth = c.get('jwtAuth')
    return `${auth.environmentId}:${auth.externalUserId}`
  }
})

async function writeStreamEvent(
  writeSSE: (message: { id?: string; event?: string; data: string; retry?: number }) => Promise<void>,
  event: { id: string; event: StreamEvent['event']; data: StreamEvent['data'] }
): Promise<void> {
  await writeSSE({
    id: event.id,
    event: event.event,
    data: JSON.stringify(event.data)
  })
}

export const v1Routes = new Hono<AppBindings>()

v1Routes.post('/notifications', apiKeyAuthMiddleware, apiWriteRateLimitMiddleware, async (c) => {
  const auth = c.get('apiKeyAuth')
  const rawBody = parseJson(await c.req.text())
  const parsedBody = sendNotificationInputSchema.safeParse(rawBody)

  if (!parsedBody.success) {
    throw new ApiError(400, 'BAD_REQUEST', 'Invalid notification payload', parsedBody.error.flatten())
  }

  const input = parsedBody.data

  if (input.idempotencyKey) {
    const [existing] = await db
      .select({
        id: notifications.id,
        status: notifications.status
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.environmentId, auth.environmentId),
          eq(notifications.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1)

    if (existing) {
      return c.json(
        {
          notificationId: existing.id,
          status: existing.status
        },
        200
      )
    }
  }

  const [upsertedEndUser] = await db
    .insert(endUsers)
    .values({
      projectId: auth.projectId,
      environmentId: auth.environmentId,
      externalUserId: input.userId
    })
    .onConflictDoUpdate({
      target: [endUsers.environmentId, endUsers.externalUserId],
      set: {
        projectId: auth.projectId
      }
    })
    .returning({ id: endUsers.id })

  const endUserId = upsertedEndUser?.id

  if (!endUserId) {
    throw new ApiError(500, 'INTERNAL_SERVER_ERROR', 'Failed to resolve end user')
  }

  let createdNotification: { id: string; status: 'queued' | 'delivered' | 'failed' } | undefined

  if (input.idempotencyKey) {
    const insertedRows = await db
      .insert(notifications)
      .values({
        projectId: auth.projectId,
        environmentId: auth.environmentId,
        endUserId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        data: input.data ?? {},
        status: 'queued',
        idempotencyKey: input.idempotencyKey
      })
      .onConflictDoNothing()
      .returning({
        id: notifications.id,
        status: notifications.status
      })

    createdNotification = insertedRows[0]

    if (!createdNotification) {
      const [existing] = await db
        .select({
          id: notifications.id,
          status: notifications.status
        })
        .from(notifications)
        .where(
          and(
            eq(notifications.environmentId, auth.environmentId),
            eq(notifications.idempotencyKey, input.idempotencyKey)
          )
        )
        .limit(1)

      if (existing) {
        return c.json(
          {
            notificationId: existing.id,
            status: existing.status
          },
          200
        )
      }

      throw new ApiError(500, 'INTERNAL_SERVER_ERROR', 'Failed to resolve idempotent notification')
    }
  } else {
    const [inserted] = await db
      .insert(notifications)
      .values({
        projectId: auth.projectId,
        environmentId: auth.environmentId,
        endUserId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        data: input.data ?? {},
        status: 'queued',
        idempotencyKey: null
      })
      .returning({
        id: notifications.id,
        status: notifications.status
      })

    createdNotification = inserted

    if (!createdNotification) {
      throw new ApiError(500, 'INTERNAL_SERVER_ERROR', 'Failed to create notification')
    }
  }

  try {
    await enqueueNotificationDelivery(createdNotification.id)
  } catch (error) {
    console.error('Queue enqueue failed', error)
    throw new ApiError(503, 'QUEUE_UNAVAILABLE', 'Notification queued in DB but failed to enqueue job')
  }

  return c.json(
    {
      notificationId: createdNotification.id,
      status: createdNotification.status
    },
    201
  )
})

v1Routes.post('/users/:userId/token', apiKeyAuthMiddleware, apiWriteRateLimitMiddleware, async (c) => {
  const auth = c.get('apiKeyAuth')

  const pathParamsResult = userPathParamSchema.safeParse(c.req.param())

  if (!pathParamsResult.success) {
    throw new ApiError(400, 'BAD_REQUEST', 'Invalid userId parameter', pathParamsResult.error.flatten())
  }

  const rawBody = parseJson(await c.req.text())
  const bodySchema = z.object({
    ttlSeconds: z.number().int().positive().max(60 * 60 * 24).optional()
  })
  const parsedBody = bodySchema.safeParse(rawBody)

  if (!parsedBody.success) {
    throw new ApiError(400, 'BAD_REQUEST', 'Invalid token request body', parsedBody.error.flatten())
  }

  const ttlSeconds = parsedBody.data.ttlSeconds ?? env.JWT_TTL_SECONDS

  const [environment] = await db
    .select({ jwtSecret: environments.jwtSecret })
    .from(environments)
    .where(and(eq(environments.id, auth.environmentId), eq(environments.projectId, auth.projectId)))
    .limit(1)

  if (!environment) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid API key context')
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  const expSeconds = nowSeconds + ttlSeconds

  const token = signHs256Jwt(
    {
      sub: pathParamsResult.data.userId,
      pid: auth.projectId,
      eid: auth.environmentId,
      iat: nowSeconds,
      exp: expSeconds
    },
    environment.jwtSecret
  )

  const response: CreateUserTokenResponse = {
    token,
    expiresAt: new Date(expSeconds * 1000).toISOString()
  }

  const responseCheck = createUserTokenResponseSchema.safeParse(response)

  if (!responseCheck.success) {
    throw new ApiError(500, 'INTERNAL_SERVER_ERROR', 'Generated token response is invalid')
  }

  return c.json(responseCheck.data, 201)
})

v1Routes.get('/notifications', jwtAuthMiddleware, jwtReadRateLimitMiddleware, async (c) => {
  const auth = c.get('jwtAuth')

  const queryResult = notificationsListQuerySchema.safeParse({
    limit: c.req.query('limit'),
    cursor: c.req.query('cursor') ?? undefined,
    unread: c.req.query('unread') ?? undefined
  })

  if (!queryResult.success) {
    throw new ApiError(400, 'BAD_REQUEST', 'Invalid notifications query', queryResult.error.flatten())
  }

  const query = queryResult.data
  const endUserId = await getEndUserId(auth.environmentId, auth.externalUserId)

  if (!endUserId) {
    const emptyResponse: NotificationsListResponse = {
      items: [],
      nextCursor: null
    }

    return c.json(emptyResponse)
  }

  let cursorCreatedAt: Date | undefined

  if (query.cursor) {
    const [cursorRow] = await db
      .select({ id: notifications.id, createdAt: notifications.createdAt })
      .from(notifications)
      .where(
        and(
          eq(notifications.id, query.cursor),
          eq(notifications.environmentId, auth.environmentId),
          eq(notifications.endUserId, endUserId)
        )
      )
      .limit(1)

    if (!cursorRow) {
      throw new ApiError(400, 'BAD_REQUEST', 'Invalid cursor')
    }

    cursorCreatedAt = cursorRow.createdAt
  }

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      data: notifications.data,
      status: notifications.status,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      archivedAt: notifications.archivedAt
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.environmentId, auth.environmentId),
        eq(notifications.endUserId, endUserId),
        isNull(notifications.archivedAt),
        query.unread ? isNull(notifications.readAt) : undefined,
        cursorCreatedAt && query.cursor
          ? or(
              lt(notifications.createdAt, cursorCreatedAt),
              and(eq(notifications.createdAt, cursorCreatedAt), lt(notifications.id, query.cursor))
            )
          : undefined
      )
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(query.limit + 1)

  const hasMore = rows.length > query.limit
  const pageRows = hasMore ? rows.slice(0, query.limit) : rows

  const response: NotificationsListResponse = {
    items: pageRows.map((row) => ({
      id: row.id,
      userId: auth.externalUserId,
      type: row.type,
      title: row.title,
      body: row.body,
      data: toJsonRecord(row.data),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt ? row.readAt.toISOString() : null,
      archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null
    })),
    nextCursor: hasMore ? pageRows[pageRows.length - 1]?.id ?? null : null
  }

  return c.json(response)
})

v1Routes.post('/notifications/:id/read', jwtAuthMiddleware, jwtReadRateLimitMiddleware, async (c) => {
  const auth = c.get('jwtAuth')
  const pathParamsResult = notificationPathParamSchema.safeParse(c.req.param())

  if (!pathParamsResult.success) {
    throw new ApiError(400, 'BAD_REQUEST', 'Invalid notification id', pathParamsResult.error.flatten())
  }

  const endUserId = await getEndUserId(auth.environmentId, auth.externalUserId)

  if (!endUserId) {
    throw new ApiError(404, 'NOT_FOUND', 'Notification not found')
  }

  const [existing] = await db
    .select({
      id: notifications.id,
      readAt: notifications.readAt
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.id, pathParamsResult.data.id),
        eq(notifications.environmentId, auth.environmentId),
        eq(notifications.endUserId, endUserId)
      )
    )
    .limit(1)

  if (!existing) {
    throw new ApiError(404, 'NOT_FOUND', 'Notification not found')
  }

  const readAt = existing.readAt ?? new Date()

  if (!existing.readAt) {
    const [updated] = await db
      .update(notifications)
      .set({
        readAt,
        updatedAt: readAt
      })
      .where(
        and(
          eq(notifications.id, pathParamsResult.data.id),
          eq(notifications.environmentId, auth.environmentId),
          eq(notifications.endUserId, endUserId),
          isNull(notifications.readAt)
        )
      )
      .returning({
        id: notifications.id,
        readAt: notifications.readAt
      })

    if (!updated?.readAt) {
      throw new ApiError(500, 'INTERNAL_SERVER_ERROR', 'Failed to mark notification as read')
    }
  }

  await publishUserEvent(auth.environmentId, auth.externalUserId, 'notification.read', {
    id: existing.id,
    readAt: readAt.toISOString()
  })

  const response: MarkReadResponse = {
    id: existing.id,
    readAt: readAt.toISOString()
  }

  return c.json(response)
})

v1Routes.post('/notifications/read-all', jwtAuthMiddleware, jwtReadRateLimitMiddleware, async (c) => {
  const auth = c.get('jwtAuth')
  const endUserId = await getEndUserId(auth.environmentId, auth.externalUserId)

  if (!endUserId) {
    const response: MarkAllReadResponse = {
      updatedCount: 0
    }

    return c.json(response)
  }

  const now = new Date()
  const updatedRows = await db
    .update(notifications)
    .set({
      readAt: now,
      updatedAt: now
    })
    .where(
      and(
        eq(notifications.environmentId, auth.environmentId),
        eq(notifications.endUserId, endUserId),
        isNull(notifications.readAt),
        isNull(notifications.archivedAt)
      )
    )
    .returning({ id: notifications.id })

  if (updatedRows.length > 0) {
    const readAt = now.toISOString()

    await Promise.all(
      updatedRows.map((row) =>
        publishUserEvent(auth.environmentId, auth.externalUserId, 'notification.read', {
          id: row.id,
          readAt
        })
      )
    )
  }

  const response: MarkAllReadResponse = {
    updatedCount: updatedRows.length
  }

  return c.json(response)
})

v1Routes.post('/notifications/:id/archive', jwtAuthMiddleware, jwtReadRateLimitMiddleware, async (c) => {
  const auth = c.get('jwtAuth')
  const pathParamsResult = notificationPathParamSchema.safeParse(c.req.param())

  if (!pathParamsResult.success) {
    throw new ApiError(400, 'BAD_REQUEST', 'Invalid notification id', pathParamsResult.error.flatten())
  }

  const endUserId = await getEndUserId(auth.environmentId, auth.externalUserId)

  if (!endUserId) {
    throw new ApiError(404, 'NOT_FOUND', 'Notification not found')
  }

  const [existing] = await db
    .select({
      id: notifications.id,
      archivedAt: notifications.archivedAt
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.id, pathParamsResult.data.id),
        eq(notifications.environmentId, auth.environmentId),
        eq(notifications.endUserId, endUserId)
      )
    )
    .limit(1)

  if (!existing) {
    throw new ApiError(404, 'NOT_FOUND', 'Notification not found')
  }

  const archivedAt = existing.archivedAt ?? new Date()

  if (!existing.archivedAt) {
    const [updated] = await db
      .update(notifications)
      .set({
        archivedAt,
        updatedAt: archivedAt
      })
      .where(
        and(
          eq(notifications.id, pathParamsResult.data.id),
          eq(notifications.environmentId, auth.environmentId),
          eq(notifications.endUserId, endUserId),
          isNull(notifications.archivedAt)
        )
      )
      .returning({
        id: notifications.id,
        archivedAt: notifications.archivedAt
      })

    if (!updated?.archivedAt) {
      throw new ApiError(500, 'INTERNAL_SERVER_ERROR', 'Failed to archive notification')
    }
  }

  const response: ArchiveResponse = {
    id: existing.id,
    archivedAt: archivedAt.toISOString()
  }

  return c.json(response)
})

v1Routes.get('/stream', jwtAuthMiddleware, jwtReadRateLimitMiddleware, async (c) => {
  const auth = c.get('jwtAuth')
  const channel = getUserEventChannel(auth.environmentId, auth.externalUserId)
  const lastEventId = c.req.header('last-event-id') ?? c.req.query('lastEventId') ?? undefined

  return streamSSE(
    c,
    async (stream) => {
      const subscriber = createRedisSubscriber()

      let closed = false
      const cleanup = async () => {
        if (closed) {
          return
        }

        closed = true

        try {
          await subscriber.unsubscribe(channel)
        } catch {
          // ignore unsubscribe errors on teardown
        }

        subscriber.disconnect()
      }

      stream.onAbort(() => {
        void cleanup()
      })

      try {
        if (lastEventId) {
          const replayedEvents = await readUserEventsSince(
            auth.environmentId,
            auth.externalUserId,
            lastEventId,
            200
          )

          for (const event of replayedEvents) {
            await writeStreamEvent(stream.writeSSE.bind(stream), event)
          }
        }

        await stream.writeSSE({
          event: 'connected',
          data: JSON.stringify({
            status: 'connected',
            timestamp: new Date().toISOString()
          }),
          retry: 2000
        })

        subscriber.on('message', (incomingChannel: string, payload: string) => {
          if (incomingChannel !== channel) {
            return
          }

          const envelope = parsePublishedRealtimeEvent(payload)

          if (!envelope) {
            return
          }

          void writeStreamEvent(stream.writeSSE.bind(stream), envelope).catch(() => {
            stream.abort()
          })
        })

        await subscriber.subscribe(channel)

        const keepAliveInterval = setInterval(() => {
          void stream
            .writeSSE({
              event: 'ping',
              data: JSON.stringify({ timestamp: new Date().toISOString() })
            })
            .catch(() => {
              stream.abort()
            })
        }, 25_000)

        try {
          await new Promise<void>((resolve) => {
            stream.onAbort(() => {
              resolve()
            })
          })
        } finally {
          clearInterval(keepAliveInterval)
        }
      } finally {
        await cleanup()
      }
    },
    async (_error, stream) => {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ message: 'SSE connection error' })
      })
    }
  )
})
