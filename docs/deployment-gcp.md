# Google Cloud VM deployment

This demo deployment runs PostgreSQL, Redis, and Elasticsearch in Docker Compose, with the API and BullMQ worker as PM2 processes. Caddy serves the built React app and routes `/api/*` to the API on the same hostname. Only ports 80 and 443 should be public; the data services stay bound to localhost.

## Before creating the VM

- Keep the Google Cloud project on its Free Trial billing account if you want to avoid paid-account charges. The VM will stop when the trial ends or its credits run out unless you upgrade.
- Use Ubuntu 24.04 LTS, an `e2-standard-2` VM, a 30 GB disk, and a reserved static external IP in `asia-south1` for this low-traffic demo. Monitor memory because Elasticsearch uses some of it.
- In the VM firewall, allow HTTP (80) and HTTPS (443). Do not allow inbound 4000, 5433, 6379, or 9200.
- Pick a hostname that resolves to the static IP. Replace the example hostname in `infra/Caddyfile.example` and use that exact hostname for OAuth callback URLs.

## Get the app running on the VM

1. Install Git, Node.js 20+, npm 10+, Docker Engine with the Compose plugin, PM2, and Caddy.
2. Clone this repository into `/opt/reachinbox-scheduler` using a deploy key or other private-repository access method. Keep credentials out of shell history.
3. Copy `.env.example` to the repository root as `.env`. Fill in the existing Google OAuth, Slack OAuth, JWT, encryption, and admin settings. Do not commit or share `.env`.
4. For production, use a strong PostgreSQL password and make `POSTGRES_PASSWORD` match the password in `DATABASE_URL`. Keep `JWT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, and `SLACK_STATE_SECRET` strong and private. Preserve the encryption key for the lifetime of stored sender credentials.
5. Set these production values in `.env` (substitute your hostname):

   ```env
   NODE_ENV=production
   PORT=4000
   TRUST_PROXY_HOPS=1
   FRONTEND_URL=https://reachinbox.example.com
   GOOGLE_CALLBACK_URL=https://reachinbox.example.com/api/auth/google/callback
   SLACK_REDIRECT_URI=https://reachinbox.example.com/api/slack/oauth/callback
   ```

6. Add the exact Google callback URL to the Google OAuth client’s authorized redirect URIs. Add the exact Slack callback URL to the Slack app’s redirect URLs. If using a test-mode Google OAuth app, add reviewer accounts as test users or publish the app as appropriate.
7. Start the data services, install packages, build, migrate, and generate the production frontend:

   ```bash
   cd /opt/reachinbox-scheduler
   docker compose -f infra/docker-compose.yml up -d
   npm ci
   npm run build
   npm run migrate:deploy --workspace=@rs/db
   ```

   The frontend uses `/api` automatically in production builds. The Vite development server continues to use the local API.

8. Install `infra/Caddyfile.example` as `/etc/caddy/Caddyfile`, replace `reachinbox.example.com` with your hostname, and replace the static root if the repository lives somewhere else. Reload Caddy so it obtains and renews HTTPS certificates.
9. Start and persist the API and worker:

   ```bash
   pm2 start infra/ecosystem.config.cjs
   pm2 save
   pm2 startup
   ```

   Run the command printed by `pm2 startup`, then run `pm2 save` again.

## After starting

- Open `https://YOUR_HOSTNAME/` and sign in with Google. Confirm `/api/health` responds and check that Slack OAuth returns to the dashboard.
- Test scheduling with an Ethereal sender if you want simulated mail delivery.
- Open Bull Board from the app while signed in with an account listed in `ADMIN_EMAILS`.
- Watch Billing → Reports and the configured budget alerts. Alerts are not a spending limit, and Google Cloud’s current spend-cap feature does not cover Compute Engine VMs.
- Back up the database and `.env` encryption key separately. Do not expose database, Redis, Elasticsearch, or API process ports publicly.
