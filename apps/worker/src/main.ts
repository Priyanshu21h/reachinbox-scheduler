import 'dotenv/config';
import { Worker } from 'bullmq';
import { EMAIL_QUEUE } from '@rs/shared';
import { env } from './config/env.js';
import { logger } from './logger.js';
import { getRedis, disconnectRedis } from './redis.js';
import { sendEmailProcessor } from './processors/send-email.processor.js';
import { reconcile } from './bootstrap/reconcile.js';
import { prisma } from '@rs/db';
import { Queue } from 'bullmq';
import type { SendEmailJobData } from '@rs/shared';

async function main(): Promise<void> {
  logger.info('Worker starting...');

  const redis = getRedis();


  // Create a queue instance for reconcile
  const queue = new Queue<SendEmailJobData>(EMAIL_QUEUE, {
    connection: redis,
  });

  // Run startup reconciliation
  await reconcile(queue);

  const worker = new Worker<SendEmailJobData>(
    EMAIL_QUEUE,
    sendEmailProcessor,
    {
      connection: redis,
      concurrency: env.WORKER_CONCURRENCY,
      lockDuration: 60_000,    // 60s lock — prevents stalled job duplication
      stalledInterval: 30_000, // Check stalled every 30s
      maxStalledCount: 1,      // After 1 stall, move to failed (we handle via reconcile + claim)
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, emailId: job.data.emailId }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, emailId: job?.data.emailId, errorName: err.name }, 'Job failed');
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId }, 'Job stalled');
  });

  worker.on('error', (err) => {
    logger.error({ errorName: err.name }, 'Worker error');
  });

  logger.info(
    { concurrency: env.WORKER_CONCURRENCY, queue: EMAIL_QUEUE },
    'Worker started and listening for jobs',
  );

  // ─── Graceful Shutdown ───────────────────────────────────────────────────
  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Shutdown signal received');
    await worker.close();
    await queue.close();
    await prisma.$disconnect();
    await disconnectRedis();
    logger.info('Worker shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => { shutdown('SIGTERM').catch(() => process.exit(1)); });
  process.on('SIGINT', () => { shutdown('SIGINT').catch(() => process.exit(1)); });
}

main().catch((err: unknown) => {
  logger.error({ errorName: err instanceof Error ? err.name : 'UnknownError' }, 'Worker failed to start');
  process.exit(1);
});
