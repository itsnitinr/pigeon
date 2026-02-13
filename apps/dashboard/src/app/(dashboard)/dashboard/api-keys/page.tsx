import { HintCard } from '@/components/dashboard/hint-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createApiKeyAction, revokeApiKeyAction } from '@/lib/dashboard-actions'
import { getApiKeysForEnvironment, getDashboardContextForUser } from '@/lib/dashboard-data'
import { DASHBOARD_ROUTES, withContext } from '@/lib/dashboard-navigation'
import { getAuthSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export default async function ApiKeysPage({
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
  const newKey = typeof params.newKey === 'string' ? params.newKey : null

  const context = await getDashboardContextForUser(session.user.id, {
    projectId,
    environmentId,
  })

  if (!context.selectedProject || !context.selectedEnvironment) {
    redirect(DASHBOARD_ROUTES.overview)
  }

  const selectedProject = context.selectedProject
  const selectedEnvironment = context.selectedEnvironment
  const keys = await getApiKeysForEnvironment(selectedEnvironment.id)

  const redirectTo = withContext(DASHBOARD_ROUTES.apiKeys, {
    projectId: selectedProject.id,
    environmentId: selectedEnvironment.id,
  })

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="API Keys"
        title="Credential Management"
        description="API keys are environment-scoped credentials used by your backend to call Pigeon APIs."
        contextBadges={[`environment: ${selectedEnvironment.name}`]}
      />

      <HintCard
        title="Security hints"
        hints={[
          'Name keys by use-case (for example, production-api, queue-worker, ci-smoke-tests).',
          'A raw key is shown only once. Store it in a secret manager immediately.',
          'If a key may be leaked, revoke it and create a replacement right away.',
        ]}
      />

      <div className="grid gap-4">
        {newKey ? (
          <Card className="border-emerald-300 bg-emerald-50">
            <CardHeader>
              <CardTitle>New API Key (show once)</CardTitle>
              <CardDescription>
                Copy this key now. It cannot be retrieved again after this page reloads.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <code className="block overflow-x-auto rounded-md border bg-background px-3 py-2 text-xs">
                {newKey}
              </code>
              <a className="text-sm text-primary hover:underline" href={redirectTo}>
                Hide key
              </a>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Create API Key</CardTitle>
            <CardDescription>
              Keys are scoped to <strong>{selectedEnvironment.name}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={createApiKeyAction}
              className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end"
            >
              <input type="hidden" name="projectId" value={selectedProject.id} />
              <input type="hidden" name="environmentId" value={selectedEnvironment.id} />
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <div className="grid gap-2">
                <Label htmlFor="key-name">Name</Label>
                <Input id="key-name" name="name" placeholder="CI Server" required />
              </div>
              <Button type="submit" disabled={selectedProject.role !== 'owner'}>
                Create key
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing Keys</CardTitle>
            <CardDescription>Only key prefixes are stored and displayed.</CardDescription>
          </CardHeader>
          <CardContent>
            {keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">No API keys created yet.</p>
            ) : (
              <div className="space-y-2">
                {keys.map((key) => (
                  <div
                    key={key.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
                  >
                    <div className="text-sm">
                      <p className="font-medium">{key.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {key.keyPrefix}... · created {key.createdAt.toLocaleString()}
                      </p>
                      {key.isRevoked ? (
                        <p className="text-xs text-destructive">
                          revoked {key.revokedAt?.toLocaleString()}
                        </p>
                      ) : null}
                    </div>
                    {!key.isRevoked && selectedProject.role === 'owner' ? (
                      <form action={revokeApiKeyAction}>
                        <input type="hidden" name="projectId" value={selectedProject.id} />
                        <input type="hidden" name="environmentId" value={selectedEnvironment.id} />
                        <input type="hidden" name="apiKeyId" value={key.id} />
                        <input type="hidden" name="redirectTo" value={redirectTo} />
                        <Button variant="outline" size="sm" type="submit">
                          Revoke
                        </Button>
                      </form>
                    ) : null}
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
