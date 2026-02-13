import { Queue } from 'bullmq'

import { bullmqConnectionOptions } from './redis'

export const NOTIFICATION_DELIVERY_QUEUE = 'notification-delivery'
export const WEBHOOK_DELIVERY_QUEUE = 'webhook-delivery'
export const MAINTENANCE_QUEUE = 'maintenance'

export interface NotificationDeliveryJobData {
  notificationId: string
}

export interface WebhookDeliveryJobData {
  webhookEndpointId: string
  notificationId: string
  event: 'notification.created' | 'notification.read'
}

export interface CleanupNotificationsJobData {
  ttlDays: number
}

const globalQueueState = globalThis as typeof globalThis & {
  __pigeonWorkerWebhookQueue?: Queue<WebhookDeliveryJobData>
  __pigeonWorkerMaintenanceQueue?: Queue<CleanupNotificationsJobData>
}

export const webhookDeliveryQueue =
  globalQueueState.__pigeonWorkerWebhookQueue ??
  new Queue<WebhookDeliveryJobData>(WEBHOOK_DELIVERY_QUEUE, {
    connection: bullmqConnectionOptions
  })

export const maintenanceQueue =
  globalQueueState.__pigeonWorkerMaintenanceQueue ??
  new Queue<CleanupNotificationsJobData>(MAINTENANCE_QUEUE, {
    connection: bullmqConnectionOptions
  })

if (process.env.NODE_ENV !== 'production') {
  globalQueueState.__pigeonWorkerWebhookQueue = webhookDeliveryQueue
  globalQueueState.__pigeonWorkerMaintenanceQueue = maintenanceQueue
}

export async function scheduleCleanupJob(ttlDays: number): Promise<void> {
  await maintenanceQueue.add(
    'cleanup-old-notifications',
    { ttlDays },
    {
      jobId: 'cleanup-old-notifications',
      repeat: {
        pattern: '0 3 * * *',
        tz: 'UTC'
      },
      removeOnComplete: 100,
      removeOnFail: 100
    }
  )
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([webhookDeliveryQueue.close(), maintenanceQueue.close()])
}
