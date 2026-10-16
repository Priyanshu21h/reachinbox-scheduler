# Verify Restart Workflow

## Purpose
Confirm that scheduled emails survive a complete API + Worker process restart and are sent exactly once at (approximately) the right time.

## Prerequisites
- `npm run infra:up` — all containers healthy
- `npm run dev:api` and `npm run dev:worker` running
- At least one sender configured (or use the Ethereal helper)
- Valid JWT cookie (logged in via Google OAuth)

## Steps

### 1. Schedule 5 emails ~2 minutes in the future
```bash
curl -s -X POST http://localhost:4000/emails/schedule \
  -H "Content-Type: application/json" \
  --cookie "token=<JWT>" \
  -d '{
    "subject": "Restart Test",
    "body": "If you receive this, restart recovery worked.",
    "recipients": [
      "test1@example.com",
      "test2@example.com",
      "test3@example.com",
      "test4@example.com",
      "test5@example.com"
    ],
    "startTime": "<ISO_2_MINUTES_FROM_NOW>",
    "delayBetweenMs": 2000,
    "hourlyLimit": 60
  }'
```
Record the 5 email IDs from the response.

### 2. Verify jobs exist in Redis/BullMQ
```bash
# Check Bull Board at http://localhost:4000/admin/queues
# All 5 jobs should be in "delayed" state
```

### 3. Kill both processes
```
Ctrl+C on dev:api terminal
Ctrl+C on dev:worker terminal
```

### 4. Wait 30 seconds, then restart
```bash
npm run dev:api    # in one terminal
npm run dev:worker # in another terminal
```

### 5. Observe worker logs
- `reconcile.ts` should log "Found N orphaned SCHEDULED jobs, re-queuing..." (should be 0 if Redis is intact, as AOF persisted the jobs)
- Jobs should process at their original `scheduledAt` time

### 6. Check status via API
```bash
for ID in <id1> <id2> <id3> <id4> <id5>; do
  curl -s http://localhost:4000/emails/sent --cookie "token=<JWT>" | jq ".data[] | select(.id == \"$ID\") | {id, status, sentAt}"
done
```

### 7. Verify Ethereal
- Each email's `messageId` should appear in the Ethereal inbox
- Exactly 5 messages — no duplicates

## Expected Result
```
✅ All 5 emails: status=SENT
✅ sentAt within ~5s of their scheduledAt
✅ No duplicate messages in Ethereal
✅ Worker logs show no "already handled" messages (idempotency not triggered)
```

## Idempotency Check
If the worker happened to crash mid-send:
- The atomic claim (`UPDATE WHERE status='SCHEDULED'`) ensures no double-send
- The BullMQ `jobId` ensures no double-enqueue during reconcile
