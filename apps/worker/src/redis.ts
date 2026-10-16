import Redis from 'ioredis';
import { env } from './config/env.js';
import { logger } from './logger.js';

let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    redisInstance.on('connect', () => logger.info('Worker connected to Redis'));
    redisInstance.on('error', (err: Error) => logger.error({ err }, 'Worker Redis error'));
  }
  return redisInstance;
}

export async function disconnectRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
}
