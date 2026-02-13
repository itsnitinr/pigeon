import {
  apiKeys,
  endUsers,
  environments,
  notifications,
  projectInvites,
  projectMembers,
  projects,
  templates,
  users,
  webhookDeliveryAttempts,
  webhookEndpoints,
} from '@flypigeon/db'
import type {
  EnvironmentName,
  NotificationStatus,
  ProjectMemberRole,
  WebhookDeliveryStatus,
} from '@flypigeon/shared'
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'

import { db } from './db'

export interface DashboardEnvironment {
  id: string
  name: EnvironmentName
}

export interface DashboardProject {
  id: string
  name: string
  slug: string
  role: ProjectMemberRole
  environments: DashboardEnvironment[]
}

export interface DashboardContext {
  projects: DashboardProject[]
  selectedProject: DashboardProject | null
  selectedEnvironment: DashboardEnvironment | null
}

export interface DashboardProjectMember {
  id: string
  role: ProjectMemberRole
  userId: string
  email: string
  name: string | null
  createdAt: Date
}

export interface DashboardProjectInvite {
  id: string
  email: string
  role: ProjectMemberRole
  token: string
  expiresAt: Date
  acceptedAt: Date | null
  createdAt: Date
}

export interface DashboardApiKey {
  id: string
  environmentId: string
  name: string
  keyPrefix: string
  isRevoked: boolean
  createdAt: Date
  revokedAt: Date | null
}

export interface DashboardNotificationLog {
  id: string
  externalUserId: string
  type: string
  title: string
  body: string | null
  status: NotificationStatus
  createdAt: Date
  readAt: Date | null
  archivedAt: Date | null
}

export interface DashboardEndUser {
  id: string
  externalUserId: string
  createdAt: Date
}

export interface DashboardTemplate {
  id: string
  type: string
  titleTemplate: string
  bodyTemplate: string
  createdAt: Date
  updatedAt: Date
}

export interface DashboardWebhookEndpoint {
  id: string
  environmentId: string
  url: string
  secret: string
  events: string[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface DashboardWebhookAttempt {
  id: string
  webhookEndpointId: string
  webhookUrl: string
  notificationId: string | null
  event: string
  status: WebhookDeliveryStatus
  responseStatus: number | null
  error: string | null
  attemptNumber: number
  createdAt: Date
}

export async function getDashboardProjectsForUser(userId: string): Promise<DashboardProject[]> {
  const memberships = await db
    .select({
      projectId: projectMembers.projectId,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId))

  if (memberships.length === 0) {
    return []
  }

  const projectRoleById = new Map(
    memberships.map((membership) => [membership.projectId, membership.role]),
  )
  const projectIds = memberships.map((membership) => membership.projectId)

  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
    })
    .from(projects)
    .where(inArray(projects.id, projectIds))
    .orderBy(asc(projects.createdAt))

  const environmentRows = await db
    .select({
      id: environments.id,
      projectId: environments.projectId,
      name: environments.name,
    })
    .from(environments)
    .where(inArray(environments.projectId, projectIds))
    .orderBy(asc(environments.createdAt))

  const environmentsByProject = new Map<string, DashboardEnvironment[]>()

  for (const row of environmentRows) {
    const current = environmentsByProject.get(row.projectId) ?? []
    current.push({ id: row.id, name: row.name })
    environmentsByProject.set(row.projectId, current)
  }

  return projectRows.map((projectRow) => ({
    id: projectRow.id,
    name: projectRow.name,
    slug: projectRow.slug,
    role: projectRoleById.get(projectRow.id) ?? 'member',
    environments: environmentsByProject.get(projectRow.id) ?? [],
  }))
}

export async function getDashboardContextForUser(
  userId: string,
  selection: {
    projectId?: string | null
    environmentId?: string | null
  } = {},
): Promise<DashboardContext> {
  const projects = await getDashboardProjectsForUser(userId)
  const selectedProject =
    projects.find((project) => project.id === selection.projectId) ?? projects[0] ?? null

  const selectedEnvironment =
    selectedProject?.environments.find(
      (environment) => environment.id === selection.environmentId,
    ) ??
    selectedProject?.environments[0] ??
    null

  return {
    projects,
    selectedProject,
    selectedEnvironment,
  }
}

export async function getProjectMembersForProject(
  projectId: string,
): Promise<DashboardProjectMember[]> {
  return db
    .select({
      id: projectMembers.id,
      role: projectMembers.role,
      userId: users.id,
      email: users.email,
      name: users.name,
      createdAt: projectMembers.createdAt,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(projectMembers.createdAt))
}

export async function getProjectInvitesForProject(
  projectId: string,
): Promise<DashboardProjectInvite[]> {
  return db
    .select({
      id: projectInvites.id,
      email: projectInvites.email,
      role: projectInvites.role,
      token: projectInvites.token,
      expiresAt: projectInvites.expiresAt,
      acceptedAt: projectInvites.acceptedAt,
      createdAt: projectInvites.createdAt,
    })
    .from(projectInvites)
    .where(eq(projectInvites.projectId, projectId))
    .orderBy(desc(projectInvites.createdAt))
}

export async function getApiKeysForEnvironment(environmentId: string): Promise<DashboardApiKey[]> {
  return db
    .select({
      id: apiKeys.id,
      environmentId: apiKeys.environmentId,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      isRevoked: apiKeys.isRevoked,
      createdAt: apiKeys.createdAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.environmentId, environmentId))
    .orderBy(desc(apiKeys.createdAt))
}

export async function getNotificationLogsForEnvironment(
  environmentId: string,
  filters: {
    userId?: string
    type?: string
    status?: NotificationStatus
    query?: string
    limit?: number
  } = {},
): Promise<DashboardNotificationLog[]> {
  const conditions = [eq(notifications.environmentId, environmentId)]

  if (filters.userId) {
    conditions.push(eq(endUsers.externalUserId, filters.userId))
  }

  if (filters.type) {
    conditions.push(ilike(notifications.type, `%${filters.type}%`))
  }

  if (filters.status) {
    conditions.push(eq(notifications.status, filters.status))
  }

  if (filters.query) {
    conditions.push(
      or(
        ilike(notifications.title, `%${filters.query}%`),
        ilike(sql`coalesce(${notifications.body}, '')`, `%${filters.query}%`),
      ) as ReturnType<typeof eq>,
    )
  }

  return db
    .select({
      id: notifications.id,
      externalUserId: endUsers.externalUserId,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      status: notifications.status,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      archivedAt: notifications.archivedAt,
    })
    .from(notifications)
    .innerJoin(endUsers, eq(notifications.endUserId, endUsers.id))
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(filters.limit ?? 100)
}

export async function getEndUsersForEnvironment(
  environmentId: string,
  query?: string,
): Promise<DashboardEndUser[]> {
  return db
    .select({
      id: endUsers.id,
      externalUserId: endUsers.externalUserId,
      createdAt: endUsers.createdAt,
    })
    .from(endUsers)
    .where(
      and(
        eq(endUsers.environmentId, environmentId),
        ...(query ? [ilike(endUsers.externalUserId, `%${query}%`)] : []),
      ),
    )
    .orderBy(desc(endUsers.createdAt))
    .limit(100)
}

export async function getNotificationsForEndUser(
  environmentId: string,
  endUserId: string,
): Promise<DashboardNotificationLog[]> {
  return db
    .select({
      id: notifications.id,
      externalUserId: endUsers.externalUserId,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      status: notifications.status,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      archivedAt: notifications.archivedAt,
    })
    .from(notifications)
    .innerJoin(endUsers, eq(notifications.endUserId, endUsers.id))
    .where(
      and(eq(notifications.environmentId, environmentId), eq(notifications.endUserId, endUserId)),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(50)
}

export async function getTemplatesForEnvironment(
  environmentId: string,
): Promise<DashboardTemplate[]> {
  return db
    .select({
      id: templates.id,
      type: templates.type,
      titleTemplate: templates.titleTemplate,
      bodyTemplate: templates.bodyTemplate,
      createdAt: templates.createdAt,
      updatedAt: templates.updatedAt,
    })
    .from(templates)
    .where(eq(templates.environmentId, environmentId))
    .orderBy(asc(templates.type))
}

export async function getWebhookEndpointsForEnvironment(
  environmentId: string,
): Promise<DashboardWebhookEndpoint[]> {
  return db
    .select({
      id: webhookEndpoints.id,
      environmentId: webhookEndpoints.environmentId,
      url: webhookEndpoints.url,
      secret: webhookEndpoints.secret,
      events: webhookEndpoints.events,
      isActive: webhookEndpoints.isActive,
      createdAt: webhookEndpoints.createdAt,
      updatedAt: webhookEndpoints.updatedAt,
    })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.environmentId, environmentId))
    .orderBy(desc(webhookEndpoints.createdAt))
}

export async function getWebhookAttemptsForEnvironment(
  environmentId: string,
  endpointId?: string,
): Promise<DashboardWebhookAttempt[]> {
  return db
    .select({
      id: webhookDeliveryAttempts.id,
      webhookEndpointId: webhookDeliveryAttempts.webhookEndpointId,
      webhookUrl: webhookEndpoints.url,
      notificationId: webhookDeliveryAttempts.notificationId,
      event: webhookDeliveryAttempts.event,
      status: webhookDeliveryAttempts.status,
      responseStatus: webhookDeliveryAttempts.responseStatus,
      error: webhookDeliveryAttempts.error,
      attemptNumber: webhookDeliveryAttempts.attemptNumber,
      createdAt: webhookDeliveryAttempts.createdAt,
    })
    .from(webhookDeliveryAttempts)
    .innerJoin(webhookEndpoints, eq(webhookDeliveryAttempts.webhookEndpointId, webhookEndpoints.id))
    .where(
      and(
        eq(webhookEndpoints.environmentId, environmentId),
        ...(endpointId ? [eq(webhookDeliveryAttempts.webhookEndpointId, endpointId)] : []),
      ),
    )
    .orderBy(desc(webhookDeliveryAttempts.createdAt))
    .limit(100)
}
