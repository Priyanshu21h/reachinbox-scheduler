import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, {
      N: COST,
      r: BLOCK_SIZE,
      p: PARALLELIZATION,
      maxmem: MAX_MEMORY,
    }, (error, key) => error ? reject(error) : resolve(key as Buffer));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt-v1$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

const DUMMY_HASH = hashPassword('not-a-real-password-used-for-timing-only');

export async function verifyPassword(password: string, encoded?: string | null): Promise<boolean> {
  const hash = encoded ?? await DUMMY_HASH;
  const parts = hash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt-v1') return false;

  try {
    const salt = Buffer.from(parts[1]!, 'base64url');
    const expected = Buffer.from(parts[2]!, 'base64url');
    if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
    const actual = await derive(password, salt);
    const matches = timingSafeEqual(actual, expected);
    return Boolean(encoded) && matches;
  } catch {
    return false;
  }
}

export function createOneTimeToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: createHash('sha256').update(token).digest('hex') };
}

export function hashOneTimeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
