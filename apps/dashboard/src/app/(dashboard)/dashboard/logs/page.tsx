import { HintCard } from '@/components/dashboard/hint-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { getDashboardContextForUser, getNotificationLogsForEnvironment } from '@/lib/dashboard-data'
import { DASHBOARD_ROUTES } from '@/lib/dashboard-navigation'
import { getAuthSession } from '@/lib/session'
import { NOTIFICATION_STATUSES } from '@flypigeon/shared'
import { redirect } from 'next/navigation'

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getAuthSession()

  if (!session) {
    redirect('/login')
  }

  const params = await searchParams
  const projectId = typeof params.projectId === 'string' ? params.projectId : null
  const environmentId = typeof params.environmentId === 'string' ? params.environmentId : null
  const userId = typeof params.userId === 'string' ? params.userId : ''
  const type = typeof params.type === 'string' ? params.type : ''
  const status = typeof params.status === 'string' ? params.status : ''
  const query = typeof params.q === 'string' ? params.q : ''

  const context = await getDashboardContextForUser(session.user.id, {
    projectId,
    environmentId,
  })

  if (!context.selectedProject || !context.selectedEnvironment) {
    redirect(DASHBOARD_ROUTES.overview)
  }

  const selectedProject = context.selectedProject
  const selectedEnvironment = context.selectedEnvironment
  const filters = {
    ...(userId ? { userId } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status: status as (typeof NOTIFICATION_STATUSES)[number] } : {}),
    ...(query ? { query } : {}),
  }
  const logs = await getNotificationLogsForEnvironment(selectedEnvironment.id, filters)

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Logs"
        title="Notification Event History"
        description="Use filters to isolate message delivery, read, and archive behavior for specific users or event types."
        contextBadges={[`project: ${selectedProject.name}`, `env: ${selectedEnvironment.name}`]}
      />

      <HintCard
        title="How to debug with logs"
        hints={[
          'Start with User ID and Type filters to narrow down a single notification journey.',
          'Status shows queue state: queued, delivered, or failed.',
          'Read and Archived timestamps help separate delivery issues from product UX behavior.',
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Notification Logs</CardTitle>
          <CardDescription>
            Search logs for project <strong>{selectedProject.name}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="grid gap-3 rounded-md border p-3 md:grid-cols-5 md:items-end"
            method="GET"
          >
            <input type="hidden" name="projectId" value={selectedProject.id} />
            <input type="hidden" name="environmentId" value={selectedEnvironment.id} />
            <div className="grid gap-1">
              <Label htmlFor="user-filter">User ID</Label>
              <Input
                id="user-filter"
                name="userId"
                defaultValue={userId}
                placeholder="demo-user-001"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="type-filter">Type</Label>
              <Input id="type-filter" name="type" defaultValue={type} placeholder="order.shipped" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="status-filter">Status</Label>
              <Select
                id="status-filter"
                name="status"
                defaultValue={status}
                placeholder="Any"
                options={NOTIFICATION_STATUSES.map((statusValue) => ({
                  label: statusValue,
                  value: statusValue,
                }))}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="query-filter">Search</Label>
              <Input id="query-filter" name="q" defaultValue={query} placeholder="title/body" />
            </div>
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Apply
            </button>
          </form>

          <div className="overflow-auto rounded-md border">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Read</th>
                  <th className="px-3 py-2">Archived</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      No notifications matched your filters.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-t">
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {log.createdAt.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-medium">{log.externalUserId}</td>
                      <td className="px-3 py-2">{log.type}</td>
                      <td className="px-3 py-2">{log.title}</td>
                      <td className="px-3 py-2">{log.status}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {log.readAt ? log.readAt.toLocaleString() : '-'}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {log.archivedAt ? log.archivedAt.toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
