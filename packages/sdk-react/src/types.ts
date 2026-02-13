import type {
  ArchiveResponse,
  MarkAllReadResponse,
  MarkReadResponse,
  NotificationRecord,
  StreamEvent,
} from '@flypigeon/shared'
import type { ReactNode } from 'react'

export type PigeonConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export interface TokenProviderResult {
  token: string
  expiresAt?: string
}

export type TokenProvider = () =>
  | string
  | TokenProviderResult
  | Promise<string>
  | Promise<TokenProviderResult>

export interface PigeonProviderProps {
  apiUrl: string
  tokenProvider: TokenProvider
  children: ReactNode
  reconnectInitialDelayMs?: number
  reconnectMaxDelayMs?: number
}

export interface UseNotificationsOptions {
  pageSize?: number
  unread?: boolean
}

export interface UseNotificationsResult {
  notifications: NotificationRecord[]
  unreadCount: number
  hasMore: boolean
  isLoading: boolean
  isFetchingMore: boolean
  error: Error | null
  connectionStatus: PigeonConnectionStatus
  refresh: () => Promise<void>
  fetchMore: () => Promise<void>
  markRead: (notificationId: string) => Promise<MarkReadResponse>
  markAllRead: () => Promise<MarkAllReadResponse>
  archive: (notificationId: string) => Promise<ArchiveResponse>
}

export interface PigeonContextValue {
  apiUrl: string
  connectionStatus: PigeonConnectionStatus
  requestJson: <TResponse>(params: {
    path: string
    method?: 'GET' | 'POST'
    body?: unknown
  }) => Promise<TResponse>
  subscribeToEvents: (listener: (event: StreamEvent) => void) => () => void
}
