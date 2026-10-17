import type { Request, Response, NextFunction } from 'express';
import { getRedis } from '../core/redis/index.js';
import { logger } from '../core/logger/index.js';

const INCREMENT_WITH_EXPIRY = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return count
`;

export function rateLimit(options: { name: string; limit: number; windowMs: number }) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identity = req.user?.userId ?? req.ip ?? 'unknown';
    try {
      const key = `rate-limit:${options.name}:${identity}`;
      const count = Number(await getRedis().eval(INCREMENT_WITH_EXPIRY, 1, key, options.windowMs));
      if (count > options.limit) {
        res.setHeader('Retry-After', Math.ceil(options.windowMs / 1000));
        res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } });
        return;
      }
      next();
    } catch (error) {
      // Fail closed for endpoints that create sessions, send email, or add credentials.
      logger.error({ errorName: error instanceof Error ? error.name : 'UnknownError', route: options.name }, 'Rate limiter unavailable');
      res.status(503).json({ error: { code: 'RATE_LIMIT_UNAVAILABLE', message: 'Temporarily unable to process this request' } });
    }
  };
}
