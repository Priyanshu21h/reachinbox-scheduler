# ReachInbox Email Job Scheduler

A production-grade email scheduling service with a dashboard. It accepts email send requests, schedules them for an exact time with **BullMQ delayed jobs on Redis (no cron anywhere)**, sends through **Ethereal SMTP** from multiple senders, and survives server and worker restarts with no lost jobs and no duplicate sends.

- Demo video: https://drive.google.com/file/d/1M7d4VucYiFGbmLbKfolP5O-jmiZbVaUD/view?usp=sharing
- Live demo (Google Cloud VM): https://35-207-219-20.sslip.io/login 

---

## Contents

1. [Key highlights](#key-highlights)
2. [Architecture](#architecture)
3. [Features implemented](#features-implemented)
4. [How scheduling works](#how-scheduling-works)
5. [How persistence on restart is handled](#how-persistence-on-restart-is-handled)
6. [How rate limiting and concurrency are implemented](#how-rate-limiting-and-concurrency-are-implemented)
7. [Behavior under load (1000+ emails)](#behavior-under-load-1000-emails)
8. [Monorepo layout](#monorepo-layout)
9. [Setup: run locally](#setup-run-locally)
10. [Ethereal Email setup](#ethereal-email-setup)
11. [Environment variables](#environment-variables)
12. [Google and Slack OAuth setup](#google-and-slack-oauth-setup)
13. [Deploying to a Google Cloud VM](#deploying-to-a-google-cloud-vm)
14. [API endpoints](#api-endpoints)
15. [Verifying the hard requirements](#verifying-the-hard-requirements)
16. [Troubleshooting](#troubleshooting)
17. [Assumptions, shortcuts and trade-offs](#assumptions-shortcuts-and-trade-offs)

---

## Key highlights

- **BullMQ + Redis delayed jobs.** Strictly delayed jobs on AOF-persisted Redis. No cron jobs, no intervals, no OS cron.
- **Two-layer idempotency.**
  - Deterministic BullMQ `jobId = email.id`, so a duplicate enqueue is a no-op.
  - Atomic SQL test-and-set claim: `UPDATE ... WHERE status = 'SCHEDULED' RETURNING *`.
- **Distributed rate limiting and throttling.**
  - An atomic Redis Lua script enforces the hourly send limit across any number of worker instances, with automatic rollback.
  - A per-sender throttle lock (`SET throttle:{senderId} 1 NX PX minDelayMs`) spaces sends without sleeping or blocking worker threads.
- **Fail-safe crash recovery.** Startup reconciliation resets stale `SENDING` rows back to `SCHEDULED` and re-enqueues orphaned `SCHEDULED` rows into Redis with deterministic ids.
- **Multi-sender with Ethereal SMTP.** Several sender mailboxes, send from one or round-robin across all, and one-click Ethereal account generation.
- **Slack alerts via OAuth.** Connect a workspace with one click. A message is posted when a sender hits its hourly limit, deduplicated per window.
- **Elasticsearch search.** Full-text search over subject, body, recipients and status. Indexing is fire-and-forget, so Elasticsearch downtime never interrupts delivery.
- **React dashboard.** Tailwind CSS dark UI, CSV recipient upload with validation, scheduled and sent tables with pagination and auto-refresh, embedded Bull Board at `/admin/queues`.

---

## Architecture

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

- The **API** validates, stores and enqueues. It never sends mail.
- The **worker** is a separate process and the only component that sends mail. Run as many instances as needed.
- **Postgres** is the source of truth for every email and its status. **Redis** is the clock and the shared counter store.

---

## Features implemented

### Backend

| Area | Implementation |
|---|---|
| Scheduler | Schedule API stores emails in PostgreSQL and enqueues one BullMQ delayed job per email. No cron. |
| Persistence | AOF Redis plus Postgres as source of truth. Reconciliation at worker start. Emails already sent are never re-sent. |
| Idempotency | `jobId = email.id` plus atomic SQL claim before sending. |
| Concurrency | `WORKER_CONCURRENCY` parallel jobs per worker. Safe in parallel because of the atomic claim. |
| Delay between sends | Per-sender Redis lock, `MIN_DELAY_BETWEEN_EMAILS_MS` (default **2000 ms**). |
| Hourly rate limit | Atomic Redis Lua counter per sender and hour window. Limit order: per-email limit from the Compose form, then sender limit, then `MAX_EMAILS_PER_HOUR_PER_SENDER` (default **200**). Over-limit jobs are rescheduled into the next hour window, never dropped. |
| Multiple senders | Many SMTP senders per user. Round-robin or pick a sender. One-click Ethereal sender. |
| Search | Elasticsearch indexing of scheduled and sent emails, plus a search endpoint. |
| Queue visibility | Bull Board at `/admin/queues`, restricted to `ADMIN_EMAILS`. |
| Slack notification | Real OAuth. Message posted when the hourly limit is hit. Not connected means no alert and no crash. Connect later without redeploying. |
| Security | SMTP and Slack credentials encrypted at rest. SMTP host allow-list. Rate limiting on sensitive API routes. |

### Frontend

| Area | Implementation |
|---|---|
| Login | Real Google OAuth. Header shows name, email and avatar, with logout. |
| Dashboard | Tabs for **Scheduled Emails** and **Sent Emails**, stat cards, Compose button, Bull Board link, Connect Slack button. |
| Compose | Subject, body, CSV or text lead upload with the detected address count, start time, delay between emails, hourly limit, sender choice. |
| Tables | Email, subject, time and status columns, pagination and auto-refresh. |
| UX | Loading states, empty states, error toasts. |
| Code quality | Reusable UI components, typed API client, shared types and zod schemas from `packages/shared`. |

---

## How scheduling works

1. The schedule request arrives with subject, body, recipients, start time, delay between emails, hourly limit and an optional sender.
2. The API validates it with zod schemas shared with the frontend.
3. In **one database transaction** it inserts one row per recipient with status `SCHEDULED`. Email *i* is scheduled at `startTime + i × delayBetweenEmailsMs`.
4. It adds one BullMQ job per email with `jobId = email.id` and `delay = scheduledAt − now`.
5. Each email is indexed in Elasticsearch (best effort).
6. At the due time BullMQ moves the job from *delayed* to *waiting* and a worker picks it up.

No cron job, `node-cron`, `agenda` or OS cron is used. `cron-parser` appears in `node_modules` only because BullMQ depends on it internally. The application never uses it for scheduling.

---

## How persistence on restart is handled

- **Redis AOF.** Redis runs with `appendonly yes` and a Docker volume, so delayed jobs survive a Redis restart.
- **Postgres as truth.** Every email row exists independently of Redis.
- **Reconciliation at worker start** (`apps/worker/src/bootstrap/reconcile.ts`):
  - Rows stuck in `SENDING` (a worker crashed mid-send) are reset to `SCHEDULED`.
  - All `SCHEDULED` rows are checked against Redis. Any missing job is re-queued with `jobId = email.id`. Existing jobs are ignored because BullMQ enforces unique ids.
- **No restart from scratch.** Sent emails are never touched. Future emails keep their original schedule.

---

## How rate limiting and concurrency are implemented

**Concurrency.** The BullMQ worker runs with `concurrency = WORKER_CONCURRENCY`.

**Atomic claim.** Before sending, the worker moves the email from `SCHEDULED` to `SENDING` in a single update. If nothing was updated, another worker owns it and the job exits.

**Minimum delay between sends.** A per-sender Redis key `throttle:{senderId}` is set with `NX PX MIN_DELAY_BETWEEN_EMAILS_MS`. If the key already exists, the job is moved back to delayed for the remaining time. Workers never sleep or block. Default delay: **2 seconds**.

**Hourly limit.** An atomic Redis Lua script (`apps/worker/src/lua/hourly-counter.lua`) increments a counter per sender and hour window and rolls back when the send does not happen. The check runs right before sending.

- Under the limit: the email is sent.
- At the limit: the job is **not failed and not dropped**. It is rescheduled to the next hour window at `nextHourWindowStart + (scheduledAt % 3600000)`, which keeps the original order inside the new window.
- The first limit hit per sender and window triggers one Slack alert.

Counters live in Redis, not process memory, so the logic is correct with several workers or instances.

---

## Behavior under load (1000+ emails)

1. Each recipient gets an exact send timestamp, spaced by `delayBetweenEmailsMs`.
2. As jobs become due, workers pick them up concurrently, capped by `WORKER_CONCURRENCY`.
3. The throttle spaces sends per sender.
4. The Lua limiter caps each sender per hour. Once exhausted, excess emails are non-destructively rescheduled into following hour windows.
5. No jobs are dropped or duplicated, and order within each window is preserved. A restart mid-way follows the same rules.

---

## Monorepo layout

```
reachinbox-scheduler/
├── apps/
│   ├── api/          # Express REST API (auth, senders, emails, search, Slack, Bull Board)
│   ├── worker/       # BullMQ worker (atomic claim, Lua limiter, throttle, SMTP, reconcile)
│   └── web/          # React + Vite + Tailwind dashboard
├── packages/
│   ├── shared/       # Shared TypeScript types, zod schemas, constants
│   └── db/           # Prisma schema, migrations, database client
├── infra/            # Docker Compose (PostgreSQL, Redis, Elasticsearch)
├── docs/             # Architecture, trade-offs, deployment notes
├── ecosystem.config.cjs   # pm2 process file for deployment
└── .env.example
```

Tech stack: TypeScript, Express, BullMQ, Redis, PostgreSQL with Prisma, Elasticsearch, Nodemailer with Ethereal, React, Vite, Tailwind CSS, Docker.

---

## Setup: run locally

### 1. Prerequisites

- Node.js **22 or newer** and npm 10 or newer
- Docker Desktop (PostgreSQL, Redis, Elasticsearch)
- On Linux only, for Elasticsearch: `sudo sysctl -w vm.max_map_count=262144`

### 2. Environment

```bash
git clone <repo-url>
cd reachinbox-scheduler
cp .env.example .env
```

Fill `.env` (see [Environment variables](#environment-variables)). Generate the secrets:

```bash
openssl rand -hex 32       # JWT_SECRET
openssl rand -base64 32    # CREDENTIALS_ENCRYPTION_KEY and SLACK_STATE_SECRET (use a different value for each)
```

A minimal local database section:

```
POSTGRES_USER=rs
POSTGRES_PASSWORD=rs
POSTGRES_DB=reachinbox
DATABASE_URL=postgresql://rs:rs@localhost:5433/reachinbox
```

The Postgres container is published on host port **5433**, so use `5433` in `DATABASE_URL`.

### 3. Install dependencies

```bash
npm install
```

### 4. Start infrastructure

```bash
npm run infra:up
docker ps          # postgres, redis and elasticsearch should be healthy
```

This starts PostgreSQL 16 (host port 5433), Redis 7 with AOF (6379) and Elasticsearch 8.13.4 (9200).

### 5. Generate the Prisma client and run migrations

```bash
npx prisma generate --schema=packages/db/prisma/schema.prisma
npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
```

### 6. Start the backend and frontend

Use three terminals:

```bash
npm run dev:api        # Express API on http://localhost:4000 (Bull Board at /admin/queues)
npm run dev:worker     # BullMQ worker
npm run dev:web        # Dashboard on http://localhost:5173
```

Open http://localhost:5173, sign in with Google, add a sender, and compose an email.

---

## Ethereal Email setup

[Ethereal](https://ethereal.email) is a fake SMTP service. It accepts mail and shows it in a web inbox, but never delivers to real recipients.

**Option A: one click from the app.** Use the add-sender action in the dashboard, or call:

```
POST /senders/ethereal
```

(`POST /api/senders/ethereal` when served behind the reverse proxy.) It creates a new Ethereal account and stores it as one of your senders.

**Option B: by hand.**

1. Open https://ethereal.email and click **Create Ethereal Account**.
2. Copy the generated address and password.
3. Add a sender with host `smtp.ethereal.email`, port `587`, and that address and password.
4. To read mail, log in at https://ethereal.email/login and open **Messages**.

Create several accounts to demonstrate multiple senders and round-robin.

Only hosts listed in `SMTP_ALLOWED_HOSTS` can be used. The default allows `smtp.ethereal.email`.

---

## Environment variables

See `.env.example` for the full list.

| Variable | Purpose |
|---|---|
| `PORT` | API port (default 4000) |
| `FRONTEND_URL` | CORS origin and post-login redirect target |
| `NODE_ENV` | `development` or `production` |
| `JWT_SECRET` | Signs login cookies (at least 32 characters) |
| `CREDENTIALS_ENCRYPTION_KEY` | Base64 32-byte key that encrypts SMTP and Slack credentials. Keep it stable. Changing it breaks saved senders |
| `ADMIN_EMAILS` | Comma-separated Google emails allowed to open Bull Board |
| `SMTP_ALLOWED_HOSTS` | Comma-separated allow-list of outbound SMTP hosts |
| `TRUST_PROXY_HOPS` | `0` locally, `1` behind Caddy or another reverse proxy |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Database container settings |
| `DATABASE_URL` | Prisma connection string |
| `REDIS_URL` | Redis connection (default `redis://localhost:6379`) |
| `ES_NODE` | Elasticsearch URL (default `http://localhost:9200`) |
| `WORKER_CONCURRENCY` | Parallel jobs per worker (default 5) |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | Minimum gap between sends per sender (default **2000**) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Default hourly cap per sender (default **200**) |
| `MAX_ATTEMPTS` | Retry attempts for transient SMTP errors (default 3) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Google OAuth login (required for Google sign-in) |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI`, `SLACK_STATE_SECRET` | Slack OAuth (needed only for Slack alerts) |
| `AUTH_EMAIL_SMTP_HOST`, `_PORT`, `_USER`, `_PASS`, `AUTH_EMAIL_FROM` | Optional. Sends verification and reset mail for email and password signup. Google login does not need it |

---

## Google and Slack OAuth setup

### Google (required for login)

1. Google Cloud Console, APIs and Services, Credentials, **Create credentials**, **OAuth client ID**, type **Web application**.
2. Add the authorized redirect URI equal to `GOOGLE_CALLBACK_URL`, for example `http://localhost:4000/auth/google/callback` locally.
3. Put the client id and secret in `.env`.
4. While the consent screen is in **Testing**, only listed test users can sign in. Add reviewers as test users, or publish the app.

### Slack (optional, for the rate-limit alert)

1. Create an app at https://api.slack.com/apps and enable **Incoming Webhooks**.
2. Add `SLACK_REDIRECT_URI` as a redirect URL. Slack requires **HTTPS**, so use a tunnel (ngrok or cloudflared) for local testing.
3. Put the client id, secret and a generated `SLACK_STATE_SECRET` in `.env`.
4. In the dashboard click **Connect Slack** and approve. Trigger a rate-limit hit to receive a message.

If Slack is not connected, limit hits do not notify and nothing crashes. Connecting later works without a redeploy.

---

## Deploying to a Google Cloud VM

This is the setup used for the live demo: one VM running Docker Compose for the data stores, pm2 for the API and worker, and Caddy for HTTPS.

1. **VM.** Ubuntu 24.04, about 2 vCPU and 8 GB RAM, 30 GB disk. Allow HTTP and HTTPS in the firewall. Reserve a static IP.
2. **Install** Docker, Node.js 22, pm2 and Caddy. Set `vm.max_map_count=262144` for Elasticsearch.
3. **Clone** the repo (a read-only deploy key works for a private repo) and create `.env`.
4. **Bind data stores to localhost only.** In `infra/docker-compose.yml` publish ports as `127.0.0.1:5433:5432`, `127.0.0.1:6379:6379` and `127.0.0.1:9200:9200`.
5. **Start infrastructure, install, migrate and build:**

   ```bash
   npm run infra:up
   npm install
   npx prisma generate --schema=packages/db/prisma/schema.prisma
   npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
   npm run build
   ```

6. **Production `.env` differences:**

   ```
   NODE_ENV=production
   TRUST_PROXY_HOPS=1
   FRONTEND_URL=https://<your-domain>
   GOOGLE_CALLBACK_URL=https://<your-domain>/api/auth/google/callback
   SLACK_REDIRECT_URI=https://<your-domain>/api/slack/oauth/callback
   ```

   Add the same two URLs in the Google and Slack consoles. Slack requires HTTPS, which Caddy provides.

7. **Run the API and worker with pm2:**

   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup        # run the printed sudo command once
   ```

   `ecosystem.config.cjs` starts `apps/api/dist/server.js` and `apps/worker/dist/main.js` with `node --env-file=.env`.

8. **Serve the dashboard and proxy the API with Caddy.** The web app calls `/api` when `VITE_API_URL` is not set, so one domain is enough:

   ```bash
   sudo mkdir -p /var/www/reachinbox
   sudo cp -r apps/web/dist/* /var/www/reachinbox/
   ```

   ```
   <your-domain> {
       encode gzip

       handle_path /api/* {
           reverse_proxy localhost:4000
       }

       handle {
           root * /var/www/reachinbox
           try_files {path} /index.html
           file_server
       }
   }
   ```

   Caddy removes the `/api` prefix before forwarding, so the API still sees paths like `/auth/google/callback`. Bull Board is then at `https://<your-domain>/api/admin/queues`.

Further notes: `docs/deployment-gcp.md`.

---

## API endpoints

When served behind the reverse proxy above, prefix every path with `/api`.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/auth/google` | Start Google OAuth |
| GET | `/auth/google/callback` | Google OAuth callback |
| GET | `/auth/me` | Current session profile |
| POST | `/auth/logout` | Clear session cookie |
| GET | `/senders` | List senders |
| POST | `/senders` | Add a custom SMTP sender |
| POST | `/senders/ethereal` | Generate a test Ethereal sender |
| DELETE | `/senders/:id` | Remove a sender |
| POST | `/emails/schedule` | Schedule emails for one or more recipients |
| GET | `/emails/scheduled` | Paginated upcoming emails |
| GET | `/emails/sent` | Paginated sent and failed emails |
| GET | `/search/emails` | Elasticsearch full-text query |
| GET | `/slack/oauth/start` | Start Slack OAuth |
| GET | `/slack/oauth/callback` | Slack OAuth callback |
| GET | `/slack/status` | Slack connection status |
| POST | `/slack/disconnect` | Disconnect Slack |
| GET | `/admin/queues` | Bull Board (admin emails only) |

---

## Verifying the hard requirements

**No cron**

```bash
grep -rniE "node-cron|agenda|crontab" apps packages --include=*.ts --include=*.tsx --include=package.json
```

Expect no matches.

**Survives restart**

1. Schedule 5 emails about 3 minutes ahead.
2. Open Bull Board: 5 delayed jobs.
3. Stop the API and worker, wait, start them again. The worker log shows the reconciliation line.
4. Bull Board still shows the delayed jobs. At the due time each email is sent exactly once.

**Rate limit and delay under load**

1. Set `MAX_EMAILS_PER_HOUR_PER_SENDER=3` and restart the worker.
2. Schedule 10 emails for one sender.
3. Three are sent, spaced at least 2 seconds apart. The other seven stay delayed to the next hour window. None fail. If Slack is connected, one alert arrives.

**Idempotency.** Restart repeatedly. Each recipient appears once on the Sent tab.

**Tests**

```bash
npm test
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm run dev:*` prints a `dotenv` usage message | Another `dotenv` binary won. Run the script through the CLI explicitly, for example `npx --yes dotenv-cli -e .env -- npm run dev --workspace=apps/api`, or start built files with `node --env-file=.env` |
| TypeScript errors like `Module '@rs/db' has no exported member` | The Prisma client is not generated. Run `npx prisma generate --schema=packages/db/prisma/schema.prisma`, then rebuild |
| `P1000 Authentication failed` | `DATABASE_URL` user, password or port do not match the Postgres container. After changing the password, reset the volume with `docker compose -f infra/docker-compose.yml down -v` |
| Elasticsearch container exits on Linux | Set `vm.max_map_count=262144` |
| Worker crashes with `ENOENT ... hourly-counter.lua` | The Lua file is missing from `apps/worker/dist/lua`. Copy `apps/worker/src/lua` into `apps/worker/dist/lua`, then restart |
| Google login says `redirect_uri_mismatch` | `GOOGLE_CALLBACK_URL` and the redirect URI in the Google console must match exactly |
| Google login blocked for a reviewer | Add them as a test user, or publish the consent screen |
| Sender creation fails with "SMTP host is not allowed" | Add the host to `SMTP_ALLOWED_HOSTS` and restart the API |

---

## Assumptions, shortcuts and trade-offs

- **Ethereal is fake SMTP.** Mail never reaches real inboxes. This is intentional for testing.
- **Single Redis and single Postgres**, no replication or failover. Fine for this scope, not for production traffic.
- **Hourly limits use fixed clock-hour windows**, not sliding windows. Simple and cheap in Redis, but a sender can use a full quota at the end of one hour and again at the start of the next.
- **Order is preserved within windows** on overflow, but strict global order across windows is best effort.
- **Elasticsearch indexing is fire-and-forget.** A search outage never blocks delivery, so the index can briefly lag the database.
- **Demo hosting** is one Google Cloud VM on a free `sslip.io` hostname. This is a demo setup, not a hardened production deployment, and it uses trial credits.
- **Google consent screen.** Reviewers must be added as test users, or the app published, before they can sign in. Installing the Slack app into other workspaces may need app distribution enabled.
- **`cron-parser`** is a transitive dependency of BullMQ and is not used for scheduling.
- Throughput values (2 s delay, 200 per hour, concurrency 5) are demo defaults and all configurable.

---

## Further reading

- `docs/architecture.md`: architecture deep dive
- `docs/trade-offs.md`: design rationale and trade-offs
- `docs/deployment-gcp.md`: Google Cloud VM deployment notes

## License

MIT License. Built for ReachInbox.
