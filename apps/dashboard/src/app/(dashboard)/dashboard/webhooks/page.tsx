import { HintCard } from '@/components/dashboard/hint-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createWebhookEndpointAction,
  deleteWebhookEndpointAction,
  updateWebhookEndpointAction,
} from '@/lib/dashboard-actions'
import {
  getDashboardContextForUser,
  getWebhookAttemptsForEnvironment,
  getWebhookEndpointsForEnvironment,
} from '@/lib/dashboard-data'
import { DASHBOARD_ROUTES, withContext } from '@/lib/dashboard-navigation'
import { getAuthSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export default async function WebhooksPage({
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
  const endpointId = typeof params.endpointId === 'string' ? params.endpointId : null

  const context = await getDashboardContextForUser(session.user.id, {
    projectId,
    environmentId,
  })

  if (!context.selectedProject || !context.selectedEnvironment) {
    redirect(DASHBOARD_ROUTES.overview)
  }

  const selectedProject = context.selectedProject
  const selectedEnvironment = context.selectedEnvironment
  const endpoints = await getWebhookEndpointsForEnvironment(selectedEnvironment.id)
  const attempts = await getWebhookAttemptsForEnvironment(
    selectedEnvironment.id,
    endpointId ?? undefined,
  )

  const redirectTo = withContext(DASHBOARD_ROUTES.webhooks, {
    projectId: selectedProject.id,
    environmentId: selectedEnvironment.id,
  })

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Webhooks"
        title="Webhook Delivery Management"
        description="Configure signed outbound event delivery and inspect retry attempts to confirm downstream integrations are healthy."
        contextBadges={[`env: ${selectedEnvironment.name}`]}
      />

      <HintCard
        title="Webhook reliability hints"
        hints={[
          'Use HTTPS endpoints that return 2xx quickly; slow responses increase retries.',
          'Rotate webhook secrets periodically and verify signatures on receiver side.',
          'Use Delivery Attempts table to identify recurring failures and response status patterns.',
        ]}
      />

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Create Webhook Endpoint</CardTitle>
            <CardDescription>
              Events should be comma-separated: <code>notification.created,notification.read</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createWebhookEndpointAction} className="grid gap-3">
              <input type="hidden" name="projectId" value={selectedProject.id} />
              <input type="hidden" name="environmentId" value={selectedEnvironment.id} />
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-1">
                  <Label htmlFor="webhook-url">Endpoint URL</Label>
                  <Input
                    id="webhook-url"
                    name="url"
                    type="url"
                    placeholder="https://example.com/webhooks"
                    required
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="webhook-secret">Signing secret</Label>
                  <Input id="webhook-secret" name="secret" placeholder="whsec_..." required />
                </div>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="webhook-events">Events</Label>
                <Input
                  id="webhook-events"
                  name="events"
                  defaultValue="notification.created,notification.read"
                  required
                />
              </div>
              <div>
                <Button type="submit">Create endpoint</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Endpoints</CardTitle>
            <CardDescription>Update endpoint details, events, and active status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {endpoints.length === 0 ? (
              <p className="text-sm text-muted-foreground">No webhook endpoints configured.</p>
            ) : (
              endpoints.map((endpoint) => (
                <div key={endpoint.id} className="rounded-lg border p-3">
                  <form action={updateWebhookEndpointAction} className="grid gap-2">
                    <input type="hidden" name="projectId" value={selectedProject.id} />
                    <input type="hidden" name="environmentId" value={selectedEnvironment.id} />
                    <input type="hidden" name="endpointId" value={endpoint.id} />
                    <input type="hidden" name="redirectTo" value={redirectTo} />
                    <Input name="url" defaultValue={endpoint.url} required />
                    <Input name="secret" defaultValue={endpoint.secret} required />
                    <Input name="events" defaultValue={endpoint.events.join(',')} required />
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" name="isActive" defaultChecked={endpoint.isActive} />
                      Active endpoint
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" type="submit">
                        Update endpoint
                      </Button>
                      <a
                        className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium"
                        href={withContext(
                          DASHBOARD_ROUTES.webhooks,
                          {
                            projectId: selectedProject.id,
                            environmentId: selectedEnvironment.id,
                          },
                          {
                            endpointId: endpoint.id,
                          },
                        )}
                      >
                        View attempts
                      </a>
                    </div>
                  </form>
                  <form action={deleteWebhookEndpointAction} className="mt-2">
                    <input type="hidden" name="projectId" value={selectedProject.id} />
                    <input type="hidden" name="environmentId" value={selectedEnvironment.id} />
                    <input type="hidden" name="endpointId" value={endpoint.id} />
                    <input type="hidden" name="redirectTo" value={redirectTo} />
                    <Button variant="destructive" type="submit">
                      Delete endpoint
                    </Button>
                  </form>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delivery Attempts</CardTitle>
            <CardDescription>
              {endpointId
                ? 'Filtered by selected endpoint.'
                : 'Showing recent attempts for all endpoints.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-md border">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Endpoint</th>
                    <th className="px-3 py-2">Event</th>
                    <th className="px-3 py-2">Attempt</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Response</th>
                    <th className="px-3 py-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                        No delivery attempts found.
                      </td>
                    </tr>
                  ) : (
                    attempts.map((attempt) => (
                      <tr key={attempt.id} className="border-t">
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {attempt.createdAt.toLocaleString()}
                        </td>
                        <td className="px-3 py-2">{attempt.webhookUrl}</td>
                        <td className="px-3 py-2">{attempt.event}</td>
                        <td className="px-3 py-2">{attempt.attemptNumber}</td>
                        <td className="px-3 py-2">{attempt.status}</td>
                        <td className="px-3 py-2">{attempt.responseStatus ?? '-'}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {attempt.error ?? '-'}
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
    </div>
  )
}
