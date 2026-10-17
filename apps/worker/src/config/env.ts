import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';

// Walk up directories from cwd to locate root .env, with fallback to monorepo root relative to __dirname
function loadMonorepoEnv(): void {
  let cur = process.cwd();
  let found = false;
  while (cur) {
    const candidate = path.join(cur, '.env');
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, override: true });
      found = true;
      break;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  if (!found) {
    const fallback = path.resolve(__dirname, '../../../../.env');
    if (fs.existsSync(fallback)) {
      dotenv.config({ path: fallback, override: true });
    }
  }
}

loadMonorepoEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url().default('postgresql://rs:rs@localhost:5433/reachinbox'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  CREDENTIALS_ENCRYPTION_KEY: z.string().refine((value) => Buffer.from(value, 'base64').length === 32, 'must be base64 encoding of 32 random bytes'),
  SMTP_ALLOWED_HOSTS: z.string().default('smtp.ethereal.email'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MIN_DELAY_BETWEEN_EMAILS_MS: z.coerce.number().int().min(0).default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive().default(200),
  MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
});

function loadEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid worker environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
export type Env = typeof env;
