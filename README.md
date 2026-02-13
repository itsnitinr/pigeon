# Pigeon

Multi-tenant notifications infrastructure with:
- `apps/api`: Hono API (REST + SSE)
- `apps/worker`: BullMQ worker (delivery, webhook retries, cleanup)
- `apps/dashboard`: Next.js admin dashboard
- `apps/demo`: demo server/client using `@flypigeon/node` and `@flypigeon/react`

## Stack

- Node.js + pnpm workspaces + Turborepo
- PostgreSQL 16
- Redis 7
- Drizzle ORM
- Hono + BullMQ
- Next.js App Router

## Quickstart (Local Dev)

1. Install dependencies:
```bash
pnpm install
```

2. Create env file:
```bash
cp .env.example .env
```

3. Start local infra (Postgres + Redis):
```bash
docker compose -f docker-compose.dev.yml up -d
```

4. Run migrations:
```bash
pnpm --filter @flypigeon/db db:migrate
```

5. Start all apps:
```bash
pnpm dev
```

Common local URLs:
- API: `http://localhost:3001`
- Dashboard: `http://localhost:3000`
- Demo server: `http://localhost:3010`
- Demo client: `http://localhost:5173`

## Full Stack via Docker Compose

Production-style full stack (API + Worker + Dashboard + Postgres + Redis):

```bash
cp .env.example .env
```

Set at least these values in `.env` before production use:
- `POSTGRES_PASSWORD`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `NEXT_PUBLIC_BETTER_AUTH_URL`

```bash
docker compose up --build
```

This uses:
- `docker/Dockerfile.api`
- `docker/Dockerfile.worker`
- `docker/Dockerfile.dashboard`
- `docker-compose.yml`

## OpenAPI

Generate OpenAPI spec:
```bash
pnpm openapi:generate
```

Output:
- `docs/openapi.json`

## Smoke Tests

Run targeted smoke tests:
```bash
pnpm test:phase4
pnpm test:phase5
pnpm test:phase6
pnpm test:phase7
pnpm test:phase11
```

What they cover:
- Phase 4: CRUD/idempotency core notification endpoints
- Phase 5: SSE live + replay via `Last-Event-ID`
- Phase 6: worker delivery, webhook attempts/retries, TTL cleanup
- Phase 7: Node SDK behavior + typed errors
- Phase 11: Demo app end-to-end flow

## Architecture Docs

- `docs/architecture.md`
- `docs/openapi.json`
