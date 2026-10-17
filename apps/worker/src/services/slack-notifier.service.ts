import { prisma } from '@rs/db';
import { getRedis } from '../redis.js';
import { logger } from '../logger.js';
import { decryptSecret } from '@rs/db';

interface NotifyParams {
  userId: string;
  senderId: string;
  senderEmail: string;
  limit: number;
  window: string;
  nextWindowMs: number;
}

/**
 * Sends a Slack webhook notification when a sender hits their hourly limit.
 * Deduplicated: only one message per sender per window.
 * Reads webhook URL from DB at call time (no redeploy needed after connecting).
 * Silently skips if user hasn't connected Slack.
 */
export async function notifyRateLimitHit(params: NotifyParams): Promise<void> {
  const { userId, senderId, senderEmail, limit, window, nextWindowMs } = params;
  const redis = getRedis();

  // Fetch Slack connection from DB at notify time
  const connection = await prisma.slackConnection.findUnique({ where: { userId } }).catch(
    () => null,
  );

  if (!connection) {
    logger.debug({ userId }, 'No Slack connection; skipping notification');
    return;
  }

  // Deduplicate only after confirming Slack is connected. Otherwise a limit hit
  // while disconnected would consume this sender/window's notification.
  const dedupKey = `slack:notified:${senderId}:${window}`;
  const isFirst = await redis.set(dedupKey, '1', 'EX', 7200, 'NX');
  if (isFirst !== 'OK') {
    logger.debug({ senderId, window }, 'Slack notification already sent for this window');
    return;
  }

  const nextWindowTime = new Date(nextWindowMs).toISOString();
  const message = {
    text: `⚠️ *Rate Limit Hit* — sender \`${senderEmail}\` has reached its hourly limit of *${limit} emails* in window \`${window}\`. Overflow emails will be sent starting at *${nextWindowTime}*.`,
  };

  try {
    const webhookUrl = decryptSecret(connection.webhookUrl);
    const parsedWebhook = new URL(webhookUrl);
    if (parsedWebhook.protocol !== 'https:' || parsedWebhook.hostname !== 'hooks.slack.com' || !parsedWebhook.pathname.startsWith('/services/')) {
      await redis.del(dedupKey);
      logger.error({ senderId }, 'Stored Slack webhook URL failed validation');
      return;
    }
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!resp.ok) {
      await redis.del(dedupKey);
      logger.warn(
        { status: resp.status, senderId, window },
        'Slack webhook returned non-OK status',
      );
    } else {
      logger.info({ senderId, window, userId }, 'Slack rate-limit notification sent');
    }
  } catch (err) {
    // Catch and log — must not fail the job
    await redis.del(dedupKey).catch(() => undefined);
    logger.error({ errorName: err instanceof Error ? err.name : 'UnknownError', senderId, window }, 'Failed to send Slack notification');
  }
}
