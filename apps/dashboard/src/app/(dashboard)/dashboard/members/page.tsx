import { HintCard } from '@/components/dashboard/hint-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  cancelInviteAction,
  inviteMemberAction,
  removeMemberAction,
  updateMemberRoleAction,
} from '@/lib/dashboard-actions'
import {
  getDashboardContextForUser,
  getProjectInvitesForProject,
  getProjectMembersForProject,
} from '@/lib/dashboard-data'
import { DASHBOARD_ROUTES, withContext } from '@/lib/dashboard-navigation'
import { getAuthSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export default async function MembersPage({
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

  if (!context.selectedProject) {
    redirect(DASHBOARD_ROUTES.projects)
  }

  const selectedProject = context.selectedProject
  const selectedEnvironment = context.selectedEnvironment
  const members = await getProjectMembersForProject(selectedProject.id)
  const invites = await getProjectInvitesForProject(selectedProject.id)
  const redirectTo = withContext(DASHBOARD_ROUTES.members, {
    projectId: selectedProject.id,
    environmentId: selectedEnvironment?.id ?? null,
  })

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Members"
        title="Team Access Control"
        description="Members are managed at project level. Owners can invite teammates, change roles, and remove access."
        contextBadges={[`project: ${selectedProject.name}`, `your role: ${selectedProject.role}`]}
      />

      <HintCard
        title="Role guidance"
        hints={[
          'Owner: full control, including project settings, member management, and key rotation.',
          'Member: operational access to logs, templates, and user inspection without ownership actions.',
          'Keep at least two owners so one account issue does not lock the project.',
        ]}
      />

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              Manage project access. Owners can invite users and update roles.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {members.map((member) => (
              <div key={member.id} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{member.name ?? member.email}</p>
                <p className="text-xs text-muted-foreground">{member.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border px-2 py-0.5 text-xs">{member.role}</span>
                  {selectedProject.role === 'owner' ? (
                    <>
                      <form action={updateMemberRoleAction} className="flex items-center gap-2">
                        <input type="hidden" name="projectId" value={selectedProject.id} />
                        <input
                          type="hidden"
                          name="environmentId"
                          value={selectedEnvironment?.id ?? ''}
                        />
                        <input type="hidden" name="memberId" value={member.id} />
                        <input type="hidden" name="redirectTo" value={redirectTo} />
                        <Select
                          name="role"
                          defaultValue={member.role}
                          options={[
                            { label: 'Owner', value: 'owner' },
                            { label: 'Member', value: 'member' },
                          ]}
                        />
                        <Button variant="outline" size="sm" type="submit">
                          Update role
                        </Button>
                      </form>
                      <form action={removeMemberAction}>
                        <input type="hidden" name="projectId" value={selectedProject.id} />
                        <input
                          type="hidden"
                          name="environmentId"
                          value={selectedEnvironment?.id ?? ''}
                        />
                        <input type="hidden" name="memberId" value={member.id} />
                        <input type="hidden" name="redirectTo" value={redirectTo} />
                        <Button variant="destructive" size="sm" type="submit">
                          Remove
                        </Button>
                      </form>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invites</CardTitle>
            <CardDescription>Invite collaborators by email address.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {selectedProject.role === 'owner' ? (
              <form
                action={inviteMemberAction}
                className="grid gap-3 md:grid-cols-[2fr_1fr_auto] md:items-end"
              >
                <input type="hidden" name="projectId" value={selectedProject.id} />
                <input type="hidden" name="environmentId" value={selectedEnvironment?.id ?? ''} />
                <input type="hidden" name="redirectTo" value={redirectTo} />
                <div className="grid gap-2">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    name="email"
                    placeholder="dev@company.com"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="invite-role">Role</Label>
                  <Select
                    id="invite-role"
                    name="role"
                    options={[
                      { label: 'Member', value: 'member' },
                      { label: 'Owner', value: 'owner' },
                    ]}
                    defaultValue="member"
                  />
                </div>
                <Button type="submit">Send invite</Button>
              </form>
            ) : null}

            {invites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending invites.</p>
            ) : (
              <div className="grid gap-2">
                {invites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{invite.email}</p>
                      <p className="text-xs text-muted-foreground">
                        role: {invite.role} · expires {invite.expiresAt.toLocaleDateString()}
                      </p>
                    </div>
                    {selectedProject.role === 'owner' ? (
                      <form action={cancelInviteAction}>
                        <input type="hidden" name="projectId" value={selectedProject.id} />
                        <input
                          type="hidden"
                          name="environmentId"
                          value={selectedEnvironment?.id ?? ''}
                        />
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <input type="hidden" name="redirectTo" value={redirectTo} />
                        <Button variant="outline" size="sm" type="submit">
                          Cancel
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
