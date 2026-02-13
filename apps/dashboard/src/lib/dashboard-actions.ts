'use server'

import { randomBytes, scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'

import {
  apiKeys,
  environments,
  projectInvites,
  projectMembers,
  projects,
  templates,
  webhookEndpoints,
} from '@flypigeon/db'
import {
  API_KEY_PREFIX_BY_ENVIRONMENT,
  PROJECT_MEMBER_ROLES,
  WEBHOOK_EVENTS,
} from '@flypigeon/shared'
import { and, eq, like } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { getDashboardContextForUser } from './dashboard-data'
import { DASHBOARD_ROUTES, withContext } from './dashboard-navigation'
import { db } from './db'
import { getAuthSession } from './session'

const scrypt = promisify(scryptCallback)
const API_KEY_HASH_LENGTH = 64

interface ActionContext {
  userId: string
  projectId: string
  environmentId: string | null
  projectRole: 'owner' | 'member'
}

function getStringValue(formData: FormData, key: string): string {
  const value = formData.get(key)

  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

function getRedirectTo(formData: FormData, fallback: string): string {
  const redirectTo = getStringValue(formData, 'redirectTo')

  return redirectTo || fallback
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function appendQuery(path: string, params: Record<string, string | undefined>): string {
  const [basePath, rawQuery] = path.split('?')
  const searchParams = new URLSearchParams(rawQuery ?? '')

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value)
    }
  }

  const query = searchParams.toString()

  if (!query) {
    return basePath ?? path
  }

  return `${basePath ?? path}?${query}`
}

function parseWebhookEvents(rawValue: string): string[] {
  const events = rawValue
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  const allowedEvents = new Set(WEBHOOK_EVENTS)

  return events.filter((event): event is (typeof WEBHOOK_EVENTS)[number] =>
    allowedEvents.has(event as never),
  )
}

async function hashApiKey(rawKey: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scrypt(rawKey, salt, API_KEY_HASH_LENGTH)) as Buffer

  return `scrypt$${salt}$${derived.toString('hex')}`
}

async function resolveActionContext(formData: FormData): Promise<ActionContext> {
  const session = await getAuthSession()

  if (!session) {
    throw new Error('Unauthorized')
  }

  const projectId = getStringValue(formData, 'projectId')
  const environmentId = getStringValue(formData, 'environmentId')
  const context = await getDashboardContextForUser(session.user.id, {
    projectId: projectId || null,
    environmentId: environmentId || null,
  })

  if (!context.selectedProject) {
    throw new Error('No project selected')
  }

  return {
    userId: session.user.id,
    projectId: context.selectedProject.id,
    environmentId: context.selectedEnvironment?.id ?? null,
    projectRole: context.selectedProject.role,
  }
}

function assertOwner(context: ActionContext) {
  if (context.projectRole !== 'owner') {
    throw new Error('Only project owners can perform this action')
  }
}

async function ensureSlugIsUnique(baseSlug: string): Promise<string> {
  let candidate = baseSlug
  let attempt = 1

  while (candidate) {
    const [existing] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, candidate))
      .limit(1)

    if (!existing) {
      return candidate
    }

    attempt += 1
    candidate = `${baseSlug}-${attempt}`
  }

  return `project-${Date.now()}`
}

async function ensureMultipleOwnersBeforeRoleChange(projectId: string): Promise<void> {
  const owners = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, 'owner')))
    .limit(2)

  if (owners.length <= 1) {
    throw new Error('Project must have at least one owner')
  }
}

export async function createProjectAction(formData: FormData): Promise<void> {
  const session = await getAuthSession()

  if (!session) {
    throw new Error('Unauthorized')
  }

  const name = getStringValue(formData, 'name')
  const slugInput = getStringValue(formData, 'slug')

  if (!name) {
    throw new Error('Project name is required')
  }

  const baseSlug = slugify(slugInput || name)

  if (!baseSlug) {
    throw new Error('Project slug is required')
  }

  const slug = await ensureSlugIsUnique(baseSlug)

  const created = await db.transaction(async (trx) => {
    const [project] = await trx
      .insert(projects)
      .values({
        name,
        slug,
      })
      .returning({
        id: projects.id,
      })

    if (!project) {
      throw new Error('Failed to create project')
    }

    await trx.insert(projectMembers).values({
      projectId: project.id,
      userId: session.user.id,
      role: 'owner',
    })

    const [developmentEnvironment] = await trx
      .insert(environments)
      .values({
        projectId: project.id,
        name: 'development',
        jwtSecret: randomBytes(32).toString('hex'),
      })
      .returning({
        id: environments.id,
      })

    await trx.insert(environments).values({
      projectId: project.id,
      name: 'production',
      jwtSecret: randomBytes(32).toString('hex'),
    })

    return {
      projectId: project.id,
      environmentId: developmentEnvironment?.id ?? null,
    }
  })

  redirect(
    withContext(DASHBOARD_ROUTES.projects, {
      projectId: created.projectId,
      environmentId: created.environmentId,
    }),
  )
}

export async function updateProjectAction(formData: FormData): Promise<void> {
  const context = await resolveActionContext(formData)
  assertOwner(context)

  const name = getStringValue(formData, 'name')
  const slug = slugify(getStringValue(formData, 'slug'))

  if (!name || !slug) {
    throw new Error('Project name and slug are required')
  }

  await db
    .update(projects)
    .set({
      name,
      slug,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, context.projectId))

  redirect(getRedirectTo(formData, DASHBOARD_ROUTES.projects))
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const context = await resolveActionContext(formData)
  assertOwner(context)

  await db.delete(projects).where(eq(projects.id, context.projectId))

  redirect(DASHBOARD_ROUTES.projects)
}

export async function inviteMemberAction(formData: FormData): Promise<void> {
  const context = await resolveActionContext(formData)
  assertOwner(context)

  const email = getStringValue(formData, 'email').toLowerCase()
  const role = getStringValue(formData, 'role')

  if (!email) {
    throw new Error('Email is required')
  }

  if (!PROJECT_MEMBER_ROLES.includes(role as (typeof PROJECT_MEMBER_ROLES)[number])) {
    throw new Error('Invalid role')
  }

  await db.insert(projectInvites).values({
    projectId: context.projectId,
    email,
    role: role as (typeof PROJECT_MEMBER_ROLES)[number],
    invitedBy: context.userId,
    token: randomBytes(24).toString('hex'),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  })

  redirect(getRedirectTo(formData, DASHBOARD_ROUTES.members))
}

export async function cancelInviteAction(formData: FormData): Promise<void> {
  const context = await resolveActionContext(formData)
  assertOwner(context)

  const inviteId = getStringValue(formData, 'inviteId')

  if (!inviteId) {
    throw new Error('Invite is required')
  }

  await db
    .delete(projectInvites)
    .where(and(eq(projectInvites.id, inviteId), eq(projectInvites.projectId, context.projectId)))

  redirect(getRedirectTo(formData, DASHBOARD_ROUTES.members))
}

export async function updateMemberRoleAction(formData: FormData): Promise<void> {
  const context = await resolveActionContext(formData)
  assertOwner(context)

  const memberId = getStringValue(formData, 'memberId')
  const role = getStringValue(formData, 'role')

  if (!PROJECT_MEMBER_ROLES.includes(role as (typeof PROJECT_MEMBER_ROLES)[number])) {
    throw new Error('Invalid role')
  }

  const [member] = await db
    .select({
      id: projectMembers.id,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .where(and(eq(projectMembers.id, memberId), eq(projectMembers.projectId, context.projectId)))
    .limit(1)

  if (!member) {
    throw new Error('Member not found')
  }

  if (member.role === 'owner' && role === 'member') {
    await ensureMultipleOwnersBeforeRoleChange(context.projectId)
  }

  await db
    .update(projectMembers)
    .set({ role: role as (typeof PROJECT_MEMBER_ROLES)[number] })
    .where(eq(projectMembers.id, memberId))

  redirect(getRedirectTo(formData, DASHBOARD_ROUTES.members))
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const context = await resolveActionContext(formData)
  assertOwner(context)

  const memberId = getStringValue(formData, 'memberId')

  const [member] = await db
    .select({
      id: projectMembers.id,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .where(and(eq(projectMembers.id, memberId), eq(projectMembers.projectId, context.projectId)))
    .limit(1)

  if (!member) {
    throw new Error('Member not found')
  }

  if (member.role === 'owner') {
    await ensureMultipleOwnersBeforeRoleChange(context.projectId)
  }

  await db.delete(projectMembers).where(eq(projectMembers.id, memberId))

  redirect(getRedirectTo(formData, DASHBOARD_ROUTES.members))
}

export async function createApiKeyAction(formData: FormData): Promise<void> {
  const context = await resolveActionContext(formData)
  assertOwner(context)

  const name = getStringValue(formData, 'name')

  if (!context.environmentId) {
    throw new Error('Environment is required')
  }

  if (!name) {
    throw new Error('API key name is required')
  }

  const [environment] = await db
    .select({
      name: environments.name,
    })
    .from(environments)
    .where(
      and(
        eq(environments.id, context.environmentId),
        eq(environments.projectId, context.projectId),
      ),
    )
    .limit(1)

  if (!environment) {
    throw new Error('Environment not found')
  }

  const prefix = API_KEY_PREFIX_BY_ENVIRONMENT[environment.name]
  const token = randomBytes(24).toString('base64url')
  const rawKey = `${prefix}${token}`
  const keyHash = await hashApiKey(rawKey)

  await db.insert(apiKeys).values({
    environmentId: context.environmentId,
    name,
    keyHash,
    keyPrefix: rawKey.slice(0, 32),
    isRevoked: false,
  })

  const redirectTo = getRedirectTo(formData, DASHBOARD_ROUTES.apiKeys)
  redirect(appendQuery(redirectTo, { newKey: rawKey }))
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const context = await resolveActionContext(formData)
  assertOwner(context)

  const apiKeyId = getStringValue(formData, 'apiKeyId')

  await db
    .update(apiKeys)
    .set({
      isRevoked: true,
      revokedAt: new Date(),
    })
    .where(
      and(
        eq(apiKeys.id, apiKeyId),
        eq(apiKeys.environmentId, context.environmentId ?? ''),
        eq(apiKeys.isRevoked, false),
      ),
    )

  redirect(getRedirectTo(formData, DASHBOARD_ROUTES.apiKeys))
}

export async function createTemplateAction(formData: FormData): Promise<void> {
  const context = await resolveActionContext(formData)

  if (!context.environmentId) {
    throw new Error('Environment is required')
  }

  const type = getStringValue(formData, 'type')
  const titleTemplate = getStringValue(formData, 'titleTemplate')
  const bodyTemplate = getStringValue(formData, 'bodyTemplate')

  if (!type || !titleTemplate || !bodyTemplate) {
    throw new Error('All template fields are required')
  }

  await db
    .insert(templates)
    .values({
      environmentId: context.environmentId,
      type,
      titleTemplate,
      bodyTemplate,
    })
    .onConflictDoUpdate({
      target: [templates.environmentId, templates.type],
      set: {
        titleTemplate,
        bodyTemplate,
        updatedAt: new Date(),
      },
    })

  redirect(getRedirectTo(formData, DASHBOARD_ROUTES.templates))
}

export async function updateTemplateAction(formData: FormData): Promise<void> {
  const context = await resolveActionContext(formData)

  if (!context.environmentId) {
    throw new Error('Environment is required')
  }

  const templateId = getStringValue(formData, 'templateId')
  const type = getStringValue(formData, 'type')
  const titleTemplate = getStringValue(formData, 'titleTemplate')
  const bodyTemplate = getStringValue(formData, 'bodyTemplate')

  await db
    .update(templates)
    .set({
      type,
      titleTemplate,
      bodyTemplate,
      updatedAt: new Date(),
    })
    .where(and(eq(templates.id, templateId), eq(templates.environmentId, context.environmentId)))

  redirect(getRedirectTo(formData, DASHBOARD_ROUTES.templates))
}

export async function deleteTemplateAction(formData: FormData): Promise<void> {
  const context = await resolveActionContext(formData)

  if (!context.environmentId) {
    throw new Error('Environment is required')
  }

  const templateId = getStringValue(formData, 'templateId')

  await db
    .delete(templates)
    .where(and(eq(templates.id, templateId), eq(templates.environmentId, context.environmentId)))

  redirect(getRedirectTo(formData, DASHBOARD_ROUTES.templates))
}

export async function createWebhookEndpointAction(formData: FormData): Promise<void> {
  const context = await resolveActionContext(formData)

  if (!context.environmentId) {
    throw new Error('Environment is required')
  }

  const url = getStringValue(formData, 'url')
  const secret = getStringValue(formData, 'secret')
  const rawEvents = getStringValue(formData, 'events')
  const events = parseWebhookEvents(rawEvents)

  if (!url || !secret || events.length === 0) {
    throw new Error('URL, secret, and at least one event are required')
  }

  await db.insert(webhookEndpoints).values({
    environmentId: context.environmentId,
    url,
    secret,
    events,
    isActive: true,
  })

  redirect(getRedirectTo(formData, DASHBOARD_ROUTES.webhooks))
}

export async function updateWebhookEndpointAction(formData: FormData): Promise<void> {
  const context = await resolveActionContext(formData)

  if (!context.environmentId) {
    throw new Error('Environment is required')
  }

  const endpointId = getStringValue(formData, 'endpointId')
  const url = getStringValue(formData, 'url')
  const secret = getStringValue(formData, 'secret')
  const rawEvents = getStringValue(formData, 'events')
  const events = parseWebhookEvents(rawEvents)
  const isActive = getStringValue(formData, 'isActive') === 'on'

  if (!url || !secret || events.length === 0) {
    throw new Error('URL, secret, and at least one event are required')
  }

  await db
    .update(webhookEndpoints)
    .set({
      url,
      secret,
      events,
      isActive,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(webhookEndpoints.id, endpointId),
        eq(webhookEndpoints.environmentId, context.environmentId),
      ),
    )

  redirect(getRedirectTo(formData, DASHBOARD_ROUTES.webhooks))
}

export async function deleteWebhookEndpointAction(formData: FormData): Promise<void> {
  const context = await resolveActionContext(formData)

  if (!context.environmentId) {
    throw new Error('Environment is required')
  }

  const endpointId = getStringValue(formData, 'endpointId')

  await db
    .delete(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, endpointId),
        eq(webhookEndpoints.environmentId, context.environmentId),
      ),
    )

  redirect(getRedirectTo(formData, DASHBOARD_ROUTES.webhooks))
}

export async function ensureProjectSelectionForPath(path: string): Promise<void> {
  const session = await getAuthSession()

  if (!session) {
    throw new Error('Unauthorized')
  }

  const context = await getDashboardContextForUser(session.user.id)

  if (!context.selectedProject) {
    redirect(path)
  }

  redirect(
    withContext(path, {
      projectId: context.selectedProject.id,
      environmentId: context.selectedEnvironment?.id ?? null,
    }),
  )
}

export async function getMatchingProjectsForSlug(slugStart: string): Promise<number> {
  const rows = await db
    .select({
      id: projects.id,
    })
    .from(projects)
    .where(like(projects.slug, `${slugStart}%`))

  return rows.length
}
