import { Queue } from 'bullmq'

import { env } from './env'

const globalQueueState = globalThis as typeof globalThis & {
  __pigeonApiQueue?: Queue
}

const notificationQueue =
  globalQueueState.__pigeonApiQueue ??
  new Queue('notification-delivery', {
    connection: {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      host: new URL(env.REDIS_URL).hostname,
      port: Number(new URL(env.REDIS_URL).port || 6379),
      username: new URL(env.REDIS_URL).username || undefined,
      password: new URL(env.REDIS_URL).password || undefined,
      db: new URL(env.REDIS_URL).pathname ? Number(new URL(env.REDIS_URL).pathname.replace('/', '')) || 0 : 0
    }
  })

if (env.NODE_ENV !== 'production') {
  globalQueueState.__pigeonApiQueue = notificationQueue
}

export async function enqueueNotificationDelivery(notificationId: string): Promise<void> {
  await notificationQueue.add(
    'deliver-notification',
    {
      notificationId
    },
    {
      jobId: notificationId,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: 1000,
      removeOnFail: 1000
    }
  )
}

export async function closeQueueConnections(): Promise<void> {
  await notificationQueue.close()
}
