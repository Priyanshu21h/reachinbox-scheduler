import { readFileSync } from 'fs';
import { join } from 'path';
import { getRedis } from '../redis.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

const luaScript = readFileSync(join(__dirname, '../lua/hourly-counter.lua'), 'utf-8');

/**
 * Returns the YYYYMMDDHH window string for a given date (UTC).
 */
export function getHourlyWindow(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  return `${y}${m}${d}${h}`;
}

/**
 * Returns the start of the next UTC hour in ms.
 */
export function nextHourWindowStart(now: Date = new Date()): number {
  const ms = now.getTime();
  const msInHour = 60 * 60 * 1000;
  return Math.ceil((ms + 1) / msInHour) * msInHour;
}

/**
 * Atomically increments the hourly counter for a sender.
 * Returns { allowed, count }.
 * If denied, the Lua script decrements back (no side effect).
 */
export async function checkHourlyLimit(
  senderId: string,
  hourlyLimit: number,
  window: string,
): Promise<{ allowed: boolean; count: number }> {
  const redis = getRedis();
  const key = `rl:${senderId}:${window}`;

  const result = await redis.eval(
    luaScript,
    1,
    key,
    String(hourlyLimit),
  ) as [number, number];

  const [allowedInt, count] = result;
  const allowed = allowedInt === 1;

  logger.debug({ senderId, window, key, allowed, count, limit: hourlyLimit }, 'Rate limit check');
  return { allowed, count };
}

/**
 * Resolves the effective hourly limit for a sender.
 * Uses sender override if set, otherwise falls back to env default.
 */
export function effectiveHourlyLimit(
  senderHourlyLimit: number | null,
  emailHourlyLimit: number | null = null,
): number {
  return emailHourlyLimit ?? senderHourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER;
}
