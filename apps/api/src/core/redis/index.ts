import Redis from 'ioredis';
import { env } from '../../config/env.js';
import { logger } from '../logger/index.js';

let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    });

    redisInstance.on('connect', () => logger.info('Connected to Redis'));
    redisInstance.on('error', (err: Error) => logger.error({ err }, 'Redis error'));
    redisInstance.on('reconnecting', () => logger.warn('Redis reconnecting...'));
  }
  return redisInstance;
}

export async function disconnectRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
    logger.info('Redis disconnected');
  }
}
