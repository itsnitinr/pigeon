import {
  endUsers,
  notifications,
  templates,
  webhookEndpoints
} from '@pigeon/db'
import { and, eq } from 'drizzle-orm'
import type { Job } from 'bullmq'

import type { NotificationRecord } from '@pigeon/shared'
import { db } from '../lib/db'
import { webhookDeliveryQueue } from '../lib/jobs'
import type { NotificationDeliveryJobData } from '../lib/jobs'
import { publishUserEvent } from '../lib/realtime'
import { renderTemplate } from '../lib/template'

interface NotificationWithUserRow {
  id: string
  projectId: string
  environmentId: string
  endUserId: string
  type: string
  title: string
  body: string | null
  data: Record<string, unknown>
  status: 'queued' | 'delivered' | 'failed'
  createdAt: Date
  readAt: Date | null
  archivedAt: Date | null
  externalUserId: string
}

async function loadNotification(notificationId: string): Promise<NotificationWithUserRow | null> {
  const [row] = await db
    .select({
      id: notifications.id,
      projectId: notifications.projectId,
      environmentId: notifications.environmentId,
      endUserId: notifications.endUserId,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      data: notifications.data,
      status: notifications.status,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      archivedAt: notifications.archivedAt,
      externalUserId: endUsers.externalUserId
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
    data: (row.data ?? {}) as Record<string, unknown>
  }
}

export async function processNotificationDeliveryJob(job: Job<NotificationDeliveryJobData>): Promise<void> {
  const notificationId = job.data.notificationId

  if (!notificationId) {
    throw new Error('notificationId is required for delivery jobs')
  }

  const notification = await loadNotification(notificationId)

  if (!notification) {
    throw new Error(`Notification ${notificationId} not found`)
  }

  const [template] = await db
    .select({
      titleTemplate: templates.titleTemplate,
      bodyTemplate: templates.bodyTemplate
    })
    .from(templates)
    .where(
      and(
        eq(templates.environmentId, notification.environmentId),
        eq(templates.type, notification.type)
      )
    )
    .limit(1)

  const nextTitle = template ? renderTemplate(template.titleTemplate, notification.data) : notification.title
  const nextBody = template ? renderTemplate(template.bodyTemplate, notification.data) : notification.body
  const updatedAt = new Date()

  const [updated] = await db
    .update(notifications)
    .set({
      title: nextTitle,
      body: nextBody,
      status: 'delivered',
      updatedAt
    })
    .where(eq(notifications.id, notificationId))
    .returning({
      id: notifications.id,
      title: notifications.title,
      body: notifications.body,
      status: notifications.status,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      archivedAt: notifications.archivedAt,
      type: notifications.type,
      data: notifications.data
    })

  if (!updated) {
    throw new Error(`Failed to update notification ${notificationId}`)
  }

  const eventPayload: NotificationRecord = {
    id: updated.id,
    userId: notification.externalUserId,
    type: updated.type,
    title: updated.title,
    body: updated.body,
    data: (updated.data ?? {}) as NotificationRecord['data'],
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
    readAt: updated.readAt ? updated.readAt.toISOString() : null,
    archivedAt: updated.archivedAt ? updated.archivedAt.toISOString() : null
  }

  await publishUserEvent(
    notification.environmentId,
    notification.externalUserId,
    'notification.created',
    eventPayload
  )

  const endpoints = await db
    .select({
      id: webhookEndpoints.id,
      events: webhookEndpoints.events
    })
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.environmentId, notification.environmentId),
        eq(webhookEndpoints.isActive, true)
      )
    )

  await Promise.all(
    endpoints
      .filter((endpoint) => endpoint.events.includes('notification.created'))
      .map((endpoint) =>
        webhookDeliveryQueue.add(
          'deliver-webhook',
          {
            webhookEndpointId: endpoint.id,
            notificationId: notification.id,
            event: 'notification.created'
          },
          {
            jobId: `${notification.id}:${endpoint.id}:notification.created`,
            attempts: 6,
            backoff: {
              type: 'exponential',
              delay: 30_000
            },
            removeOnComplete: 1000,
            removeOnFail: 1000
          }
        )
      )
  )
}
