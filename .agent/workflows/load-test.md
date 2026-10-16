# Load Test Workflow

## Purpose
Verify that 1000 emails scheduled to a single sender with a low hourly limit (10) are:
- Never dropped
- Never duplicated
- Overflow lands in later windows in ascending order

## Prerequisites
- `npm run infra:up` — all containers healthy
- Set `MAX_EMAILS_PER_HOUR_PER_SENDER=10` and `MIN_DELAY_BETWEEN_EMAILS_MS=500` in `.env`
- Restart api and worker after env change
- One sender configured

## Steps

### 1. Schedule 1000 emails
```bash
# Generate payload
node -e "
const recipients = Array.from({length: 1000}, (_, i) => \`user\${i+1}@example.com\`);
const body = {
  subject: 'Load Test',
  body: 'Load test email body',
  recipients,
  startTime: new Date(Date.now() + 5000).toISOString(),
  delayBetweenMs: 0,
  hourlyLimit: 10
};
console.log(JSON.stringify(body));
" > /tmp/loadtest.json

curl -s -X POST http://localhost:4000/emails/schedule \
  -H "Content-Type: application/json" \
  --cookie "token=<JWT>" \
  -d @/tmp/loadtest.json | jq '{count: (.data | length), firstId: .data[0].id}'
```

### 2. Monitor in real time
```bash
# Bull Board: http://localhost:4000/admin/queues
# Watch "delayed", "active", "completed" counts

# Database counts by status
watch -n 5 'psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM \"Email\" GROUP BY status;"'
```

### 3. Assert no drops (after all windows process)
The test covers 1000 emails with limit=10/hour → 100 windows needed.
For a quick test, wait at least 3 windows (3 hours real time) or use time manipulation.

```bash
# After sufficient time, assert:
psql $DATABASE_URL -c "
SELECT
  status,
  COUNT(*) as count
FROM \"Email\"
WHERE subject = 'Load Test'
GROUP BY status;
"
# Expected: SENT=1000, FAILED=0, SCHEDULED=0
```

### 4. Assert no duplicates
```bash
psql $DATABASE_URL -c "
SELECT \"messageId\", COUNT(*) as c
FROM \"Email\"
WHERE subject = 'Load Test' AND \"messageId\" IS NOT NULL
GROUP BY \"messageId\"
HAVING COUNT(*) > 1;
"
# Expected: 0 rows
```

### 5. Assert window ordering
```bash
psql $DATABASE_URL -c "
SELECT
  DATE_TRUNC('hour', \"sentAt\") as window,
  COUNT(*) as sent_count,
  MIN(\"sentAt\") as first_sent,
  MAX(\"sentAt\") as last_sent
FROM \"Email\"
WHERE subject = 'Load Test' AND status = 'SENT'
GROUP BY window
ORDER BY window;
"
# Expected: each window has ~10 emails, windows are in order
```

### 6. Assert original ordering preserved
```bash
psql $DATABASE_URL -c "
SELECT
  DATE_TRUNC('hour', \"sentAt\") as window,
  MIN(\"scheduledAt\") as earliest_scheduled,
  MAX(\"scheduledAt\") as latest_scheduled
FROM \"Email\"
WHERE subject = 'Load Test' AND status = 'SENT'
GROUP BY window
ORDER BY window;
"
# Expected: emails scheduled earlier land in earlier windows
```

## Expected Results
```
✅ Total SENT = 1000
✅ Total FAILED = 0
✅ Total SCHEDULED = 0 (after all windows processed)
✅ No duplicate messageIds
✅ Each hour window has ≤ 10 sent emails
✅ Overflow emails appear in subsequent windows in original order
✅ Slack notification sent once per window when limit first hit
✅ Bull Board shows no stuck jobs
```

## Notes
- Worker concurrency × throttle delay drives throughput within a window.
- The per-sender throttle ensures a minimum `MIN_DELAY_BETWEEN_EMAILS_MS` between sends.
- The Lua script's atomic INCR ensures no over-counting across concurrent workers.
