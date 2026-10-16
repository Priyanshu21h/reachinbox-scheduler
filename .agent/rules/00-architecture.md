# Architecture Rules

## Monorepo Structure
- All backend apps live in `apps/api` and `apps/worker`.
- All shared code lives in `packages/shared` or `packages/db`.
- The frontend lives in `apps/web`.
- Never import from `apps/*` within another `apps/*`. Only `packages/*` are cross-app dependencies.

## Scheduling
- **BullMQ delayed jobs are the ONLY scheduler.** Period.
- `queue.add(name, data, { delay, jobId, attempts, backoff, removeOnComplete })` is how you schedule.
- `jobId` MUST be deterministic (use `email.id`). This makes duplicate enqueues a no-op.

## Database
- All DB access goes through `packages/db` (the PrismaClient singleton).
- Use Prisma transactions for multi-row operations.
- Never perform raw SQL unless strictly necessary (e.g., atomic claim UPDATE … RETURNING).

## Idempotency
- The atomic SQL claim (`UPDATE email SET status='SENDING' WHERE status IN ('SCHEDULED') RETURNING *`) is the single gate for sending.
- If 0 rows are returned, the job exits successfully — it was already handled.
- This guards against BullMQ delivering the same job twice after a crash.

## Rate Limiting
- Redis Lua scripts for all atomic counters. Never use in-memory state for rate limiting.
- Hourly window key: `rl:{senderId}:{yyyyMMddHH}`.
- Per-sender throttle key: `throttle:{senderId}`.

## Error Handling
- All Express routes must use the central error handler.
- Workers must catch and categorise errors: transient (retry) vs permanent (mark FAILED).
- Never swallow errors silently. Log with pino.

## Configuration
- All limits, delays, and concurrency come from `apps/*/src/config/env.ts` (zod-validated).
- Nothing hardcoded in business logic.
