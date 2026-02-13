import { redirect } from 'next/navigation'

import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { getDashboardProjectsForUser } from '@/lib/dashboard-data'
import { getAuthSession } from '@/lib/session'

export default async function AuthenticatedDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getAuthSession()

  if (!session) {
    redirect('/login')
  }

  const projects = await getDashboardProjectsForUser(session.user.id)

  return (
    <DashboardShell
      user={{
        name: session.user.name,
        email: session.user.email,
      }}
      projects={projects}
    >
      {children}
    </DashboardShell>
  )
}
