# Architecture

## Overview

ReachInbox Scheduler is a production-grade email scheduling service built as an npm monorepo. It accepts email send requests via API, schedules them using BullMQ delayed jobs backed by Redis (with AOF persistence), and sends them through multiple SMTP senders (Ethereal for testing).

---

## Repository Structure

```
reachinbox-scheduler/
├── apps/api/        — Express REST API (scheduling, auth, search)
├── apps/worker/     — BullMQ Worker (send, throttle, rate-limit, reconcile)
├── apps/web/        — React + Vite + Tailwind dashboard
├── packages/shared/ — Zod schemas, DTO types, enums, constants
├── packages/db/     — Prisma schema + client singleton
└── infra/           — Docker Compose (PostgreSQL, Redis, Elasticsearch)
```

---

## Scheduling Flow

```
POST /emails/schedule
    │
    ├─ 1. Validate body (Zod)
    ├─ 2. Resolve senders (explicit or round-robin)
    ├─ 3. DB transaction: INSERT one Email row per recipient
    │      status=SCHEDULED, scheduledAt = startTime + index * delayBetweenMs
    ├─ 4. queue.addBulk(jobs)
    │      jobId = email.id  ← deterministic, duplicate enqueue = no-op
    │      delay = max(0, scheduledAt - now)
    └─ 5. Index emails in Elasticsearch (fire-and-forget)
```

---

## Worker Processor Flow (per job)

```
Job fires (delay elapsed)
    │
    ├─ 1. Atomic SQL Claim
    │      UPDATE email SET status='SENDING', attempts++ WHERE id=? AND status='SCHEDULED'
    │      If 0 rows → already handled → exit successfully (idempotency gate)
    │
    ├─ 2. Per-Sender Throttle
    │      Redis SET throttle:{senderId} 1 NX PX MIN_DELAY_BETWEEN_EMAILS_MS
    │      If held → releaseToScheduled() → moveToDelayed(now + remainingMs) → throw DelayedError
    │
    ├─ 3. Hourly Rate Limit (Lua)
    │      INCR rl:{senderId}:{window}, EXPIRE 7200
    │      If count > limit → DECR (rollback) → releaseToScheduled()
    │        → notifySlack (once per window) → moveToDelayed(nextWindow + orderOffset) → throw DelayedError
    │
    ├─ 4. Send via nodemailer (Ethereal SMTP)
    │      On success → UPDATE status=SENT, sentAt, messageId → update ES
    │      On transient error → releaseToScheduled() → throw (BullMQ retries with backoff)
    │      On permanent error (last attempt) → UPDATE status=FAILED, error → update ES
```

---

## Restart Persistence

1. **Redis AOF**: `appendonly yes + appendfsync everysec` ensures BullMQ delayed jobs survive process crashes. Named Docker volume preserves data across container restarts.
2. **Reconcile on startup** (`bootstrap/reconcile.ts`):
   - Resets rows stuck in `SENDING` for > 5 minutes back to `SCHEDULED` (crashed worker during send)
   - Scans all `SCHEDULED` rows and re-queues any missing from Redis (e.g., Redis data loss scenario)
   - Uses the same deterministic `jobId = email.id`, so re-adds are no-ops if job already exists

---

## Rate Limiting and Concurrency

### Hourly Limit (cross-worker, atomic)
- Key: `rl:{senderId}:{yyyyMMddHH}` (UTC hour window)
- Lua script atomically increments, checks limit, rolls back on deny
- Two-hour TTL auto-expires old windows
- Overflow: job moved to `nextHourWindowStart + (scheduledAt % 1h)` — preserves relative ordering

### Per-Sender Throttle (minimum interval)
- Key: `throttle:{senderId}` with TTL = `MIN_DELAY_BETWEEN_EMAILS_MS`
- Redis SET NX PX — safe across multiple workers
- If held: release SQL claim → moveToDelayed(remaining PTTL) → DelayedError

### Worker Concurrency
- Controlled by `WORKER_CONCURRENCY` env var
- Multiple workers can run safely (Redis atomic ops + SQL atomic claim prevent double-send)

---

## 1000+ Email Load Behavior

When 1000 emails are scheduled simultaneously to one sender with `MAX_EMAILS_PER_HOUR_PER_SENDER=10`:

1. All 1000 jobs start in BullMQ delayed queue
2. As delays elapse, jobs enter the active queue
3. Worker claims jobs one by one (atomic SQL claim)
4. Hourly Lua limit fires after 10 sends → remaining 990 moved to next hour window
5. Each subsequent window accepts 10 more, until all 1000 are sent
6. Total windows needed: 100 (with limit=10) or 5 (with limit=200 default)
7. Order is approximately preserved via the `scheduledAt % 1h` offset
8. Slack is notified once per window when limit first hits
9. Nothing is dropped — BullMQ persists delayed jobs in Redis

---

## Elasticsearch

- Index: `emails`
- Indexed on: schedule (creation), and after every status change (SENDING→SENT/FAILED)
- Search endpoint: `GET /search/emails?q=&status=&page=` (scoped to authenticated user)
- ES indexing failures are non-fatal (logged, not propagated to caller)

---

## Slack OAuth

- Uses real Slack OAuth v2 with `incoming-webhook` scope
- State parameter HMAC-signed with `SLACK_STATE_SECRET` to prevent CSRF
- Webhook URL stored in `SlackConnection` table, read from DB at notify time (no redeploy needed)
- Rate-limit notifications deduplicated per sender per window with Redis NX

---

## Auth

- Real Google OAuth v2 via `google-auth-library`
- JWT in httpOnly signed cookie (7-day expiry)
- Secure in production, Lax in development
