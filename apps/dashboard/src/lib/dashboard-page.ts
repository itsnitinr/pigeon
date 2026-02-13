import { redirect } from 'next/navigation'

import { getDashboardContextForUser } from './dashboard-data'
import { DASHBOARD_ROUTES, withContext } from './dashboard-navigation'
import { getAuthSession } from './session'

export interface DashboardPageContext {
  user: {
    id: string
    name: string | null
    email: string
  }
  project: {
    id: string
    name: string
    slug: string
    role: 'owner' | 'member'
  }
  environment: {
    id: string
    name: 'development' | 'production'
  } | null
}

export async function requireDashboardPageContext(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<DashboardPageContext> {
  const session = await getAuthSession()

  if (!session) {
    redirect('/login')
  }

  const projectId = typeof searchParams.projectId === 'string' ? searchParams.projectId : undefined
  const environmentId =
    typeof searchParams.environmentId === 'string' ? searchParams.environmentId : undefined

  const context = await getDashboardContextForUser(session.user.id, {
    projectId: projectId ?? null,
    environmentId: environmentId ?? null,
  })

  if (!context.selectedProject) {
    redirect(DASHBOARD_ROUTES.projects)
  }

  if (
    !projectId ||
    !environmentId ||
    context.selectedProject.id !== projectId ||
    context.selectedEnvironment?.id !== environmentId
  ) {
    redirect(
      withContext(DASHBOARD_ROUTES.overview, {
        projectId: context.selectedProject.id,
        environmentId: context.selectedEnvironment?.id ?? null,
      }),
    )
  }

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    },
    project: {
      id: context.selectedProject.id,
      name: context.selectedProject.name,
      slug: context.selectedProject.slug,
      role: context.selectedProject.role,
    },
    environment: context.selectedEnvironment,
  }
}
