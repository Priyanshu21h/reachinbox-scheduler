import { DelayedError } from 'bullmq';
import type { Job } from 'bullmq';
import { prisma } from '@rs/db';
import type { SendEmailJobData } from '@rs/shared';
import { logger } from '../logger.js';
import { sendEmail } from '../services/mailer.service.js';
import { acquireThrottleLock } from '../services/throttle.service.js';
import {
  checkHourlyLimit,
  effectiveHourlyLimit,
  getHourlyWindow,
  nextHourWindowStart,
} from '../services/rate-limiter.service.js';
import { notifyRateLimitHit } from '../services/slack-notifier.service.js';
import { updateEmailInEs } from '../es-updater.js';

/**
 * Main email processor. Runs inside BullMQ Worker.
 *
 * Flow:
 * 1. Atomic claim: UPDATE WHERE status='SCHEDULED' → if 0 rows, already handled (idempotent exit)
 * 2. Per-sender throttle (Redis NX PX) → if held, re-delay and throw DelayedError
 * 3. Hourly Lua limit → if denied, roll back claim to SCHEDULED, re-delay into next window, throw DelayedError
 * 4. Send via nodemailer
 * 5. Mark SENT (or FAILED on permanent error) + update ES
 */
export async function sendEmailProcessor(
  job: Job<SendEmailJobData>,
  token?: string,
): Promise<void> {
  const { emailId } = job.data;
  const jobLog = logger.child({ jobId: job.id, emailId });

  // ─── Step 1: Atomic Claim ─────────────────────────────────────────────────
  // Raw query needed for UPDATE … RETURNING with conditional WHERE
  const claimed = await prisma.$queryRaw<{ id: string; senderId: string; toEmail: string; subject: string; body: string; scheduledAt: Date; userId: string }[]>`
    UPDATE "Email"
    SET status = 'SENDING', attempts = attempts + 1
    WHERE id = ${emailId} AND status IN ('SCHEDULED')
    RETURNING id, "senderId", "toEmail", subject, body, "scheduledAt", "userId"
  `;

  if (claimed.length === 0) {
    jobLog.info('Email already handled (idempotent exit)');
    return; // Exit successfully — not a failure
  }

  const email = claimed[0]!;
  jobLog.info({ toEmail: email.toEmail }, 'Claimed email for sending');

  // Fetch sender
  const sender = await prisma.sender.findUnique({ where: { id: email.senderId } });
  if (!sender) {
    jobLog.error('Sender not found; marking as FAILED');
    await markFailed(emailId, 'Sender not found');
    return;
  }

  // ─── Step 2: Per-Sender Throttle ─────────────────────────────────────────
  const throttle = await acquireThrottleLock(sender.id);
  if (!throttle.acquired) {
    // Release claim back to SCHEDULED
    await releaseToScheduled(emailId);
    jobLog.debug({ remainingMs: throttle.remainingMs }, 'Throttled — moving to delayed');
    await job.moveToDelayed(Date.now() + throttle.remainingMs, token);
    throw new DelayedError('Throttled: minimum send interval not elapsed');
  }

  // ─── Step 3: Hourly Rate Limit ───────────────────────────────────────────
  const window = getHourlyWindow();
  const limit = effectiveHourlyLimit(sender.hourlyLimit);
  const { allowed } = await checkHourlyLimit(sender.id, limit, window);

  if (!allowed) {
    // Release claim back to SCHEDULED
    await releaseToScheduled(emailId);

    // Compute next window start + order-preserving offset
    const nextWindowMs = nextHourWindowStart();
    // Use scheduledAt as an offset within the window (mod 60 minutes) to preserve ordering
    const withinHourOffsetMs = email.scheduledAt.getTime() % (60 * 60 * 1000);
    const rescheduleMs = nextWindowMs + withinHourOffsetMs;
    const delayMs = Math.max(0, rescheduleMs - Date.now());

    jobLog.info({ window, limit, nextWindowMs, delayMs }, 'Rate limited — moving to next window');

    // Trigger Slack notification (fire-and-forget, errors logged not thrown)
    notifyRateLimitHit({
      userId: email.userId,
      senderId: sender.id,
      senderEmail: sender.fromEmail,
      limit,
      window,
      nextWindowMs,
    }).catch((err: unknown) => jobLog.error({ err }, 'Slack notify error'));

    await job.moveToDelayed(Date.now() + delayMs, token);
    throw new DelayedError('Rate limited: moved to next hour window');
  }

  // ─── Step 4: Send Email ───────────────────────────────────────────────────
  try {
    const result = await sendEmail(sender, email.toEmail, email.subject, email.body);

    // ─── Step 5a: Mark SENT ───────────────────────────────────────────────
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        messageId: result.messageId,
        error: null,
      },
    });

    jobLog.info({ messageId: result.messageId, previewUrl: result.previewUrl }, 'Email sent ✓');

    // Update Elasticsearch (non-critical)
    updateEmailInEs(emailId, {
      status: 'SENT',
      sentAt: new Date().toISOString(),
      messageId: result.messageId,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    jobLog.error({ err }, 'Failed to send email');

    // If we have retries left, BullMQ will redeliver. Keep status SCHEDULED so the
    // atomic claim can fire again on the retry attempt.
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;

    if (isLastAttempt) {
      // ─── Step 5b: Mark FAILED (permanent) ────────────────────────────
      await prisma.email.update({
        where: { id: emailId },
        data: { status: 'FAILED', error: errorMessage, sentAt: new Date() },
      });
      updateEmailInEs(emailId, { status: 'FAILED', error: errorMessage });
      jobLog.error('All retries exhausted — marked FAILED');
    } else {
      // Not the last attempt — release back to SCHEDULED so next attempt can claim it
      await releaseToScheduled(emailId);
      jobLog.warn('Transient error — releasing claim for retry');
    }

    throw err; // Let BullMQ handle retry/backoff
  }
}

async function releaseToScheduled(emailId: string): Promise<void> {
  await prisma.email.update({
    where: { id: emailId },
    data: { status: 'SCHEDULED' },
  });
}

async function markFailed(emailId: string, error: string): Promise<void> {
  await prisma.email.update({
    where: { id: emailId },
    data: { status: 'FAILED', error, sentAt: new Date() },
  });
  updateEmailInEs(emailId, { status: 'FAILED', error });
}
