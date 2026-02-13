import type { StreamEvent } from '@pigeon/shared'

import { redisClient } from './redis'

const STREAM_MAX_LEN = 200

function getUserEventChannel(environmentId: string, externalUserId: string): string {
  return `pigeon:events:${environmentId}:${externalUserId}`
}

function getUserEventStreamKey(environmentId: string, externalUserId: string): string {
  return `pigeon:events:stream:${environmentId}:${externalUserId}`
}

export async function publishUserEvent(
  environmentId: string,
  externalUserId: string,
  event: StreamEvent['event'],
  data: StreamEvent['data']
): Promise<void> {
  const timestamp = new Date().toISOString()
  const streamKey = getUserEventStreamKey(environmentId, externalUserId)
  const channel = getUserEventChannel(environmentId, externalUserId)

  const streamId = await redisClient.xadd(
    streamKey,
    'MAXLEN',
    '~',
    STREAM_MAX_LEN,
    '*',
    'event',
    event,
    'data',
    JSON.stringify(data),
    'timestamp',
    timestamp
  )

  if (!streamId) {
    throw new Error('Failed to append realtime event to Redis stream')
  }

  await redisClient.publish(
    channel,
    JSON.stringify({
      id: streamId,
      event,
      data,
      timestamp
    })
  )
}
