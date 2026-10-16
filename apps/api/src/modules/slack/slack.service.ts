import crypto from 'crypto';
import { prisma } from '../../core/db/index.js';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger/index.js';

interface SlackOAuthResponse {
  ok: boolean;
  incoming_webhook?: {
    url: string;
    channel: string;
    channel_id: string;
    configuration_url: string;
  };
  team?: {
    name: string;
    id: string;
  };
  error?: string;
}

export function generateState(userId: string): string {
  const payload = JSON.stringify({ userId, nonce: crypto.randomBytes(16).toString('hex') });
  const hmac = crypto
    .createHmac('sha256', env.SLACK_STATE_SECRET)
    .update(payload)
    .digest('hex');
  return Buffer.from(JSON.stringify({ payload, hmac })).toString('base64url');
}

export function verifyState(state: string): { userId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    const { payload, hmac } = decoded as { payload: string; hmac: string };
    const expected = crypto
      .createHmac('sha256', env.SLACK_STATE_SECRET)
      .update(payload)
      .digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) return null;
    const { userId } = JSON.parse(payload) as { userId: string };
    return { userId };
  } catch {
    return null;
  }
}

export async function exchangeSlackCode(code: string, userId: string): Promise<void> {
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    client_secret: env.SLACK_CLIENT_SECRET,
    code,
    redirect_uri: env.SLACK_REDIRECT_URI,
  });

  const resp = await fetch(`https://slack.com/api/oauth.v2.access?${params.toString()}`);
  const data = (await resp.json()) as SlackOAuthResponse;

  if (!data.ok || !data.incoming_webhook || !data.team) {
    logger.error({ data }, 'Slack OAuth exchange failed');
    throw new Error('Slack OAuth failed: ' + (data.error ?? 'unknown'));
  }

  await prisma.slackConnection.upsert({
    where: { userId },
    update: {
      webhookUrl: data.incoming_webhook.url,
      channel: data.incoming_webhook.channel,
      teamName: data.team.name,
    },
    create: {
      userId,
      webhookUrl: data.incoming_webhook.url,
      channel: data.incoming_webhook.channel,
      teamName: data.team.name,
    },
  });
}

export async function getSlackStatus(userId: string) {
  const conn = await prisma.slackConnection.findUnique({ where: { userId } });
  return {
    connected: conn !== null,
    channel: conn?.channel ?? null,
    teamName: conn?.teamName ?? null,
  };
}

export async function disconnectSlack(userId: string): Promise<void> {
  await prisma.slackConnection.deleteMany({ where: { userId } });
}
