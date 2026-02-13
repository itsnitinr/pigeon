'use client'

import type { NotificationRecord } from '@pigeon/shared'
import * as Popover from '@radix-ui/react-popover'
import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'

import { useNotifications } from '../hooks/use-notifications'

function cx(...values: Array<string | undefined | false | null>): string {
  return values.filter(Boolean).join(' ')
}

export interface NotificationBellClassNames {
  root?: string
  trigger?: string
  icon?: string
  badge?: string
  statusDot?: string
  statusDotConnected?: string
  statusDotConnecting?: string
  statusDotDisconnected?: string
  panel?: string
  header?: string
  title?: string
  subtitle?: string
  headerActions?: string
  secondaryButton?: string
  primaryButton?: string
  content?: string
  state?: string
  skeletonList?: string
  skeletonItem?: string
  skeletonLineShort?: string
  skeletonLineLong?: string
  error?: string
  empty?: string
  emptyIcon?: string
  emptyTitle?: string
  emptyDescription?: string
  list?: string
  item?: string
  itemUnread?: string
  itemHeader?: string
  itemType?: string
  time?: string
  itemTitle?: string
  itemBody?: string
  itemActions?: string
  textButton?: string
  dangerTextButton?: string
  readPill?: string
  footer?: string
}

export interface NotificationBellStyles {
  root?: CSSProperties
  trigger?: CSSProperties
  badge?: CSSProperties
  panel?: CSSProperties
  header?: CSSProperties
  title?: CSSProperties
  subtitle?: CSSProperties
  headerActions?: CSSProperties
  content?: CSSProperties
  state?: CSSProperties
  skeletonList?: CSSProperties
  skeletonItem?: CSSProperties
  skeletonLineShort?: CSSProperties
  skeletonLineLong?: CSSProperties
  error?: CSSProperties
  empty?: CSSProperties
  emptyIcon?: CSSProperties
  emptyTitle?: CSSProperties
  emptyDescription?: CSSProperties
  list?: CSSProperties
  item?: CSSProperties
  itemHeader?: CSSProperties
  itemType?: CSSProperties
  time?: CSSProperties
  itemTitle?: CSSProperties
  itemBody?: CSSProperties
  itemActions?: CSSProperties
  textButton?: CSSProperties
  readPill?: CSSProperties
  footer?: CSSProperties
}

export type NotificationBellStatusVisibility = 'always' | 'on-issues' | 'hidden'
export type NotificationBellColorMode = 'auto' | 'light' | 'dark'

export interface NotificationBellLabels {
  panelTitle: string
  loadingText: string
  errorText: string
  retryText: string
  emptyTitle: string
  emptyDescription: string
  refreshText: string
  markAllReadText: string
  markReadText: string
  archiveText: string
  readText: string
  loadMoreText: string
  loadingMoreText: string
  allCaughtUpText: string
  connectedText: string
  reconnectingText: string
  disconnectedText: string
  openNotificationsText: string
}

export interface NotificationBellActions {
  refresh: boolean
  markAllRead: boolean
  markRead: boolean
  archive: boolean
  loadMore: boolean
  footer: boolean
}

export interface NotificationBellProps {
  pageSize?: number
  panelTitle?: string
  minPanelHeight?: number
  maxPanelHeight?: number
  loadingSkeletonCount?: number
  showSkeletonOnLoading?: boolean
  className?: string
  style?: CSSProperties
  classNames?: NotificationBellClassNames
  styles?: NotificationBellStyles
  labels?: Partial<NotificationBellLabels>
  actions?: Partial<NotificationBellActions>
  statusIndicatorMode?: NotificationBellStatusVisibility
  connectionLabelMode?: NotificationBellStatusVisibility
  colorMode?: NotificationBellColorMode
  showUnreadBadge?: boolean
  maxUnreadBadge?: number
  getUnreadSummaryLabel?: (unreadCount: number) => string
  getTriggerAriaLabel?: (unreadCount: number) => string
  unstyled?: boolean
}

const DEFAULT_CLASSES: Required<NotificationBellClassNames> = {
  root: 'relative inline-flex text-neutral-900 dark:text-neutral-100',
  trigger:
    'group relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 shadow-sm transition-all duration-150 hover:border-neutral-300 hover:bg-neutral-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-600 dark:hover:bg-neutral-800',
  icon: 'h-4 w-4 transition-transform duration-150 group-hover:scale-105',
  badge:
    'absolute -right-1.5 -top-1.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-semibold leading-none text-white shadow-sm dark:border-neutral-900',
  statusDot:
    'absolute -bottom-1 -left-1 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-neutral-900',
  statusDotConnected: 'bg-emerald-500',
  statusDotConnecting: 'bg-amber-500 animate-pulse',
  statusDotDisconnected: 'bg-red-500',
  panel:
    'z-50 w-[min(28rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-neutral-200/90 bg-white/95 text-neutral-900 shadow-[0_18px_50px_-12px_rgba(15,23,42,0.28)] backdrop-blur data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 dark:border-neutral-700/90 dark:bg-neutral-900/95 dark:text-neutral-100 dark:shadow-[0_18px_50px_-12px_rgba(2,6,23,0.8)]',
  header:
    'flex items-start justify-between gap-3 border-b border-neutral-200 bg-neutral-50/60 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/50',
  title: 'm-0 text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100',
  subtitle:
    'mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400',
  headerActions: 'inline-flex items-center gap-2',
  secondaryButton:
    'h-8 rounded-md border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800',
  primaryButton:
    'h-8 rounded-md bg-neutral-900 px-3 text-xs font-medium text-neutral-100 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white',
  content: 'overflow-auto px-3 py-2.5',
  state:
    'my-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  skeletonList: 'my-2 grid gap-2.5',
  skeletonItem:
    'rounded-lg border border-neutral-200 bg-white px-3.5 py-3 dark:border-neutral-700 dark:bg-neutral-900',
  skeletonLineShort: 'h-3 w-1/3 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700',
  skeletonLineLong: 'mt-2 h-3 w-full animate-pulse rounded bg-neutral-200 dark:bg-neutral-700',
  error:
    'my-2 grid gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300',
  empty:
    'my-2 grid min-h-[190px] place-items-center rounded-xl border border-dashed border-neutral-300 bg-gradient-to-b from-neutral-50 to-white px-5 py-6 text-center dark:border-neutral-700 dark:from-neutral-900 dark:to-neutral-900/80',
  emptyIcon:
    'mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  emptyTitle: 'm-0 text-sm font-semibold text-neutral-800 dark:text-neutral-100',
  emptyDescription:
    'mt-1 block max-w-[28ch] text-xs leading-5 text-neutral-500 dark:text-neutral-400',
  list: 'grid gap-2.5 pb-1',
  item: 'group rounded-lg border border-neutral-200 bg-white px-3.5 py-3 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition-colors hover:border-neutral-300 hover:bg-neutral-50/60 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/60',
  itemUnread:
    'border-neutral-300 bg-neutral-50 ring-1 ring-neutral-200 dark:border-neutral-600 dark:bg-neutral-800 dark:ring-neutral-700',
  itemHeader: 'flex items-center justify-between gap-2',
  itemType:
    'inline-flex h-5 items-center rounded-full border border-neutral-200 bg-white px-2 text-[10px] font-medium uppercase tracking-wide text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300',
  time: 'text-[11px] font-medium text-neutral-500 dark:text-neutral-400',
  itemTitle: 'mt-2 text-sm font-semibold leading-5 text-neutral-900 dark:text-neutral-100',
  itemBody: 'mt-1 text-xs leading-5 text-neutral-600 dark:text-neutral-300',
  itemActions: 'mt-2.5 flex items-center justify-end gap-1.5',
  textButton:
    'h-7 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800',
  dangerTextButton:
    'h-7 rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950',
  readPill:
    'inline-flex h-6 items-center rounded-full border border-neutral-200 bg-neutral-100 px-2 text-[11px] font-medium text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400',
  footer:
    'flex items-center justify-between gap-2 border-t border-neutral-200 bg-neutral-50/60 px-4 py-3 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-300',
}

const LIGHT_MODE_CLASSES: Required<NotificationBellClassNames> = {
  ...DEFAULT_CLASSES,
  root: 'relative inline-flex text-neutral-900',
  trigger:
    'group relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 shadow-sm transition-all duration-150 hover:border-neutral-300 hover:bg-neutral-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2',
  badge:
    'absolute -right-1.5 -top-1.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-semibold leading-none text-white shadow-sm',
  statusDot: 'absolute -bottom-1 -left-1 h-2.5 w-2.5 rounded-full ring-2 ring-white',
  panel:
    'z-50 w-[min(28rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-neutral-200/90 bg-white/95 text-neutral-900 shadow-[0_18px_50px_-12px_rgba(15,23,42,0.28)] backdrop-blur data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
  header:
    'flex items-start justify-between gap-3 border-b border-neutral-200 bg-neutral-50/60 px-4 py-3',
  title: 'm-0 text-sm font-semibold tracking-tight text-neutral-900',
  subtitle: 'mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500',
  secondaryButton:
    'h-8 rounded-md border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50',
  primaryButton:
    'h-8 rounded-md bg-neutral-900 px-3 text-xs font-medium text-neutral-100 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50',
  state:
    'my-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 shadow-sm',
  skeletonItem: 'rounded-lg border border-neutral-200 bg-white px-3.5 py-3',
  skeletonLineShort: 'h-3 w-1/3 animate-pulse rounded bg-neutral-200',
  skeletonLineLong: 'mt-2 h-3 w-full animate-pulse rounded bg-neutral-200',
  error:
    'my-2 grid gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm',
  empty:
    'my-2 grid min-h-[190px] place-items-center rounded-xl border border-dashed border-neutral-300 bg-gradient-to-b from-neutral-50 to-white px-5 py-6 text-center',
  emptyIcon:
    'mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 shadow-sm',
  emptyTitle: 'm-0 text-sm font-semibold text-neutral-800',
  emptyDescription: 'mt-1 block max-w-[28ch] text-xs leading-5 text-neutral-500',
  item: 'group rounded-lg border border-neutral-200 bg-white px-3.5 py-3 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition-colors hover:border-neutral-300 hover:bg-neutral-50/60',
  itemUnread: 'border-neutral-300 bg-neutral-50 ring-1 ring-neutral-200',
  itemType:
    'inline-flex h-5 items-center rounded-full border border-neutral-200 bg-white px-2 text-[10px] font-medium uppercase tracking-wide text-neutral-600',
  time: 'text-[11px] font-medium text-neutral-500',
  itemTitle: 'mt-2 text-sm font-semibold leading-5 text-neutral-900',
  itemBody: 'mt-1 text-xs leading-5 text-neutral-600',
  textButton:
    'h-7 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100',
  dangerTextButton:
    'h-7 rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100',
  readPill:
    'inline-flex h-6 items-center rounded-full border border-neutral-200 bg-neutral-100 px-2 text-[11px] font-medium text-neutral-500',
  footer:
    'flex items-center justify-between gap-2 border-t border-neutral-200 bg-neutral-50/60 px-4 py-3 text-xs font-medium text-neutral-600',
}

const EMPTY_CLASSES: Required<NotificationBellClassNames> = {
  root: '',
  trigger: '',
  icon: '',
  badge: '',
  statusDot: '',
  statusDotConnected: '',
  statusDotConnecting: '',
  statusDotDisconnected: '',
  panel: '',
  header: '',
  title: '',
  subtitle: '',
  headerActions: '',
  secondaryButton: '',
  primaryButton: '',
  content: '',
  state: '',
  skeletonList: '',
  skeletonItem: '',
  skeletonLineShort: '',
  skeletonLineLong: '',
  error: '',
  empty: '',
  emptyIcon: '',
  emptyTitle: '',
  emptyDescription: '',
  list: '',
  item: '',
  itemUnread: '',
  itemHeader: '',
  itemType: '',
  time: '',
  itemTitle: '',
  itemBody: '',
  itemActions: '',
  textButton: '',
  dangerTextButton: '',
  readPill: '',
  footer: '',
}

const DEFAULT_LABELS: NotificationBellLabels = {
  panelTitle: 'Notifications',
  loadingText: 'Loading latest updates...',
  errorText: 'Something failed while loading notifications.',
  retryText: 'Retry',
  emptyTitle: 'No notifications yet.',
  emptyDescription: 'New events will appear here in real time.',
  refreshText: 'Refresh',
  markAllReadText: 'Mark all read',
  markReadText: 'Mark read',
  archiveText: 'Archive',
  readText: 'Read',
  loadMoreText: 'Load more',
  loadingMoreText: 'Loading...',
  allCaughtUpText: 'All caught up',
  connectedText: 'Live',
  reconnectingText: 'Reconnecting',
  disconnectedText: 'Offline',
  openNotificationsText: 'Open notifications',
}

const DEFAULT_ACTIONS: NotificationBellActions = {
  refresh: true,
  markAllRead: true,
  markRead: true,
  archive: true,
  loadMore: true,
  footer: true,
}

function formatRelativeTime(isoDate: string): string {
  const timestamp = Date.parse(isoDate)

  if (Number.isNaN(timestamp)) {
    return 'Unknown time'
  }

  const diffSeconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000))

  if (diffSeconds < 30) {
    return 'Just now'
  }

  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`
  }

  const diffMinutes = Math.floor(diffSeconds / 60)

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)

  if (diffHours < 24) {
    return `${diffHours}h ago`
  }

  const diffDays = Math.floor(diffHours / 24)

  if (diffDays < 7) {
    return `${diffDays}d ago`
  }

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function getConnectionLabel(
  status: 'connecting' | 'connected' | 'disconnected',
  labels: NotificationBellLabels,
): string {
  if (status === 'connected') {
    return labels.connectedText
  }

  if (status === 'connecting') {
    return labels.reconnectingText
  }

  return labels.disconnectedText
}

function shouldShowForStatus(
  mode: NotificationBellStatusVisibility,
  status: 'connecting' | 'connected' | 'disconnected',
): boolean {
  if (mode === 'hidden') {
    return false
  }

  if (mode === 'always') {
    return true
  }

  return status !== 'connected'
}

function NotificationIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <path
        d="M12 2.5a5.75 5.75 0 0 0-5.75 5.75v2.56c0 1.53-.55 3.01-1.55 4.17L3.3 16.6a1 1 0 0 0 .76 1.65h15.88a1 1 0 0 0 .76-1.65l-1.4-1.62a6.4 6.4 0 0 1-1.55-4.17V8.25A5.75 5.75 0 0 0 12 2.5Zm0 19a3.01 3.01 0 0 1-2.86-2h5.72A3.01 3.01 0 0 1 12 21.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

function EmptyInboxIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <path
        d="M3 13.5a2.5 2.5 0 0 1 2.5-2.5h2.38c.55 0 1.05.3 1.3.78l.64 1.22h4.36l.64-1.22a1.47 1.47 0 0 1 1.3-.78h2.38A2.5 2.5 0 0 1 21 13.5v4A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-4Zm2.5-8h13A1.5 1.5 0 0 1 20 7v4.05a3.45 3.45 0 0 0-1.5-.35h-2.38a2.47 2.47 0 0 0-2.19 1.32l-.3.58h-3.26l-.3-.58a2.47 2.47 0 0 0-2.19-1.32H5.5c-.53 0-1.03.12-1.5.35V7A1.5 1.5 0 0 1 5.5 5.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

function DotIcon({
  status,
  classNames,
}: {
  status: 'connecting' | 'connected' | 'disconnected'
  classNames: Required<NotificationBellClassNames>
}) {
  const statusClass =
    status === 'connected'
      ? classNames.statusDotConnected
      : status === 'connecting'
        ? classNames.statusDotConnecting
        : classNames.statusDotDisconnected

  return <span className={cx(classNames.statusDot, statusClass)} aria-hidden="true" />
}

function NotificationRow({
  notification,
  classNames,
  styles,
  labels,
  actions,
  onMarkRead,
  onArchive,
}: {
  notification: NotificationRecord
  classNames: Required<NotificationBellClassNames>
  styles?: NotificationBellStyles
  labels: NotificationBellLabels
  actions: NotificationBellActions
  onMarkRead: (notificationId: string) => Promise<void>
  onArchive: (notificationId: string) => Promise<void>
}) {
  const unread = notification.readAt === null

  return (
    <article className={cx(classNames.item, unread && classNames.itemUnread)} style={styles?.item}>
      <div className={classNames.itemHeader} style={styles?.itemHeader}>
        <span className={classNames.itemType} style={styles?.itemType}>
          {notification.type}
        </span>
        <time className={classNames.time} style={styles?.time} dateTime={notification.createdAt}>
          {formatRelativeTime(notification.createdAt)}
        </time>
      </div>
      <h4 className={classNames.itemTitle} style={styles?.itemTitle}>
        {notification.title}
      </h4>
      {notification.body ? (
        <p className={classNames.itemBody} style={styles?.itemBody}>
          {notification.body}
        </p>
      ) : null}
      <div className={classNames.itemActions} style={styles?.itemActions}>
        {unread && actions.markRead ? (
          <button
            type="button"
            className={classNames.textButton}
            style={styles?.textButton}
            onClick={() => void onMarkRead(notification.id)}
          >
            {labels.markReadText}
          </button>
        ) : null}
        {!unread ? (
          <span className={classNames.readPill} style={styles?.readPill}>
            {labels.readText}
          </span>
        ) : null}
        {actions.archive ? (
          <button
            type="button"
            className={classNames.dangerTextButton}
            style={styles?.textButton}
            onClick={() => void onArchive(notification.id)}
          >
            {labels.archiveText}
          </button>
        ) : null}
      </div>
    </article>
  )
}

function LoadingSkeleton({
  count,
  classNames,
  styles,
}: {
  count: number
  classNames: Required<NotificationBellClassNames>
  styles?: NotificationBellStyles
}) {
  const skeletonKeys = Array.from({ length: count }, (_, index) => `skeleton-${index + 1}`)

  return (
    <div className={classNames.skeletonList} style={styles?.skeletonList} aria-hidden="true">
      {skeletonKeys.map((key) => (
        <div key={key} className={classNames.skeletonItem} style={styles?.skeletonItem}>
          <div className={classNames.skeletonLineShort} style={styles?.skeletonLineShort} />
          <div className={classNames.skeletonLineLong} style={styles?.skeletonLineLong} />
          <div className={classNames.skeletonLineLong} style={styles?.skeletonLineLong} />
        </div>
      ))}
    </div>
  )
}

export function NotificationBell({
  pageSize = 20,
  panelTitle,
  minPanelHeight = 280,
  maxPanelHeight = 460,
  loadingSkeletonCount = 4,
  showSkeletonOnLoading = true,
  className,
  style,
  classNames: classNamesProp,
  styles,
  labels: labelsProp,
  actions: actionsProp,
  statusIndicatorMode = 'on-issues',
  connectionLabelMode = 'on-issues',
  colorMode = 'auto',
  showUnreadBadge = true,
  maxUnreadBadge = 99,
  getUnreadSummaryLabel,
  getTriggerAriaLabel,
  unstyled = false,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const forceDarkClass = colorMode === 'dark' ? 'dark' : undefined

  const baseClassNames: Required<NotificationBellClassNames> = unstyled
    ? EMPTY_CLASSES
    : colorMode === 'light'
      ? LIGHT_MODE_CLASSES
      : DEFAULT_CLASSES

  const classNames: Required<NotificationBellClassNames> = {
    ...baseClassNames,
    ...(classNamesProp ?? {}),
  }
  const labels: NotificationBellLabels = {
    ...DEFAULT_LABELS,
    ...(panelTitle ? { panelTitle } : {}),
    ...(labelsProp ?? {}),
  }
  const actions: NotificationBellActions = {
    ...DEFAULT_ACTIONS,
    ...(actionsProp ?? {}),
  }

  const {
    notifications,
    unreadCount,
    hasMore,
    isLoading,
    isFetchingMore,
    error,
    connectionStatus,
    fetchMore,
    markRead,
    markAllRead,
    archive,
    refresh,
  } = useNotifications({ pageSize })

  const panelContentStyle = useMemo<CSSProperties>(
    () => ({
      minHeight: `${minPanelHeight}px`,
      maxHeight: `${maxPanelHeight}px`,
      ...styles?.content,
    }),
    [maxPanelHeight, minPanelHeight, styles?.content],
  )
  const badgeLabel = unreadCount > maxUnreadBadge ? `${maxUnreadBadge}+` : String(unreadCount)
  const unreadSummaryLabel = getUnreadSummaryLabel
    ? getUnreadSummaryLabel(unreadCount)
    : unreadCount === 0
      ? labels.allCaughtUpText
      : `${unreadCount} unread`
  const triggerAriaLabel = getTriggerAriaLabel
    ? getTriggerAriaLabel(unreadCount)
    : unreadCount > 0
      ? `${unreadCount} unread notifications`
      : labels.openNotificationsText

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div
        className={cx(classNames.root, forceDarkClass, className)}
        style={{
          ...styles?.root,
          ...style,
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={classNames.trigger}
            style={styles?.trigger}
            aria-label={triggerAriaLabel}
          >
            <NotificationIcon className={classNames.icon} />
            {showUnreadBadge && unreadCount > 0 ? (
              <span className={classNames.badge} style={styles?.badge} aria-hidden="true">
                {badgeLabel}
              </span>
            ) : null}
            {shouldShowForStatus(statusIndicatorMode, connectionStatus) ? (
              <DotIcon status={connectionStatus} classNames={classNames} />
            ) : null}
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <div className={forceDarkClass}>
            <Popover.Content
              side="bottom"
              align="end"
              sideOffset={10}
              collisionPadding={8}
              className={classNames.panel}
              style={styles?.panel}
            >
              <header className={classNames.header} style={styles?.header}>
                <div>
                  <h3 className={classNames.title} style={styles?.title}>
                    {labels.panelTitle}
                  </h3>
                  {shouldShowForStatus(connectionLabelMode, connectionStatus) ? (
                    <p className={classNames.subtitle} style={styles?.subtitle}>
                      <DotIcon status={connectionStatus} classNames={classNames} />{' '}
                      {getConnectionLabel(connectionStatus, labels)}
                    </p>
                  ) : null}
                </div>
                <div className={classNames.headerActions} style={styles?.headerActions}>
                  {actions.refresh ? (
                    <button
                      type="button"
                      className={classNames.secondaryButton}
                      onClick={() => void refresh()}
                    >
                      {labels.refreshText}
                    </button>
                  ) : null}
                  {actions.markAllRead ? (
                    <button
                      type="button"
                      className={classNames.secondaryButton}
                      onClick={() => void markAllRead()}
                      disabled={notifications.length === 0 || unreadCount === 0}
                    >
                      {labels.markAllReadText}
                    </button>
                  ) : null}
                </div>
              </header>

              <div className={classNames.content} style={panelContentStyle}>
                {isLoading && showSkeletonOnLoading ? (
                  <LoadingSkeleton
                    count={Math.max(1, loadingSkeletonCount)}
                    classNames={classNames}
                    {...(styles ? { styles } : {})}
                  />
                ) : null}

                {isLoading && !showSkeletonOnLoading ? (
                  <p className={classNames.state} style={styles?.state}>
                    {labels.loadingText}
                  </p>
                ) : null}

                {!isLoading && error ? (
                  <div className={classNames.error} style={styles?.error}>
                    <p>{labels.errorText}</p>
                    <button
                      type="button"
                      className={classNames.primaryButton}
                      onClick={() => void refresh()}
                    >
                      {labels.retryText}
                    </button>
                  </div>
                ) : null}

                {!isLoading && !error && notifications.length === 0 ? (
                  <div className={classNames.empty} style={styles?.empty}>
                    <span className={classNames.emptyIcon} style={styles?.emptyIcon}>
                      <EmptyInboxIcon className="h-5 w-5" />
                    </span>
                    <p className={classNames.emptyTitle} style={styles?.emptyTitle}>
                      {labels.emptyTitle}
                    </p>
                    <span className={classNames.emptyDescription} style={styles?.emptyDescription}>
                      {labels.emptyDescription}
                    </span>
                  </div>
                ) : null}

                {!isLoading && !error && notifications.length > 0 ? (
                  <div className={classNames.list} style={styles?.list}>
                    {notifications.map((notification) => (
                      <NotificationRow
                        key={notification.id}
                        notification={notification}
                        classNames={classNames}
                        labels={labels}
                        actions={actions}
                        {...(styles ? { styles } : {})}
                        onMarkRead={async (notificationId) => {
                          await markRead(notificationId)
                        }}
                        onArchive={async (notificationId) => {
                          await archive(notificationId)
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              {actions.footer ? (
                <footer className={classNames.footer} style={styles?.footer}>
                  <span>{unreadSummaryLabel}</span>
                  {actions.loadMore && hasMore ? (
                    <button
                      type="button"
                      className={classNames.primaryButton}
                      onClick={() => void fetchMore()}
                      disabled={isFetchingMore}
                    >
                      {isFetchingMore ? labels.loadingMoreText : labels.loadMoreText}
                    </button>
                  ) : null}
                </footer>
              ) : null}
            </Popover.Content>
          </div>
        </Popover.Portal>
      </div>
    </Popover.Root>
  )
}
