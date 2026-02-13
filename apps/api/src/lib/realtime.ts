import type { StreamEvent } from '@flypigeon/shared'

import { redisClient } from './redis'

export interface RealtimeEventEnvelope {
  id: string
  event: StreamEvent['event']
  data: StreamEvent['data']
  timestamp: string
}

const STREAM_MAX_LEN = 200

export function getUserEventChannel(environmentId: string, externalUserId: string): string {
  return `pigeon:events:${environmentId}:${externalUserId}`
}

export function getUserEventStreamKey(environmentId: string, externalUserId: string): string {
  return `pigeon:events:stream:${environmentId}:${externalUserId}`
}

export async function publishUserEvent(
  environmentId: string,
  externalUserId: string,
  event: StreamEvent['event'],
  data: StreamEvent['data'],
): Promise<RealtimeEventEnvelope> {
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
    timestamp,
  )

  if (!streamId) {
    throw new Error('Failed to append realtime event to Redis stream')
  }

  const envelope: RealtimeEventEnvelope = {
    id: streamId,
    event,
    data,
    timestamp,
  }

  await redisClient.publish(channel, JSON.stringify(envelope))

  return envelope
}

function parseStreamEntry(entryId: string, fields: string[]): RealtimeEventEnvelope | null {
  const fieldMap: Record<string, string> = {}

  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i]
    const value = fields[i + 1]

    if (!key || !value) {
      continue
    }

    fieldMap[key] = value
  }

  const event = fieldMap.event
  const timestamp = fieldMap.timestamp
  const rawData = fieldMap.data

  if (!event || !timestamp || !rawData) {
    return null
  }

  try {
    const data = JSON.parse(rawData) as StreamEvent['data']

    return {
      id: entryId,
      event: event as StreamEvent['event'],
      data,
      timestamp,
    }
  } catch {
    return null
  }
}

export async function readUserEventsSince(
  environmentId: string,
  externalUserId: string,
  lastEventId: string,
  limit = 100,
): Promise<RealtimeEventEnvelope[]> {
  const streamKey = getUserEventStreamKey(environmentId, externalUserId)
  let entries: Array<[string, string[]]> = []

  try {
    const response = await redisClient.xread(
      'COUNT',
      String(limit),
      'STREAMS',
      streamKey,
      lastEventId,
    )

    const streamEntries = response?.[0]?.[1] ?? []
    entries = streamEntries
  } catch {
    return []
  }

  return entries
    .map(([entryId, fields]) => parseStreamEntry(entryId, fields))
    .filter((entry): entry is RealtimeEventEnvelope => Boolean(entry))
}

export function parsePublishedRealtimeEvent(payload: string): RealtimeEventEnvelope | null {
  try {
    const parsed = JSON.parse(payload) as RealtimeEventEnvelope

    if (!parsed.id || !parsed.event || typeof parsed.timestamp !== 'string') {
      return null
    }

    return parsed
  } catch {
    return null
  }
}
