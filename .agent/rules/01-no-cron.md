# No-Cron Rule

## Absolute Prohibition
**NEVER use any of the following:**
- OS cron (crontab, Windows Task Scheduler)
- `node-cron`
- `agenda`
- `node-schedule`
- `setInterval` for scheduling email sends
- `setTimeout` loops for polling
- Any library that wraps a time-based polling scheduler

## Why
Cron-based scheduling does not survive process restarts without external state. BullMQ with Redis AOF persistence is the correct solution: jobs survive restarts, are distributed across workers, and are deduplicated by `jobId`.

## The Only Allowed Pattern
```typescript
await queue.add('send-email', payload, {
  delay: Math.max(0, scheduledAt.getTime() - Date.now()),
  jobId: email.id,           // deterministic — duplicate add = no-op
  attempts: env.MAX_ATTEMPTS,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 86400, count: 1000 },
});
```

## Rescheduling Pattern (when throttled or rate-limited)
```typescript
// Inside processor, when limit is hit:
await job.moveToDelayed(Date.now() + delayMs, token);
throw new DelayedError('Moved to delayed queue');
```

## Grep Check (CI)
```bash
grep -rn "node-cron\|setInterval\|node-schedule\|agenda\b" apps/ packages/
# Must return zero results.
```
