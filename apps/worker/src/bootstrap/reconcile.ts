import { Queue } from 'bullmq';
import { prisma } from '@rs/db';
import { EMAIL_QUEUE, type SendEmailJobData } from '@rs/shared';
import { getRedis } from '../redis.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

const STALE_SENDING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Reconcile runs at worker startup.
 * 1. Resets rows stuck in SENDING > STALE_SENDING_THRESHOLD_MS → SCHEDULED
 * 2. Re-queues SCHEDULED rows that have no corresponding BullMQ job in Redis
 */
export async function reconcile(queue: Queue<SendEmailJobData>): Promise<void> {
  logger.info('Running startup reconciliation...');

  // ─── 1. Reset stale SENDING rows ─────────────────────────────────────────
  const staleThreshold = new Date(Date.now() - STALE_SENDING_THRESHOLD_MS);
  const resetCount = await prisma.$executeRaw`
    UPDATE "Email"
    SET status = 'SCHEDULED'
    WHERE status = 'SENDING'
      AND "updatedAt" < ${staleThreshold}
  `;

  if (resetCount > 0) {
    logger.warn(
      { count: resetCount },
      'Reset stale SENDING rows back to SCHEDULED',
    );
  }

  // ─── 2. Re-queue orphaned SCHEDULED jobs ─────────────────────────────────
  const scheduledEmails = await prisma.email.findMany({
    where: { status: 'SCHEDULED' },
    select: { id: true, scheduledAt: true },
  });

  let requeuedCount = 0;
  const now = Date.now();

  for (const email of scheduledEmails) {
    const existingJob = await queue.getJob(email.id);
    if (!existingJob) {
      const delay = Math.max(0, email.scheduledAt.getTime() - now);
      await queue.add('send-email', { emailId: email.id }, {
        jobId: email.id,
        delay,
        attempts: env.MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 7 * 86400, count: 5000 },
      });
      requeuedCount++;
      logger.debug({ emailId: email.id, delay }, 'Re-queued orphaned job');
    }
  }

  logger.info(
    { requeuedCount, total: scheduledEmails.length },
    'Reconciliation complete',
  );
}
