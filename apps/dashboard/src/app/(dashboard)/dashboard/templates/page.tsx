import { HintCard } from '@/components/dashboard/hint-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createTemplateAction,
  deleteTemplateAction,
  updateTemplateAction,
} from '@/lib/dashboard-actions'
import { getDashboardContextForUser, getTemplatesForEnvironment } from '@/lib/dashboard-data'
import { DASHBOARD_ROUTES, withContext } from '@/lib/dashboard-navigation'
import { getAuthSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export default async function TemplatesPage({
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

  const context = await getDashboardContextForUser(session.user.id, {
    projectId,
    environmentId,
  })

  if (!context.selectedProject || !context.selectedEnvironment) {
    redirect(DASHBOARD_ROUTES.overview)
  }

  const selectedProject = context.selectedProject
  const selectedEnvironment = context.selectedEnvironment
  const templates = await getTemplatesForEnvironment(selectedEnvironment.id)
  const redirectTo = withContext(DASHBOARD_ROUTES.templates, {
    projectId: selectedProject.id,
    environmentId: selectedEnvironment.id,
  })

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Templates"
        title="Reusable Message Templates"
        description="Templates let your app send consistent notification formats by type, with dynamic placeholders resolved by the worker."
        contextBadges={[`env: ${selectedEnvironment.name}`]}
      />

      <HintCard
        title="Template writing tips"
        hints={[
          'Use event-like types such as order.shipped or invoice.paid for maintainability.',
          'Keep titles short and action-oriented; put details in body content.',
          'Placeholders use double braces, for example {{orderId}} and {{trackingNumber}}.',
        ]}
      />

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Create Template</CardTitle>
            <CardDescription>
              Use <code>{'{{variable}}'}</code> placeholders for dynamic interpolation in worker.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createTemplateAction} className="grid gap-3">
              <input type="hidden" name="projectId" value={selectedProject.id} />
              <input type="hidden" name="environmentId" value={selectedEnvironment.id} />
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-1">
                  <Label htmlFor="template-type">Type</Label>
                  <Input id="template-type" name="type" placeholder="order.shipped" required />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="template-title">Title template</Label>
                  <Input
                    id="template-title"
                    name="titleTemplate"
                    placeholder="Order {{orderId}} shipped"
                    required
                  />
                </div>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="template-body">Body template</Label>
                <Textarea
                  id="template-body"
                  name="bodyTemplate"
                  placeholder="Your package {{trackingNumber}} is on the way."
                  required
                />
              </div>
              <div>
                <Button type="submit">Save template</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Templates</CardTitle>
            <CardDescription>Edit or remove existing templates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No templates yet.</p>
            ) : (
              templates.map((template) => (
                <div key={template.id} className="rounded-lg border p-3">
                  <form action={updateTemplateAction} className="grid gap-2">
                    <input type="hidden" name="projectId" value={selectedProject.id} />
                    <input type="hidden" name="environmentId" value={selectedEnvironment.id} />
                    <input type="hidden" name="templateId" value={template.id} />
                    <input type="hidden" name="redirectTo" value={redirectTo} />
                    <Input name="type" defaultValue={template.type} required />
                    <Input name="titleTemplate" defaultValue={template.titleTemplate} required />
                    <Textarea name="bodyTemplate" defaultValue={template.bodyTemplate} required />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" type="submit">
                        Update
                      </Button>
                    </div>
                  </form>
                  <form action={deleteTemplateAction} className="mt-2">
                    <input type="hidden" name="projectId" value={selectedProject.id} />
                    <input type="hidden" name="environmentId" value={selectedEnvironment.id} />
                    <input type="hidden" name="templateId" value={template.id} />
                    <input type="hidden" name="redirectTo" value={redirectTo} />
                    <Button variant="destructive" type="submit">
                      Delete
                    </Button>
                  </form>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
