import Link from 'next/link'

import { HintCard } from '@/components/dashboard/hint-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DASHBOARD_ROUTES, withContext } from '@/lib/dashboard-navigation'
import { requireDashboardPageContext } from '@/lib/dashboard-page'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const context = await requireDashboardPageContext(await searchParams)
  const contextParams = {
    projectId: context.project.id,
    environmentId: context.environment?.id ?? null,
  }

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Overview"
        title="Workspace Control Center"
        description="This dashboard is scoped by project and environment. Any changes you make here affect only the active context shown below."
        contextBadges={[
          `project: ${context.project.name}`,
          `environment: ${context.environment?.name ?? 'none'}`,
          `role: ${context.project.role}`,
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Project Health</CardTitle>
            <CardDescription>Current context and operational scope.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              You are currently scoped to <strong>{context.project.name}</strong> (
              {context.environment?.name ?? 'no environment selected'}).
            </p>
            <p>
              Tip: switch environments from the top bar before creating keys, templates, or
              webhooks.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recommended Flow</CardTitle>
            <CardDescription>Suggested setup order for new projects.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Create API keys for backend access.</p>
            <p>2. Define templates for reusable notification types.</p>
            <p>3. Configure webhooks to track delivery events.</p>
            <p>4. Use logs and user inspector for troubleshooting.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Links</CardTitle>
            <CardDescription>Jump directly into common workflows.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <Link
              className="rounded-md border px-3 py-2 hover:bg-accent"
              href={withContext(DASHBOARD_ROUTES.logs, contextParams)}
            >
              View notification logs
            </Link>
            <Link
              className="rounded-md border px-3 py-2 hover:bg-accent"
              href={withContext(DASHBOARD_ROUTES.apiKeys, contextParams)}
            >
              Manage API keys
            </Link>
            <Link
              className="rounded-md border px-3 py-2 hover:bg-accent"
              href={withContext(DASHBOARD_ROUTES.webhooks, contextParams)}
            >
              Configure webhook endpoints
            </Link>
          </CardContent>
        </Card>
      </div>

      <HintCard
        title="How context works"
        description="Most confusion comes from environment scoping. Keep this mental model in mind:"
        hints={[
          'API keys, templates, logs, users, and webhooks are environment-level resources.',
          'Members are project-level and shared across all environments in that project.',
          'Changing project or environment in the top bar updates every dashboard page context.',
        ]}
      />
    </section>
  )
}
