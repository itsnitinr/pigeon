import { Queue } from 'bullmq'

import { env } from './env'

const globalQueueState = globalThis as typeof globalThis & {
  __pigeonApiQueue?: Queue
}

const redisUrl = new URL(env.REDIS_URL)
const redisDbPath = redisUrl.pathname.replace('/', '')

const queueConnectionOptions = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  db: redisDbPath ? Number(redisDbPath) || 0 : 0,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  ...(redisUrl.username ? { username: redisUrl.username } : {}),
  ...(redisUrl.password ? { password: redisUrl.password } : {}),
}

const notificationQueue =
  globalQueueState.__pigeonApiQueue ??
  new Queue('notification-delivery', {
    connection: queueConnectionOptions,
  })

if (env.NODE_ENV !== 'production') {
  globalQueueState.__pigeonApiQueue = notificationQueue
}

export async function enqueueNotificationDelivery(notificationId: string): Promise<void> {
  await notificationQueue.add(
    'deliver-notification',
    {
      notificationId,
    },
    {
      jobId: notificationId,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  )
}

export async function closeQueueConnections(): Promise<void> {
  await notificationQueue.close()
}
