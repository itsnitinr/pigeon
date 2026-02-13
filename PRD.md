# PRD — Notifications SaaS (MVP)

---

## 1) Summary

Build a multi-tenant Notifications SaaS that lets developers **send and receive in-app notifications fast** via:

- a **backend SDK** to send notifications
- a **frontend SDK** to fetch + display notifications and keep them updated in realtime
- a **dashboard** for keys + logs + basic templates

MVP supports **in-app + realtime (SSE)** and **webhooks**. No email/SMS/push in MVP.

---

## 2) Goals

- Integrate in < 15 minutes (send + show + unread).
- Multi-tenant: projects + dev/prod keys.
- Realtime in-app notifications.
- Reliable delivery (queue, retries for webhooks, idempotent send).
- Debuggable (logs + user inspector).

---

## 3) Non-Goals (MVP)

- Email / Push / SMS / WhatsApp channels
- Advanced preference center (quiet hours, per-type opt-outs)
- Localization / rich templating
- Enterprise features (SSO, SOC2), multi-region HA

---

## 4) MVP Scope (P0)

### 4.1 What customers get

**Backend SDK (Node)**

- `send()`
- `createUserToken()`

**Frontend SDK (React)**

- `NotifyProvider`
- `useNotifications()` → list + unread count
- `markRead(id)` / `markAllRead()`
- realtime updates via SSE

**Dashboard**

- Project + env (dev/prod) keys
- Notification logs (filter by userId/type/status)
- User inspector (view a user’s notifications)
- Basic templates (by `type`)
- Webhooks config + delivery attempts

---

## 5) Core APIs (MVP)

### 5.1 Auth

- **Server**: API key
- **Client**: short-lived JWT (minted by server via SDK)

### 5.2 Endpoints

1. `POST /v1/notifications` (server → enqueue)

   - body: `userId, type, title, body, data?, idempotencyKey?`
   - returns: `notificationId, status=queued`

2. `POST /v1/users/:userId/token` (server → mint JWT)

   - returns: `token, expiresAt`

3. `GET /v1/users/:userId/notifications` (client → list)

   - supports pagination
   - optional filter: `unread=true`

4. `POST /v1/notifications/:id/read` (client)

5. `POST /v1/users/:userId/read_all` (client)

6. `GET /v1/stream` (client → SSE realtime)

---

## 6) Data Model (minimum)

### Tenancy

- `projects`
- `environments` (dev/prod)
- `api_keys` (hashed)

### Recipients

- `end_users`
  - `project_id, environment_id, external_user_id`

### Notifications

- `notifications`
  - `project_id, environment_id, end_user_id`
  - `type, title, body, data(JSON)`
  - `read_at`
  - `status (queued|delivered|failed)`
  - `idempotency_key`
  - timestamps

### Webhooks

- `webhook_endpoints` (url, secret)
- `webhook_attempts` (status, response/error, timestamps)

### Templates

- `templates` (type, title_template, body_template)

---

## 7) Realtime (SSE)

- Client connects: `GET /v1/stream` with user JWT.
- Server emits: `notification.created` with payload.
- Auto-reconnect supported in frontend SDK.
- Backend publishes events via Redis pub/sub (or equivalent).

---

## 8) Reliability Requirements

- **Queue-based processing**: API enqueues; worker writes/delivers.
- **Idempotency**: unique `(project_id, environment_id, idempotency_key)`.
- **Webhook retries**: exponential backoff, max retries, visible in dashboard.
- **At-least-once** worker semantics; idempotency prevents duplicates.

---

## 9) SDK Requirements

### Backend SDK (Node)

- `new Notify({ apiKey, baseUrl? })`
- `send({ userId, type, title, body, data?, idempotencyKey? })`
- `createUserToken({ userId, ttlSeconds? })`

### Frontend SDK (React)

- `<NotifyProvider token="...">`
- `useNotifications({ unreadOnly?, pageSize? })`
  - returns: `items, unreadCount, loading, error`
  - actions: `markRead, markAllRead, refetch`

---

## 10) Dashboard Requirements (MVP)

- **Keys**: create/revoke keys, show-once on creation.
- **Logs**: searchable notifications (userId/type/status/time).
- **User inspector**: view user’s notifications + unread.
- **Templates**: CRUD per `type`.
- **Webhooks**: configure + view attempts.

---

## 11) Acceptance Criteria

- Demo app can:
  - send notification from server using backend SDK
  - render notifications + unread count using frontend SDK
  - receive new notifications in realtime via SSE
  - mark read and see state update correctly
- Duplicate sends with same `idempotencyKey` create only one notification.
- Dashboard can search by userId and show notification details + status.
- Webhook failures are retried and attempts are visible.

---
