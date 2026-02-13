import { endUsers, notifications, webhookDeliveryAttempts, webhookEndpoints } from '@flypigeon/db'
import type { Job } from 'bullmq'
import { and, eq } from 'drizzle-orm'

import type { NotificationRecord } from '@flypigeon/shared'
import { db } from '../lib/db'
import type { WebhookDeliveryJobData } from '../lib/jobs'
import { deliverWebhook } from '../lib/webhook'

interface NotificationWebhookPayload {
  id: string
  environmentId: string
  externalUserId: string
  type: string
  title: string
  body: string | null
  data: Record<string, unknown>
  status: 'queued' | 'delivered' | 'failed'
  createdAt: Date
  readAt: Date | null
  archivedAt: Date | null
}

function computeNextRetryAt(job: Job<WebhookDeliveryJobData>): Date | null {
  const attempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1
  const attemptNumber = job.attemptsMade + 1

  if (attemptNumber >= attempts) {
    return null
  }

  const backoff = job.opts.backoff

  if (!backoff || typeof backoff === 'number') {
    const delay = typeof backoff === 'number' ? backoff : 0
    return delay > 0 ? new Date(Date.now() + delay) : null
  }

  if (backoff.type === 'exponential') {
    const baseDelay = Number(backoff.delay || 0)
    if (baseDelay <= 0) {
      return null
    }

    return new Date(Date.now() + baseDelay * 2 ** (attemptNumber - 1))
  }

  if (backoff.type === 'fixed') {
    const delay = Number(backoff.delay || 0)
    return delay > 0 ? new Date(Date.now() + delay) : null
  }

  return null
}

async function loadNotificationPayload(
  notificationId: string,
): Promise<NotificationWebhookPayload | null> {
  const [row] = await db
    .select({
      id: notifications.id,
      environmentId: notifications.environmentId,
      externalUserId: endUsers.externalUserId,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      data: notifications.data,
      status: notifications.status,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      archivedAt: notifications.archivedAt,
    })
    .from(notifications)
    .innerJoin(endUsers, eq(notifications.endUserId, endUsers.id))
    .where(eq(notifications.id, notificationId))
    .limit(1)

  if (!row) {
    return null
  }

  return {
    ...row,
    data: (row.data ?? {}) as Record<string, unknown>,
  }
}

export async function processWebhookDeliveryJob(job: Job<WebhookDeliveryJobData>): Promise<void> {
  const { webhookEndpointId, notificationId, event } = job.data

  if (!webhookEndpointId || !notificationId || !event) {
    throw new Error('Invalid webhook delivery job payload')
  }

  const [endpoint] = await db
    .select({
      id: webhookEndpoints.id,
      url: webhookEndpoints.url,
      secret: webhookEndpoints.secret,
      events: webhookEndpoints.events,
      isActive: webhookEndpoints.isActive,
    })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, webhookEndpointId))
    .limit(1)

  if (!endpoint || !endpoint.isActive) {
    return
  }

  if (!endpoint.events.includes(event)) {
    return
  }

  const notification = await loadNotificationPayload(notificationId)

  if (!notification) {
    throw new Error(`Notification ${notificationId} not found for webhook`)
  }

  const notificationRecord: NotificationRecord = {
    id: notification.id,
    userId: notification.externalUserId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data as NotificationRecord['data'],
    status: notification.status,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
    archivedAt: notification.archivedAt ? notification.archivedAt.toISOString() : null,
  }

  const timestamp = new Date().toISOString()
  const payload = {
    event,
    timestamp,
    data: notificationRecord,
  }

  const payloadJson = JSON.stringify(payload)
  const attemptNumber = job.attemptsMade + 1
  const nextRetryAt = computeNextRetryAt(job)

  const [attempt] = await db
    .insert(webhookDeliveryAttempts)
    .values({
      webhookEndpointId,
      notificationId,
      event,
      status: 'pending',
      requestBody: payload,
      attemptNumber,
      nextRetryAt,
    })
    .returning({ id: webhookDeliveryAttempts.id })

  if (!attempt) {
    throw new Error('Failed to create webhook delivery attempt record')
  }

  const deliveryResult = await deliverWebhook(endpoint.url, event, endpoint.secret, payloadJson)

  if (deliveryResult.ok) {
    await db
      .update(webhookDeliveryAttempts)
      .set({
        status: 'success',
        responseStatus: deliveryResult.status,
        responseBody: deliveryResult.responseBody,
        error: null,
        nextRetryAt: null,
      })
      .where(eq(webhookDeliveryAttempts.id, attempt.id))

    return
  }

  await db
    .update(webhookDeliveryAttempts)
    .set({
      status: 'failed',
      responseStatus: deliveryResult.status,
      responseBody: deliveryResult.responseBody,
      error: deliveryResult.error,
      nextRetryAt,
    })
    .where(eq(webhookDeliveryAttempts.id, attempt.id))

  throw new Error(
    [
      'Webhook delivery failed',
      `endpointId=${endpoint.id}`,
      `url=${endpoint.url}`,
      `event=${event}`,
      `notificationId=${notificationId}`,
      `attempt=${attemptNumber}`,
      `status=${deliveryResult.status ?? 'none'}`,
      `error=${deliveryResult.error || 'unknown'}`,
    ].join(' '),
  )
}
