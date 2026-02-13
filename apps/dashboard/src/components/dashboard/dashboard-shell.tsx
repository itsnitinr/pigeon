'use client'

import { useTheme } from 'next-themes'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo } from 'react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { authClient } from '@/lib/auth-client'
import type { DashboardProject } from '@/lib/dashboard-data'
import { DASHBOARD_ROUTES, withContext } from '@/lib/dashboard-navigation'
import { cn } from '@/lib/utils'

interface DashboardShellProps {
  user: {
    name: string | null
    email: string
  }
  projects: DashboardProject[]
  children: React.ReactNode
}

const NAV_ITEMS = [
  {
    href: DASHBOARD_ROUTES.overview,
    label: 'Overview',
    hint: 'Project status and shortcuts',
  },
  {
    href: DASHBOARD_ROUTES.projects,
    label: 'Projects',
    hint: 'Create and manage project scope',
  },
  {
    href: DASHBOARD_ROUTES.members,
    label: 'Members',
    hint: 'Invite collaborators and set roles',
  },
  {
    href: DASHBOARD_ROUTES.apiKeys,
    label: 'API Keys',
    hint: 'Create credentials for server calls',
  },
  {
    href: DASHBOARD_ROUTES.logs,
    label: 'Logs',
    hint: 'Filter and inspect notification events',
  },
  {
    href: DASHBOARD_ROUTES.users,
    label: 'Users',
    hint: 'Inspect end-user notification history',
  },
  {
    href: DASHBOARD_ROUTES.templates,
    label: 'Templates',
    hint: 'Reusable message templates by type',
  },
  {
    href: DASHBOARD_ROUTES.webhooks,
    label: 'Webhooks',
    hint: 'Delivery endpoints and retry attempts',
  },
]

function getInitials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/\s+/)

  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  }

  return nameOrEmail.slice(0, 2).toUpperCase()
}

export function DashboardShell({ user, projects, children }: DashboardShellProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selectedProjectIdFromQuery = searchParams.get('projectId')
  const selectedEnvironmentIdFromQuery = searchParams.get('environmentId')

  const selectedProject = useMemo(
    () =>
      projects.find((project) => project.id === selectedProjectIdFromQuery) ?? projects[0] ?? null,
    [projects, selectedProjectIdFromQuery],
  )

  const environmentOptions = (selectedProject?.environments ?? []).map((environment) => ({
    label: environment.name,
    value: environment.id,
  }))

  const selectedEnvironment =
    selectedProject?.environments.find(
      (environment) => environment.id === selectedEnvironmentIdFromQuery,
    ) ??
    selectedProject?.environments[0] ??
    null

  const context = {
    projectId: selectedProject?.id ?? null,
    environmentId: selectedEnvironment?.id ?? null,
  }
  const isDarkMode = resolvedTheme === 'dark'

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 lg:h-screen lg:overflow-hidden">
      <div className="grid min-h-screen w-full grid-cols-1 lg:h-full lg:min-h-0 lg:grid-cols-[280px_1fr]">
        <aside className="border-r bg-card/80 px-4 py-6 backdrop-blur lg:h-full lg:overflow-hidden">
          <div className="mb-6 px-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Pigeon
            </p>
            <h2 className="mt-1 text-xl font-semibold">Dashboard</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Configure delivery and monitor notification health.
            </p>
          </div>

          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Workspace
          </p>
          <nav className="grid gap-1.5">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={withContext(item.href, context)}
                className={cn(
                  'rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-accent/70',
                  pathname === item.href
                    ? 'border-border bg-accent text-accent-foreground shadow-sm'
                    : 'text-muted-foreground',
                )}
              >
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.hint}</p>
              </Link>
            ))}
          </nav>
          <Separator className="my-6" />

          <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Quick Start
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              1. Select a project and environment.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">2. Create API keys and templates.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              3. Use Logs and Webhooks to debug delivery.
            </p>
          </div>
        </aside>

        <div className="flex min-h-screen flex-col lg:h-full lg:min-h-0 lg:overflow-hidden">
          <header className="flex flex-col gap-4 border-b bg-background/80 px-6 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
            <div className="grid gap-1">
              <h1 className="text-lg font-semibold">Control Panel</h1>
              <p className="text-sm text-muted-foreground">
                Manage your projects, environments, templates, and deliveries.
              </p>
            </div>

            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-col gap-1 sm:w-[220px]">
                <span className="text-xs font-medium text-muted-foreground">Project</span>
                <Select
                  value={selectedProject?.id ?? ''}
                  onChange={(event) => {
                    const nextProjectId = event.target.value
                    const nextProject =
                      projects.find((project) => project.id === nextProjectId) ?? null

                    router.push(
                      withContext(pathname, {
                        projectId: nextProjectId,
                        environmentId: nextProject?.environments[0]?.id ?? null,
                      }),
                    )
                  }}
                  options={projects.map((project) => ({
                    label: project.name,
                    value: project.id,
                  }))}
                  {...(projects.length === 0 ? { placeholder: 'No projects' } : {})}
                  disabled={projects.length === 0}
                />
              </div>

              <div className="flex flex-col gap-1 sm:w-[180px]">
                <span className="text-xs font-medium text-muted-foreground">Environment</span>
                <Select
                  value={selectedEnvironment?.id ?? ''}
                  onChange={(event) =>
                    router.push(
                      withContext(pathname, {
                        projectId: selectedProject?.id ?? null,
                        environmentId: event.target.value,
                      }),
                    )
                  }
                  options={environmentOptions}
                  {...(environmentOptions.length === 0 ? { placeholder: 'No envs' } : {})}
                  disabled={environmentOptions.length === 0}
                />
              </div>

              <details className="relative">
                <summary className="flex list-none cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm [&::-webkit-details-marker]:hidden">
                  <Avatar fallback={getInitials(user.name ?? user.email)} />
                  <span className="hidden text-sm font-medium sm:block">Account</span>
                  <span className="text-xs text-muted-foreground">▾</span>
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
                  <p className="truncate text-sm font-semibold">{user.name ?? 'Dashboard User'}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  <Separator className="my-3" />
                  <label className="flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm">
                    <span>Dark mode</span>
                    <input
                      type="checkbox"
                      checked={isDarkMode}
                      onChange={() => setTheme(isDarkMode ? 'light' : 'dark')}
                      className="h-4 w-4 accent-primary"
                    />
                  </label>
                  <Separator className="my-3" />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      void (async () => {
                        await authClient.signOut()
                        window.location.assign('/login')
                      })()
                    }}
                  >
                    Sign out
                  </Button>
                </div>
              </details>
            </div>
          </header>

          <main className="flex-1 px-6 py-6 lg:min-h-0 lg:overflow-y-auto">
            {selectedProject ? (
              <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
                <Badge variant="secondary">project: {selectedProject.slug}</Badge>
                <Badge variant="outline">role: {selectedProject.role}</Badge>
                {selectedEnvironment ? (
                  <Badge variant="muted">env: {selectedEnvironment.name}</Badge>
                ) : null}
              </div>
            ) : null}

            <div className="w-full">{children}</div>
          </main>
        </div>
      </div>
    </div>
  )
}
