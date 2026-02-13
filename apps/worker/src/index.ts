import { Worker } from 'bullmq'

import { pool } from './lib/db'
import { env } from './lib/env'
import {
  MAINTENANCE_QUEUE,
  NOTIFICATION_DELIVERY_QUEUE,
  WEBHOOK_DELIVERY_QUEUE,
  closeQueues,
  scheduleCleanupJob
} from './lib/jobs'
import { closeRedisClient, bullmqConnectionOptions } from './lib/redis'
import { processCleanupNotificationsJob } from './processors/cleanup'
import { processNotificationDeliveryJob } from './processors/notification-delivery'
import { processWebhookDeliveryJob } from './processors/webhook-delivery'

function serializeError(error: unknown): Record<string, string | null> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null
    }
  }

  return {
    name: 'UnknownError',
    message: String(error),
    stack: null
  }
}

const notificationWorker = new Worker(NOTIFICATION_DELIVERY_QUEUE, processNotificationDeliveryJob, {
  connection: bullmqConnectionOptions,
  concurrency: 20
})

const webhookWorker = new Worker(WEBHOOK_DELIVERY_QUEUE, processWebhookDeliveryJob, {
  connection: bullmqConnectionOptions,
  concurrency: 10
})

const maintenanceWorker = new Worker(MAINTENANCE_QUEUE, processCleanupNotificationsJob, {
  connection: bullmqConnectionOptions,
  concurrency: 1
})

notificationWorker.on('completed', (job) => {
  console.info(`[worker] notification delivery completed jobId=${job.id}`)
})

notificationWorker.on('failed', (job, error) => {
  console.error('[worker] notification delivery failed', {
    jobId: job?.id ?? null,
    attemptsMade: job?.attemptsMade ?? 0,
    data: job?.data ?? null,
    error: serializeError(error)
  })
})

webhookWorker.on('completed', (job) => {
  console.info(`[worker] webhook delivery completed jobId=${job.id}`)
})

webhookWorker.on('failed', (job, error) => {
  console.error('[worker] webhook delivery failed', {
    jobId: job?.id ?? null,
    attemptsMade: job?.attemptsMade ?? 0,
    data: job?.data ?? null,
    error: serializeError(error)
  })
})

maintenanceWorker.on('completed', (job, result) => {
  const deleted =
    result && typeof result === 'object' && 'deletedCount' in result
      ? (result as { deletedCount?: number }).deletedCount || 0
      : 0

  console.info(`[worker] cleanup completed jobId=${job.id} deleted=${deleted}`)
})

maintenanceWorker.on('failed', (job, error) => {
  console.error('[worker] cleanup failed', {
    jobId: job?.id ?? null,
    attemptsMade: job?.attemptsMade ?? 0,
    data: job?.data ?? null,
    error: serializeError(error)
  })
})

await Promise.all([
  notificationWorker.waitUntilReady(),
  webhookWorker.waitUntilReady(),
  maintenanceWorker.waitUntilReady()
])

await scheduleCleanupJob(env.NOTIFICATION_TTL_DAYS)

console.info('[worker] Pigeon worker started')

let isShuttingDown = false

const shutdown = async () => {
  if (isShuttingDown) {
    return
  }

  isShuttingDown = true
  console.info('[worker] Shutting down...')

  await Promise.allSettled([
    notificationWorker.close(),
    webhookWorker.close(),
    maintenanceWorker.close(),
    closeQueues(),
    closeRedisClient(),
    pool.end()
  ])
}

process.on('SIGINT', () => {
  void shutdown()
})

process.on('SIGTERM', () => {
  void shutdown()
})
