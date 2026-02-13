'use client'

import type {
  ArchiveResponse,
  MarkAllReadResponse,
  MarkReadResponse,
  NotificationRecord,
  NotificationsListResponse,
} from '@flypigeon/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { usePigeonContext } from '../provider'
import type { UseNotificationsOptions, UseNotificationsResult } from '../types'

const DEFAULT_PAGE_SIZE = 20

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }

  return new Error(String(error))
}

function dedupeById(items: NotificationRecord[]): NotificationRecord[] {
  const seen = new Set<string>()
  const result: NotificationRecord[] = []

  for (const item of items) {
    if (seen.has(item.id)) {
      continue
    }

    seen.add(item.id)
    result.push(item)
  }

  return result
}

function withOptimisticRead(notification: NotificationRecord, readAt: string): NotificationRecord {
  if (notification.readAt) {
    return notification
  }

  return {
    ...notification,
    readAt,
  }
}

export function useNotifications(options: UseNotificationsOptions = {}): UseNotificationsResult {
  const { connectionStatus, requestJson, subscribeToEvents } = usePigeonContext()

  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const unreadOnly = options.unread ?? false

  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFetchingMore, setIsFetchingMore] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const notificationsRef = useRef(notifications)

  useEffect(() => {
    notificationsRef.current = notifications
  }, [notifications])

  const loadPage = useCallback(
    async (params: { cursor?: string; append: boolean }) => {
      const searchParams = new URLSearchParams()
      searchParams.set('limit', String(pageSize))

      if (params.cursor) {
        searchParams.set('cursor', params.cursor)
      }

      if (unreadOnly) {
        searchParams.set('unread', 'true')
      }

      const response = await requestJson<NotificationsListResponse>({
        path: `/v1/notifications?${searchParams.toString()}`,
      })

      setNotifications((current) => {
        const merged = params.append ? [...current, ...response.items] : response.items

        return dedupeById(merged)
      })
      setNextCursor(response.nextCursor)
    },
    [pageSize, requestJson, unreadOnly],
  )

  const refresh = useCallback(async () => {
    setError(null)
    setIsLoading(true)

    try {
      await loadPage({ append: false })
    } catch (caughtError) {
      setError(toError(caughtError))
      throw caughtError
    } finally {
      setIsLoading(false)
    }
  }, [loadPage])

  const fetchMore = useCallback(async () => {
    if (!nextCursor || isFetchingMore) {
      return
    }

    setError(null)
    setIsFetchingMore(true)

    try {
      await loadPage({ cursor: nextCursor, append: true })
    } catch (caughtError) {
      setError(toError(caughtError))
      throw caughtError
    } finally {
      setIsFetchingMore(false)
    }
  }, [isFetchingMore, loadPage, nextCursor])

  const markRead = useCallback(
    async (notificationId: string): Promise<MarkReadResponse> => {
      const previousState = notificationsRef.current
      const optimisticReadAt = new Date().toISOString()

      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId ? withOptimisticRead(item, optimisticReadAt) : item,
        ),
      )

      try {
        const response = await requestJson<MarkReadResponse>({
          path: `/v1/notifications/${notificationId}/read`,
          method: 'POST',
        })

        setNotifications((current) =>
          current.map((item) =>
            item.id === response.id
              ? {
                  ...item,
                  readAt: response.readAt,
                }
              : item,
          ),
        )

        return response
      } catch (caughtError) {
        setNotifications(previousState)
        setError(toError(caughtError))
        throw caughtError
      }
    },
    [requestJson],
  )

  const markAllRead = useCallback(async (): Promise<MarkAllReadResponse> => {
    const previousState = notificationsRef.current
    const optimisticReadAt = new Date().toISOString()

    setNotifications((current) => current.map((item) => withOptimisticRead(item, optimisticReadAt)))

    try {
      const response = await requestJson<MarkAllReadResponse>({
        path: '/v1/notifications/read-all',
        method: 'POST',
      })

      return response
    } catch (caughtError) {
      setNotifications(previousState)
      setError(toError(caughtError))
      throw caughtError
    }
  }, [requestJson])

  const archive = useCallback(
    async (notificationId: string): Promise<ArchiveResponse> => {
      const previousState = notificationsRef.current

      setNotifications((current) => current.filter((item) => item.id !== notificationId))

      try {
        const response = await requestJson<ArchiveResponse>({
          path: `/v1/notifications/${notificationId}/archive`,
          method: 'POST',
        })

        return response
      } catch (caughtError) {
        setNotifications(previousState)
        setError(toError(caughtError))
        throw caughtError
      }
    },
    [requestJson],
  )

  useEffect(() => {
    void refresh().catch(() => {
      // errors are already stored in hook state
    })
  }, [refresh])

  useEffect(() => {
    return subscribeToEvents((event) => {
      if (event.event === 'notification.created') {
        setNotifications((current) => {
          if (current.some((item) => item.id === event.data.id)) {
            return current
          }

          const next = [event.data, ...current]

          return unreadOnly ? next.filter((item) => item.readAt === null) : next
        })
        return
      }

      if (event.event === 'notification.read') {
        setNotifications((current) => {
          const updated = current.map((item) =>
            item.id === event.data.id
              ? {
                  ...item,
                  readAt: event.data.readAt,
                }
              : item,
          )

          return unreadOnly ? updated.filter((item) => item.readAt === null) : updated
        })
      }
    })
  }, [subscribeToEvents, unreadOnly])

  const unreadCount = useMemo(
    () => notifications.filter((item) => item.readAt === null && item.archivedAt === null).length,
    [notifications],
  )

  return {
    notifications,
    unreadCount,
    hasMore: nextCursor !== null,
    isLoading,
    isFetchingMore,
    error,
    connectionStatus,
    refresh,
    fetchMore,
    markRead,
    markAllRead,
    archive,
  }
}
