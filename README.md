# ReachInbox Email Job Scheduler

A production-grade, distributed email scheduling service and modern dashboard built to reliably deliver time-delayed emails at scale. Survives server and worker restarts with zero lost jobs and zero duplicate sends.

---

## Key Highlights

- **BullMQ + Redis Delayed Jobs**: Strictly delayed jobs with AOF-persisted Redis — **zero cron jobs, no intervals, no OS crons**.
- **Two-Layer Idempotency**:
  1. Deterministic BullMQ `jobId = email.id` (duplicate enqueue is a no-op).
  2. Atomic SQL test-and-set claim (`UPDATE ... WHERE status = 'SCHEDULED' RETURNING *`).
- **Distributed Rate Limiting & Throttling**:
  - Atomic Redis Lua script enforces hourly send limits across arbitrary numbers of worker instances with automatic rollbacks.
  - Per-sender throttle lock (`SET throttle:{senderId} 1 NX PX minDelayMs`) prevents burst spam without sleeping or blocking worker threads.
- **Fail-Safe Crash Recovery (Reconcile)**:
  - Startup reconciliation resets stale `SENDING` rows (from crashed workers) back to `SCHEDULED`.
  - Re-enqueues orphaned `SCHEDULED` database records into Redis with deterministic IDs.
- **Multi-Sender & Ethereal SMTP**:
  - Supports multiple sender mailboxes with automatic round-robin dispatch.
  - Built-in Ethereal test account generation with one-click preview URLs.
- **Slack Alerting via OAuth**:
  - Connect your Slack workspace with one click.
  - Notifies designated channels when rate limits are exceeded, deduplicated per window.
- **Elasticsearch Search**:
  - Full-text search over email subjects, bodies, recipients, and status.
  - Decoupled via fire-and-forget indexing (ES downtime never interrupts email delivery).
- **Modern React Dashboard**:
  - Dark glassmorphism UI with Tailwind CSS.
  - CSV recipient upload with column mapping and auto-validation.
  - Real-time scheduled and sent tables with auto-refresh and pagination.
  - Embedded Bull Board queue monitor at `/admin/queues`.

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │              React Web App             │
                      │        (Dashboard / CSV Compose)       │
                      └───────────────────┬────────────────────┘
                                          │ REST / Cookies
                                          ▼
                      ┌────────────────────────────────────────┐
                      │            Express REST API            │
                      │   (Auth, Schedule, Senders, Search)    │
                      └───────┬──────────────┬──────────┬──────┘
                              │              │          │
                     Schedule │     Enqueue  │          │ Index
                     Batch    │     Delayed  │          │
                              ▼              ▼          ▼
                       ┌────────────┐ ┌───────────┐ ┌───────────────┐
                       │ PostgreSQL │ │ Redis AOF │ │ Elasticsearch │
                       │  (Prisma)  │ │ (BullMQ)  │ │    (Search)   │
                       └──────┬─────┘ └─────┬─────┘ └───────────────┘
                              │             │
                    Atomic    │   Delayed   │
                    Claim     │   Trigger   │
                              ▼             ▼
                      ┌────────────────────────────────────────┐
                      │             BullMQ Worker              │
                      │  - Atomic Claim (SQL)                  │
                      │  - Lua Hourly Rate Limiter (Redis)     │
                      │  - Per-Sender Throttle (Redis NX)      │
                      │  - Reconciler on Startup               │
                      └───────────────────┬────────────────────┘
                                          │
                        ┌─────────────────┴─────────────────┐
                        ▼                                   ▼
             ┌─────────────────────┐             ┌─────────────────────┐
             │    Ethereal SMTP    │             │   Slack Webhook     │
             │   (Fake Mailbox)    │             │   (Rate Alert)      │
             └─────────────────────┘             └─────────────────────┘
```

For full architectural diagrams and deep-dive explanations, see [docs/architecture.md](file:///c:/Disk_D/reachinbox-scheduler/docs/architecture.md).  
For architectural trade-offs and rationale, see [docs/trade-offs.md](file:///c:/Disk_D/reachinbox-scheduler/docs/trade-offs.md).

---

## Monorepo Layout

```
reachinbox-scheduler/
├── apps/
│   ├── api/          # Express REST API (Auth, Bull Board, Email CRUD, Search)
│   ├── worker/       # BullMQ worker process (Atomic claims, Lua limiter, SMTP sender)
│   └── web/          # React + Vite + Tailwind CSS dashboard
├── packages/
│   ├── shared/       # Shared TypeScript types, Zod schemas, constants
│   └── db/           # Prisma schema, migrations, and database client
├── infra/            # Docker Compose configuration (PostgreSQL, Redis, Elasticsearch)
├── docs/             # Architecture, design decisions, and trade-offs documentation
└── .agent/           # Workflows and agent rules
```

---

## Getting Started

### 1. Prerequisites
- **Node.js**: `v20.0.0` or higher
- **npm**: `v10.0.0` or higher
- **Docker Desktop**: For PostgreSQL, Redis, and Elasticsearch

### 2. Environment Setup

Copy `.env.example` to `.env` in the root directory:

```bash
cp .env.example .env
```

Ensure your `.env` contains:
```env
PORT=4000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
JWT_SECRET=super-secret-jwt-key-min-32-chars-long-here
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/reachinbox
REDIS_URL=redis://localhost:6379
ES_NODE=http://localhost:9200
WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_EMAILS_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200
MAX_ATTEMPTS=3

# Optional: Google OAuth credentials for Google Sign-In
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback

# Required only if enabling email/password registration or password resets
AUTH_EMAIL_SMTP_HOST=smtp.example.com
AUTH_EMAIL_SMTP_PORT=587
AUTH_EMAIL_SMTP_USER=your-smtp-username
AUTH_EMAIL_SMTP_PASS=your-smtp-password-or-app-password
AUTH_EMAIL_FROM=no-reply@example.com

# Optional: Slack OAuth credentials for Slack alerts
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
SLACK_REDIRECT_URI=http://localhost:4000/slack/oauth/callback
SLACK_STATE_SECRET=another-super-secret-key-32-chars
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Infrastructure Containers

```bash
npm run infra:up
```

This starts:
- **PostgreSQL 16**: Port `5432`
- **Redis 7 (AOF enabled)**: Port `6379`
- **Elasticsearch 8.13.4**: Port `9200`

### 5. Run Database Migrations

```bash
npm run db:migrate
```

### 6. Start Development Servers

Run in separate terminal tabs or processes:

```bash
# Terminal 1: Backend API
npm run dev:api

# Terminal 2: BullMQ Worker
npm run dev:worker

# Terminal 3: Frontend Dashboard
npm run dev:web
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Key Features & Endpoints

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Healthcheck (Postgres, Redis, Elasticsearch status) |
| `GET` | `/auth/google` | Google OAuth initiation |
| `GET` | `/auth/google/callback` | Google OAuth callback handler |
| `GET` | `/auth/me` | Fetch authenticated session profile |
| `POST` | `/auth/logout` | Clear session cookie |
| `GET` | `/senders` | List all configured email senders |
| `POST` | `/senders` | Add custom SMTP sender |
| `POST` | `/senders/ethereal` | Automatically generate a test Ethereal SMTP sender |
| `POST` | `/emails/schedule` | Schedule emails for one or more recipients |
| `GET` | `/emails/scheduled` | Paginated list of upcoming scheduled emails |
| `GET` | `/emails/sent` | Paginated list of sent/failed emails |
| `GET` | `/search/emails` | Elasticsearch full-text query across emails |
| `GET` | `/slack/oauth/start` | Initiate Slack OAuth integration |
| `GET` | `/slack/oauth/callback`| Slack OAuth callback |
| `GET` | `/slack/status` | Get connected Slack channel status |
| `POST` | `/slack/disconnect` | Disconnect Slack integration |
| `GET` | `/admin/queues` | Bull Board queue UI |

---

## Reliability & Fault Tolerance

### Crash Recovery & Restart Verification
When the worker starts, `bootstrap/reconcile.ts` runs automatically:
1. Recovers any jobs stuck in `SENDING` status for more than 5 minutes (indicating a worker node was abruptly killed or crashed mid-flight).
2. Checks all `SCHEDULED` records in PostgreSQL and verifies their presence in Redis. If any job is missing, it re-queues it with `jobId = email.id`.
3. Because BullMQ enforces unique job IDs, re-adding already existing jobs is safely ignored.

Detailed test procedure: See [.agent/workflows/verify-restart.md](file:///c:/Disk_D/reachinbox-scheduler/.agent/workflows/verify-restart.md).

### High Load (1000+ Emails) Handling
When 1,000 emails are scheduled to send:
1. Each recipient gets an exact scheduled send timestamp staggered by `delayBetweenEmailsMs`.
2. As jobs become due, the BullMQ worker picks them up concurrently (controlled by `WORKER_CONCURRENCY`).
3. The atomic Redis Lua script checks a per-email hourly limit saved from the Compose form; when omitted, it falls back to the sender limit, then `MAX_EMAILS_PER_HOUR_PER_SENDER`.
4. Once the hourly limit is exhausted, excess emails are non-destructively rescheduled to the next hour window (`nextHourWindowStart + (scheduledAt % 3600000)`).
5. No jobs are dropped, no memory leaks occur, and order within windows is preserved.

Detailed load-testing procedure: See [.agent/workflows/load-test.md](file:///c:/Disk_D/reachinbox-scheduler/.agent/workflows/load-test.md).

---

## Testing

Run Vitest across all packages and apps:

```bash
npm test
```

---

## License

MIT License. Built for ReachInbox.
