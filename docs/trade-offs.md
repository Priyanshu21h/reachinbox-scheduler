# Trade-offs and Design Decisions

This document records every ambiguous decision with rationale.

---

## Scheduling: BullMQ Delayed Jobs (not cron)

**Decision**: Use BullMQ `delay` option, not cron.
**Rationale**: Cron-based scheduling does not survive process restarts without external persistence. BullMQ stores all jobs in Redis with AOF durability. A job scheduled for 1 hour from now survives any API or worker crash.

---

## Idempotency: SQL Atomic Claim + Deterministic jobId

**Decision**: Two-layer idempotency.
1. `queue.add(name, data, { jobId: email.id })` — BullMQ ignores duplicate adds for the same jobId.
2. `UPDATE email SET status='SENDING' WHERE status='SCHEDULED' RETURNING *` — if 0 rows, exit cleanly.

**Rationale**: BullMQ can deliver a job twice (stalled + recovered), so the atomic SQL claim is the definitive guard. The jobId deduplication prevents the reconciler from adding duplicate delayed jobs.

---

## Rate Limiting: Redis Lua Script (not in-memory)

**Decision**: Atomic Lua `INCR + EXPIRE + rollback` in `hourly-counter.lua`.
**Rationale**: In-memory counters are not safe across multiple worker processes or instances. Redis Lua scripts are executed atomically (single-threaded Redis), ensuring no race condition even with N concurrent workers.

---

## Throttle: Redis SET NX PX (not sleep)

**Decision**: `SET throttle:{senderId} 1 NX PX MIN_DELAY_MS` then check PTTL if held.
**Rationale**: Sleep/polling inside a job wastes a worker concurrency slot and blocks the event loop. Moving the job back to delayed with `job.moveToDelayed()` releases the slot immediately.

---

## Overflow: Next Window + Order-Preserving Offset

**Decision**: When rate-limited, move job to `nextHourWindowStart + (email.scheduledAt % 3600000)`.
**Rationale**: Adding the within-hour offset of the original scheduledAt approximately preserves relative ordering across windows. Pure `nextHourWindowStart` would cause all overflowed jobs to pile up at the same millisecond.

---

## Auth: JWT in httpOnly Cookie (not localStorage)

**Decision**: Signed JWT in `httpOnly` cookie.
**Rationale**: `localStorage` is vulnerable to XSS. `httpOnly` cookies are not accessible from JavaScript. `SameSite: lax` in development prevents CSRF for normal navigation.

---

## Elasticsearch: Fire-and-Forget (not blocking)

**Decision**: ES indexing uses `.catch(log)` and never propagates errors to the caller.
**Rationale**: ES indexing is not on the critical path. A scheduling request should succeed even if ES is temporarily down. The job also doesn't fail if ES update fails — search may lag, but emails are sent.

---

## Single PostgreSQL Transaction for Bulk Insert

**Decision**: Insert all email rows in a single Prisma `$transaction` (sequential loop).
**Rationale**: All-or-nothing semantics. If any row fails (e.g., FK violation), the entire schedule request is rolled back. For very large batches (>10k), this may require pagination — documented as a future improvement.

---

## Prisma + Raw SQL for Atomic Claim

**Decision**: Use `prisma.$queryRaw` for the `UPDATE … WHERE status='SCHEDULED' RETURNING *`.
**Rationale**: Prisma's `update` API doesn't support conditional `WHERE` with `RETURNING`. The raw query is the only way to implement an atomic test-and-set with zero chance of TOCTOU race.

---

## Ethereal SMTP (not real email provider)

**Decision**: All senders use Ethereal for testing. A helper endpoint auto-creates a test account.
**Rationale**: Allows full end-to-end testing without a real email provider. The architecture supports real SMTP — just configure the sender's SMTP credentials.

---

## Slack: Read Webhook from DB at Notify Time

**Decision**: `notifyRateLimitHit` fetches `SlackConnection` from the DB at notification time.
**Rationale**: If the user connects Slack after workers start, the webhook URL is immediately available without redeploying. No in-memory cache of the webhook URL.

---

## Min Delay: 2000ms default

**Decision**: `MIN_DELAY_BETWEEN_EMAILS_MS=2000` as default.
**Rationale**: Most SMTP providers (including Ethereal) rate-limit connections. 2 seconds per send provides a safe margin while allowing 30 sends/minute per sender. Configurable via env.

---

## Worker Lock Duration: 60s

**Decision**: `lockDuration: 60_000`, `maxStalledCount: 1`.
**Rationale**: If a worker crashes during a send (which takes ≤ 30s typically), BullMQ will redeliver the job after 60s. The atomic SQL claim prevents double-send even on redelivery.

---

## Simplifications / Shortcuts

- No email unsubscribe / bounce handling (out of scope for scheduler)
- No multi-tenant rate limiting (one user's sends don't affect another's)
- No real-time push updates (frontend polls every 10-15s)
- No email open/click tracking
- ES is optional for the core scheduling flow; app degrades gracefully if ES is down
