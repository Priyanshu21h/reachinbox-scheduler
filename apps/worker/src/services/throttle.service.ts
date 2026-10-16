import { getRedis } from '../redis.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

/**
 * Attempts to acquire the per-sender throttle lock.
 * Uses Redis SET NX PX to ensure minimum delay between sends.
 *
 * Returns: { acquired: boolean, remainingMs: number }
 * - acquired=true → proceed with send
 * - acquired=false → wait remainingMs before retrying (move job to delayed queue)
 */
export async function acquireThrottleLock(senderId: string): Promise<{
  acquired: boolean;
  remainingMs: number;
}> {
  const redis = getRedis();
  const key = `throttle:${senderId}`;
  const delayMs = env.MIN_DELAY_BETWEEN_EMAILS_MS;

  const result = await redis.set(key, '1', 'PX', delayMs, 'NX');

  if (result === 'OK') {
    logger.debug({ senderId, delayMs }, 'Throttle lock acquired');
    return { acquired: true, remainingMs: 0 };
  }

  // Lock is held — check remaining TTL
  const pttl = await redis.pttl(key);
  const remainingMs = pttl > 0 ? pttl : delayMs;

  logger.debug({ senderId, remainingMs }, 'Throttle lock held, will reschedule');
  return { acquired: false, remainingMs };
}
