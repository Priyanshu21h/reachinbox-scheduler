import { prisma } from '@rs/db';
import { getRedis } from '../redis.js';
import { logger } from '../logger.js';

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

  // Deduplicate: only one Slack message per window per sender
  const dedupKey = `slack:notified:${senderId}:${window}`;
  const isFirst = await redis.set(dedupKey, '1', 'EX', 7200, 'NX');
  if (isFirst !== 'OK') {
    logger.debug({ senderId, window }, 'Slack notification already sent for this window');
    return;
  }

  // Fetch Slack connection from DB at notify time
  const connection = await prisma.slackConnection.findUnique({ where: { userId } }).catch(
    () => null,
  );

  if (!connection) {
    logger.debug({ userId }, 'No Slack connection; skipping notification');
    return;
  }

  const nextWindowTime = new Date(nextWindowMs).toISOString();
  const message = {
    text: `⚠️ *Rate Limit Hit* — sender \`${senderEmail}\` has reached its hourly limit of *${limit} emails* in window \`${window}\`. Overflow emails will be sent starting at *${nextWindowTime}*.`,
  };

  try {
    const resp = await fetch(connection.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!resp.ok) {
      logger.warn(
        { status: resp.status, senderId, window },
        'Slack webhook returned non-OK status',
      );
    } else {
      logger.info({ senderId, window, userId }, 'Slack rate-limit notification sent');
    }
  } catch (err) {
    // Catch and log — must not fail the job
    logger.error({ err, senderId, window }, 'Failed to send Slack notification');
  }
}
