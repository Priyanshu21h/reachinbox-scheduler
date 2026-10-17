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
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // Security
  JWT_SECRET: z.string().min(32),
  CREDENTIALS_ENCRYPTION_KEY: z.string().refine((value) => Buffer.from(value, 'base64').length === 32, 'must be base64 encoding of 32 random bytes'),
  ADMIN_EMAILS: z.string().default(''),
  SMTP_ALLOWED_HOSTS: z.string().default('smtp.ethereal.email'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

  // Database
  DATABASE_URL: z.string().url().default('postgresql://rs:rs@localhost:5433/reachinbox'),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // Elasticsearch
  ES_NODE: z.string().url().default('http://localhost:9200'),

  // Worker settings
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MIN_DELAY_BETWEEN_EMAILS_MS: z.coerce.number().int().min(0).default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive().default(200),
  MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),

  // Transactional email for local account verification and password resets.
  AUTH_EMAIL_SMTP_HOST: z.preprocess((value) => value === '' ? undefined : value, z.string().optional()),
  AUTH_EMAIL_SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  AUTH_EMAIL_SMTP_USER: z.preprocess((value) => value === '' ? undefined : value, z.string().optional()),
  AUTH_EMAIL_SMTP_PASS: z.preprocess((value) => value === '' ? undefined : value, z.string().optional()),
  AUTH_EMAIL_FROM: z.preprocess((value) => value === '' ? undefined : value, z.string().email().optional()),

  // Slack OAuth
  SLACK_CLIENT_ID: z.string().min(1),
  SLACK_CLIENT_SECRET: z.string().min(1),
  SLACK_REDIRECT_URI: z.string().url(),
  SLACK_STATE_SECRET: z.string().min(32),
}).superRefine((value, ctx) => {
  if (!value.AUTH_EMAIL_SMTP_HOST) return;
  for (const key of ['AUTH_EMAIL_SMTP_USER', 'AUTH_EMAIL_SMTP_PASS', 'AUTH_EMAIL_FROM'] as const) {
    if (!value[key]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'required when AUTH_EMAIL_SMTP_HOST is set' });
    }
  }
});

function loadEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
export type Env = typeof env;
