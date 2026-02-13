export const ENVIRONMENT_NAMES = ['development', 'production'] as const

export const PROJECT_MEMBER_ROLES = ['owner', 'member'] as const

export const NOTIFICATION_STATUSES = ['queued', 'delivered', 'failed'] as const

export const WEBHOOK_EVENTS = ['notification.created', 'notification.read'] as const

export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'success', 'failed'] as const

export const API_KEY_PREFIX_BY_ENVIRONMENT = {
  development: 'pk_test_',
  production: 'pk_live_'
} as const

export const DEFAULT_USER_TOKEN_TTL_SECONDS = 60 * 60

export const DEFAULT_NOTIFICATIONS_PAGE_SIZE = 20

export const MAX_NOTIFICATIONS_PAGE_SIZE = 100

export const MAX_BATCH_SEND_SIZE = 100
