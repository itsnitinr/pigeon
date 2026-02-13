import { desc, sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  ENVIRONMENT_NAMES,
  NOTIFICATION_STATUSES,
  PROJECT_MEMBER_ROLES,
  WEBHOOK_DELIVERY_STATUSES,
  WEBHOOK_EVENTS,
} from '@pigeon/shared'

export const environmentNameEnum = pgEnum('environment_name', ENVIRONMENT_NAMES)
export const projectMemberRoleEnum = pgEnum('project_member_role', PROJECT_MEMBER_ROLES)
export const notificationStatusEnum = pgEnum('notification_status', NOTIFICATION_STATUSES)
export const webhookEventEnum = pgEnum('webhook_event', WEBHOOK_EVENTS)
export const webhookDeliveryStatusEnum = pgEnum(
  'webhook_delivery_status',
  WEBHOOK_DELIVERY_STATUSES,
)

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name'),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_unique').on(table.email),
  }),
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenUnique: uniqueIndex('sessions_token_unique').on(table.token),
    userIdIdx: index('sessions_user_id_idx').on(table.userId),
  }),
)

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerAccountUnique: uniqueIndex('accounts_provider_account_unique').on(
      table.providerId,
      table.accountId,
    ),
    userIdIdx: index('accounts_user_id_idx').on(table.userId),
  }),
)

export const verifications = pgTable(
  'verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    identifierValueUnique: uniqueIndex('verifications_identifier_value_unique').on(
      table.identifier,
      table.value,
    ),
  }),
)

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex('projects_slug_unique').on(table.slug),
  }),
)

export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: projectMemberRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectUserUnique: uniqueIndex('project_members_project_user_unique').on(
      table.projectId,
      table.userId,
    ),
    projectIdIdx: index('project_members_project_id_idx').on(table.projectId),
    userIdIdx: index('project_members_user_id_idx').on(table.userId),
  }),
)

export const projectInvites = pgTable(
  'project_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: projectMemberRoleEnum('role').notNull(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenUnique: uniqueIndex('project_invites_token_unique').on(table.token),
    projectEmailIdx: index('project_invites_project_email_idx').on(table.projectId, table.email),
  }),
)

export const environments = pgTable(
  'environments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: environmentNameEnum('name').notNull(),
    jwtSecret: text('jwt_secret').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectEnvironmentUnique: uniqueIndex('environments_project_name_unique').on(
      table.projectId,
      table.name,
    ),
  }),
)

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    keyPrefix: varchar('key_prefix', { length: 32 }).notNull(),
    isRevoked: boolean('is_revoked').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    environmentIdIdx: index('api_keys_environment_id_idx').on(table.environmentId),
    keyPrefixIdx: index('api_keys_key_prefix_idx').on(table.keyPrefix),
  }),
)

export const endUsers = pgTable(
  'end_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    externalUserId: text('external_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    environmentExternalUserUnique: uniqueIndex('end_users_environment_external_user_unique').on(
      table.environmentId,
      table.externalUserId,
    ),
    projectEnvironmentIdx: index('end_users_project_environment_idx').on(
      table.projectId,
      table.environmentId,
    ),
  }),
)

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    endUserId: uuid('end_user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp('read_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    status: notificationStatusEnum('status').notNull().default('queued'),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    environmentEndUserCreatedAtIdx: index('notifications_environment_end_user_created_at_idx').on(
      table.environmentId,
      table.endUserId,
      desc(table.createdAt),
    ),
    createdAtIdx: index('notifications_created_at_idx').on(table.createdAt),
    idempotencyUnique: uniqueIndex('notifications_environment_idempotency_unique')
      .on(table.environmentId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  }),
)

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    secret: text('secret').notNull(),
    events: text('events').array().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    environmentIdIdx: index('webhook_endpoints_environment_id_idx').on(table.environmentId),
  }),
)

export const webhookDeliveryAttempts = pgTable(
  'webhook_delivery_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    webhookEndpointId: uuid('webhook_endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    notificationId: uuid('notification_id').references(() => notifications.id, {
      onDelete: 'cascade',
    }),
    event: webhookEventEnum('event').notNull(),
    status: webhookDeliveryStatusEnum('status').notNull().default('pending'),
    requestBody: jsonb('request_body').$type<Record<string, unknown>>().notNull(),
    responseStatus: integer('response_status'),
    responseBody: text('response_body'),
    error: text('error'),
    attemptNumber: integer('attempt_number').notNull().default(1),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    endpointIdIdx: index('webhook_delivery_attempts_endpoint_id_idx').on(table.webhookEndpointId),
    notificationIdIdx: index('webhook_delivery_attempts_notification_id_idx').on(
      table.notificationId,
    ),
  }),
)

export const templates = pgTable(
  'templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    titleTemplate: text('title_template').notNull(),
    bodyTemplate: text('body_template').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    environmentTypeUnique: uniqueIndex('templates_environment_type_unique').on(
      table.environmentId,
      table.type,
    ),
    environmentIdIdx: index('templates_environment_id_idx').on(table.environmentId),
  }),
)
