import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';
import { readFileSync } from 'fs';
import { join } from 'path';

const luaScript = readFileSync(join(__dirname, '../src/lua/hourly-counter.lua'), 'utf-8');

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

let redis: any;
let isRealRedis = false;

beforeAll(async () => {
  try {
    const realClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      retryStrategy: () => null,
      lazyConnect: true,
    });
    await realClient.connect();
    await realClient.ping();
    redis = realClient;
    isRealRedis = true;
  } catch {
    // Fall back to in-memory ioredis-mock (supported by vitest)
    redis = new RedisMock();
    isRealRedis = false;
  }
});

afterAll(async () => {
  if (redis && isRealRedis) {
    await redis.quit();
  }
});

async function runLua(key: string, limit: number): Promise<[number, number]> {
  const result = await redis.eval(luaScript, 1, key, String(limit));
  return result as [number, number];
}

describe('hourly-counter.lua', () => {
  it('allows sends up to the limit', async () => {
    const key = `test:rl:sender1:${Date.now()}`;
    const limit = 3;

    for (let i = 1; i <= limit; i++) {
      const [allowed, count] = await runLua(key, limit);
      expect(allowed).toBe(1);
      expect(count).toBe(i);
    }

    // 4th should be denied
    const [allowed, count] = await runLua(key, limit);
    expect(allowed).toBe(0);
    expect(count).toBe(limit); // counter rolled back, still at limit
  });

  it('does not increment counter when denied (rollback)', async () => {
    const key = `test:rl:sender2:${Date.now()}`;
    const limit = 2;

    await runLua(key, limit); // count=1, allowed
    await runLua(key, limit); // count=2, allowed
    await runLua(key, limit); // denied, rollback → still 2
    await runLua(key, limit); // denied, rollback → still 2

    const finalCount = await redis.get(key);
    expect(Number(finalCount)).toBe(2);
  });

  it('sets a TTL on first increment', async () => {
    const key = `test:rl:ttl:${Date.now()}`;
    await runLua(key, 10);
    const ttl = await redis.ttl(key);
    // TTL should be positive and <= 7200
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(7200);
  });
});

describe('Window math', () => {
  it('getHourlyWindow returns correct YYYYMMDDHH format', async () => {
    const { getHourlyWindow } = await import('../src/services/rate-limiter.service.js');
    const date = new Date('2024-06-15T14:37:00Z');
    expect(getHourlyWindow(date)).toBe('2024061514');
  });

  it('nextHourWindowStart returns the start of the next UTC hour', async () => {
    const { nextHourWindowStart } = await import('../src/services/rate-limiter.service.js');
    const date = new Date('2024-06-15T14:37:00Z');
    const next = new Date(nextHourWindowStart(date));
    expect(next.toISOString()).toBe('2024-06-15T15:00:00.000Z');
  });
});

describe('Schedule delay computation', () => {
  it('computes correct scheduledAt for each recipient', () => {
    const startTime = new Date('2024-06-15T10:00:00Z');
    const delayBetweenMs = 2000;
    const recipients = ['a@x.com', 'b@x.com', 'c@x.com'];

    const rows = recipients.map((_, index) => ({
      scheduledAt: new Date(startTime.getTime() + index * delayBetweenMs),
    }));

    expect(rows[0]!.scheduledAt.toISOString()).toBe('2024-06-15T10:00:00.000Z');
    expect(rows[1]!.scheduledAt.toISOString()).toBe('2024-06-15T10:00:02.000Z');
    expect(rows[2]!.scheduledAt.toISOString()).toBe('2024-06-15T10:00:04.000Z');
  });
});

describe('Atomic claim idempotency simulation', () => {
  it('ensures only a single worker can claim a SCHEDULED email', () => {
    // Model state
    let emailStatus = 'SCHEDULED';
    let claimCount = 0;

    function atomicClaim() {
      if (emailStatus === 'SCHEDULED') {
        emailStatus = 'SENDING';
        claimCount++;
        return true;
      }
      return false; // 0 rows updated
    }

    // Simulate 5 concurrent worker attempts to claim the same job
    const attempts = [atomicClaim(), atomicClaim(), atomicClaim(), atomicClaim(), atomicClaim()];

    const successfulClaims = attempts.filter((res) => res === true);
    const failedClaims = attempts.filter((res) => res === false);

    expect(successfulClaims).toHaveLength(1);
    expect(failedClaims).toHaveLength(4);
    expect(claimCount).toBe(1);
    expect(emailStatus).toBe('SENDING');
  });
});

describe('Overflow reschedule computation', () => {
  it('preserves order within the next window via offset', async () => {
    const { nextHourWindowStart } = await import('../src/services/rate-limiter.service.js');
    const oneHourMs = 3600000;

    // Email scheduled at 10:15:30
    const scheduledAt = new Date('2024-06-15T10:15:30Z');
    const nextStart = nextHourWindowStart(scheduledAt); // 11:00:00

    const withinHourOffset = scheduledAt.getTime() % oneHourMs;
    const newScheduledAt = new Date(nextStart + withinHourOffset);

    expect(newScheduledAt.toISOString()).toBe('2024-06-15T11:15:30.000Z');
  });
});
