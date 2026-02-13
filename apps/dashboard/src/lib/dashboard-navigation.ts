export const DASHBOARD_ROUTES = {
  overview: '/dashboard',
  projects: '/dashboard/projects',
  members: '/dashboard/members',
  apiKeys: '/dashboard/api-keys',
  logs: '/dashboard/logs',
  users: '/dashboard/users',
  templates: '/dashboard/templates',
  webhooks: '/dashboard/webhooks',
} as const

interface ContextParams {
  projectId?: string | null
  environmentId?: string | null
}

export function createContextQuery(
  context: ContextParams,
  extras: Record<string, string | undefined | null> = {},
): string {
  const searchParams = new URLSearchParams()

  if (context.projectId) {
    searchParams.set('projectId', context.projectId)
  }

  if (context.environmentId) {
    searchParams.set('environmentId', context.environmentId)
  }

  for (const [key, value] of Object.entries(extras)) {
    if (value) {
      searchParams.set(key, value)
    }
  }

  return searchParams.toString()
}

export function withContext(
  path: string,
  context: ContextParams,
  extras: Record<string, string | undefined | null> = {},
): string {
  const query = createContextQuery(context, extras)

  if (!query) {
    return path
  }

  return `${path}?${query}`
}
