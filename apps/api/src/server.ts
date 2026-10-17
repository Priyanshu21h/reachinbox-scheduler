import 'dotenv/config';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDb, disconnectDb } from './core/db/index.js';
import { getRedis, disconnectRedis } from './core/redis/index.js';
import { closeQueue } from './core/queue/index.js';
import { ensureEmailsIndex } from './core/search/index.js';
import { logger } from './core/logger/index.js';

async function main(): Promise<void> {
  // Connect to DB
  await connectDb();

  // Touch Redis to verify connection
  await getRedis().ping();

  // Ensure Elasticsearch index
  try {
    await ensureEmailsIndex();
  } catch (err) {
    logger.warn({ err }, 'Elasticsearch not ready; will retry on first request');
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`API server running on http://localhost:${env.PORT}`);
  });

  // ─── Graceful Shutdown ───────────────────────────────────────────────────
  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Shutdown signal received');
    server.close(async () => {
      await closeQueue();
      await disconnectDb();
      await disconnectRedis();
      logger.info('Graceful shutdown complete');
      process.exit(0);
    });
    // Force exit after 15s
    setTimeout(() => process.exit(1), 15_000);
  }

  process.on('SIGTERM', () => { shutdown('SIGTERM').catch(() => process.exit(1)); });
  process.on('SIGINT', () => { shutdown('SIGINT').catch(() => process.exit(1)); });
}

main().catch((err: unknown) => {
  logger.error({ errorName: err instanceof Error ? err.name : 'UnknownError' }, 'Failed to start server');
  process.exit(1);
});
