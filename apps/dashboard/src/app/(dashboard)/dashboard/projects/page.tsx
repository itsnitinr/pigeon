import Link from 'next/link'

import { HintCard } from '@/components/dashboard/hint-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createProjectAction,
  deleteProjectAction,
  updateProjectAction,
} from '@/lib/dashboard-actions'
import { getDashboardContextForUser } from '@/lib/dashboard-data'
import { DASHBOARD_ROUTES, withContext } from '@/lib/dashboard-navigation'
import { getAuthSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export default async function ProjectsPage({
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

  const redirectTo = context.selectedProject
    ? withContext(DASHBOARD_ROUTES.projects, {
        projectId: context.selectedProject.id,
        environmentId: context.selectedEnvironment?.id ?? null,
      })
    : DASHBOARD_ROUTES.projects

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Projects"
        title="Project Settings"
        description="Projects are top-level workspaces. Members are attached at project level, while API keys, templates, logs, and webhooks are scoped by environment inside each project."
      />

      <HintCard
        title="Before you start"
        hints={[
          'Use concise project names. Slugs become stable references in your dashboard and URLs.',
          'Each new project gets development and production environments automatically.',
          'Delete a project only when you are sure, because all nested resources are removed.',
        ]}
      />

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Create Project</CardTitle>
            <CardDescription>
              New projects automatically get development and production environments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={createProjectAction}
              className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
            >
              <div className="grid gap-2">
                <Label htmlFor="project-name">Name</Label>
                <Input id="project-name" name="name" placeholder="Customer Platform" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="project-slug">Slug (optional)</Label>
                <Input id="project-slug" name="slug" placeholder="customer-platform" />
              </div>
              <Button type="submit">Create</Button>
            </form>
          </CardContent>
        </Card>

        {context.projects.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No projects yet</CardTitle>
              <CardDescription>
                Create your first project to unlock members, logs, templates, and webhooks pages.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {context.projects.map((project) => {
              const projectEnvironment = project.environments[0]
              const projectContextHref = withContext(DASHBOARD_ROUTES.projects, {
                projectId: project.id,
                environmentId: projectEnvironment?.id ?? null,
              })

              return (
                <Card key={project.id}>
                  <CardHeader>
                    <CardTitle>{project.name}</CardTitle>
                    <CardDescription>
                      <code>{project.slug}</code> · role: <strong>{project.role}</strong>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {project.environments.map((environment) => (
                        <span key={environment.id} className="rounded-full border px-2 py-0.5">
                          {environment.name}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium"
                        href={projectContextHref}
                      >
                        Select Context
                      </Link>
                    </div>

                    {project.role === 'owner' ? (
                      <>
                        <form action={updateProjectAction} className="grid gap-2 md:grid-cols-2">
                          <input type="hidden" name="projectId" value={project.id} />
                          <input
                            type="hidden"
                            name="environmentId"
                            value={projectEnvironment?.id ?? ''}
                          />
                          <input type="hidden" name="redirectTo" value={projectContextHref} />
                          <Input name="name" defaultValue={project.name} required />
                          <Input name="slug" defaultValue={project.slug} required />
                          <Button className="md:col-span-2" variant="outline" type="submit">
                            Save changes
                          </Button>
                        </form>

                        <form action={deleteProjectAction}>
                          <input type="hidden" name="projectId" value={project.id} />
                          <input
                            type="hidden"
                            name="environmentId"
                            value={projectEnvironment?.id ?? ''}
                          />
                          <input type="hidden" name="redirectTo" value={redirectTo} />
                          <Button variant="destructive" type="submit">
                            Delete project
                          </Button>
                        </form>
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
