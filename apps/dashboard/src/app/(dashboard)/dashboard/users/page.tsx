import Link from 'next/link'

import { HintCard } from '@/components/dashboard/hint-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getDashboardContextForUser,
  getEndUsersForEnvironment,
  getNotificationsForEndUser,
} from '@/lib/dashboard-data'
import { DASHBOARD_ROUTES, withContext } from '@/lib/dashboard-navigation'
import { getAuthSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export default async function UsersPage({
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
  const query = typeof params.q === 'string' ? params.q : ''
  const selectedEndUserId =
    typeof params.selectedEndUserId === 'string' ? params.selectedEndUserId : null

  const context = await getDashboardContextForUser(session.user.id, {
    projectId,
    environmentId,
  })

  if (!context.selectedProject || !context.selectedEnvironment) {
    redirect(DASHBOARD_ROUTES.overview)
  }

  const selectedProject = context.selectedProject
  const selectedEnvironment = context.selectedEnvironment
  const users = await getEndUsersForEnvironment(selectedEnvironment.id, query || undefined)
  const selectedUser = users.find((user) => user.id === selectedEndUserId) ?? null
  const selectedUserNotifications = selectedUser
    ? await getNotificationsForEndUser(selectedEnvironment.id, selectedUser.id)
    : []

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Users"
        title="End-User Inspector"
        description="Inspect user timelines to debug message quality, read behavior, and archived state in a single place."
        contextBadges={[`project: ${selectedProject.name}`, `env: ${selectedEnvironment.name}`]}
      />

      <HintCard
        title="How to use user inspector"
        hints={[
          'Search by your app user identifier and select a user from the left panel.',
          'Use this page to validate what a user actually received, not just what was enqueued.',
          'Compare status and timestamps here with webhook attempts on the Webhooks page.',
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>User Inspector</CardTitle>
            <CardDescription>Browse end users in the selected environment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form method="GET" className="grid gap-2">
              <input type="hidden" name="projectId" value={selectedProject.id} />
              <input type="hidden" name="environmentId" value={selectedEnvironment.id} />
              <Label htmlFor="user-query">Search user ID</Label>
              <Input id="user-query" name="q" defaultValue={query} placeholder="demo-user-001" />
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Search
              </button>
            </form>

            <div className="max-h-[460px] space-y-2 overflow-auto rounded-md border p-2">
              {users.length === 0 ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">No end users found.</p>
              ) : (
                users.map((user) => (
                  <Link
                    key={user.id}
                    href={withContext(
                      DASHBOARD_ROUTES.users,
                      {
                        projectId: selectedProject.id,
                        environmentId: selectedEnvironment.id,
                      },
                      {
                        selectedEndUserId: user.id,
                        q: query || undefined,
                      },
                    )}
                    className={`block rounded-md px-3 py-2 text-sm ${
                      selectedUser?.id === user.id
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <p className="font-medium">{user.externalUserId}</p>
                    <p className="text-xs text-muted-foreground">
                      created {user.createdAt.toLocaleDateString()}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selectedUser ? selectedUser.externalUserId : 'Select a user'}</CardTitle>
            <CardDescription>Recent notifications for this user.</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedUser ? (
              <p className="text-sm text-muted-foreground">Choose a user from the left panel.</p>
            ) : selectedUserNotifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notifications found for this user.</p>
            ) : (
              <div className="space-y-2">
                {selectedUserNotifications.map((notification) => (
                  <div key={notification.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{notification.title}</p>
                      <span className="text-xs text-muted-foreground">{notification.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{notification.type}</p>
                    {notification.body ? <p className="mt-2 text-sm">{notification.body}</p> : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {notification.createdAt.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
