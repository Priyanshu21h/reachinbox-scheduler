import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../core/db/index.js';
import { env } from '../../config/env.js';
import { isAdminEmail } from '../../middleware/admin.js';
import { logger } from '../../core/logger/index.js';
import { googleOAuthClient, getGoogleAuthUrl } from './auth.service.js';
import { getAuthEmailConfig, sendAuthEmail } from './auth-email.service.js';
import { createOneTimeToken, hashOneTimeToken, hashPassword, verifyPassword } from './password.service.js';
import type { RequestEmailSchema, LoginEmailSchema, CompleteRegistrationSchema, CompletePasswordResetSchema } from './auth.schemas.js';
import type { z } from 'zod';
import { AppError } from '../../core/errors/index.js';
import type { AuthPayload } from '../../middleware/auth.js';

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
}

type RequestEmailBody = z.infer<typeof RequestEmailSchema>;
type LoginEmailBody = z.infer<typeof LoginEmailSchema>;
type CompleteRegistrationBody = z.infer<typeof CompleteRegistrationSchema>;
type CompletePasswordResetBody = z.infer<typeof CompletePasswordResetSchema>;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function createAuthToken(email: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD'): Promise<string> {
  const { token, tokenHash } = createOneTimeToken();
  const now = new Date();
  await prisma.$transaction([
    prisma.authToken.updateMany({
      where: { email, purpose, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.authToken.create({
      data: {
        email,
        tokenHash,
        purpose,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      },
    }),
  ]);
  return token;
}

export async function requestEmailRegistration(req: Request<unknown, unknown, RequestEmailBody>, res: Response, next: NextFunction): Promise<void> {
  try {
    getAuthEmailConfig();
    const email = normalizeEmail(req.body.email);
    const user = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true } });
    if (!user?.passwordHash) {
      const token = await createAuthToken(email, 'VERIFY_EMAIL');
      try {
        await sendAuthEmail(email, token, 'verify');
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== 'AUTH_EMAIL_DELIVERY_FAILED') throw error;
      }
    }
    res.json({ data: { message: 'If this address can be registered, a verification link will arrive shortly.' } });
  } catch (error) {
    next(error);
  }
}

export async function completeEmailRegistration(req: Request<unknown, unknown, CompleteRegistrationBody>, res: Response, next: NextFunction): Promise<void> {
  try {
    const tokenHash = hashOneTimeToken(req.body.token);
    const passwordHash = await hashPassword(req.body.password);
    const now = new Date();
    const user = await prisma.$transaction(async (tx) => {
      const record = await tx.authToken.findUnique({ where: { tokenHash } });
      if (!record || record.purpose !== 'VERIFY_EMAIL' || record.usedAt || record.expiresAt <= now) {
        throw new AppError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This verification link is invalid or expired. Request a new one.');
      }
      const consumed = await tx.authToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new AppError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This verification link is invalid or expired. Request a new one.');

      const existing = await tx.user.findUnique({ where: { email: record.email } });
      if (existing?.passwordHash) {
        throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'This email already has a password. Sign in or reset it instead.');
      }
      if (existing) {
        return tx.user.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            emailVerifiedAt: existing.emailVerifiedAt ?? now,
            ...(existing.googleId ? {} : { name: req.body.name }),
          },
        });
      }
      return tx.user.create({
        data: {
          googleId: null,
          email: record.email,
          name: req.body.name,
          passwordHash,
          emailVerifiedAt: now,
        },
      });
    });

    setAuthCookie(res, signToken({ userId: user.id, email: user.email }));
    res.status(201).json({
      data: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
    });
  } catch (error) {
    next(error);
  }
}

export async function loginWithEmail(req: Request<unknown, unknown, LoginEmailBody>, res: Response, next: NextFunction): Promise<void> {
  try {
    const email = normalizeEmail(req.body.email);
    const user = await prisma.user.findUnique({ where: { email } });
    const passwordMatches = await verifyPassword(req.body.password, user?.passwordHash);
    if (!user || !user.passwordHash || !passwordMatches) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    if (!user.emailVerifiedAt) {
      throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before signing in');
    }

    setAuthCookie(res, signToken({ userId: user.id, email: user.email }));
    res.json({ data: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl } });
  } catch (error) {
    next(error);
  }
}

export async function requestPasswordReset(req: Request<unknown, unknown, RequestEmailBody>, res: Response, next: NextFunction): Promise<void> {
  try {
    getAuthEmailConfig();
    const email = normalizeEmail(req.body.email);
    const user = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true } });
    if (user?.passwordHash) {
      const token = await createAuthToken(email, 'RESET_PASSWORD');
      try {
        await sendAuthEmail(email, token, 'reset');
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== 'AUTH_EMAIL_DELIVERY_FAILED') throw error;
      }
    }
    res.json({ data: { message: 'If an account with that address supports password sign-in, reset instructions will arrive shortly.' } });
  } catch (error) {
    next(error);
  }
}

export async function completePasswordReset(req: Request<unknown, unknown, CompletePasswordResetBody>, res: Response, next: NextFunction): Promise<void> {
  try {
    const tokenHash = hashOneTimeToken(req.body.token);
    const passwordHash = await hashPassword(req.body.password);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const record = await tx.authToken.findUnique({ where: { tokenHash } });
      if (!record || record.purpose !== 'RESET_PASSWORD' || record.usedAt || record.expiresAt <= now) {
        throw new AppError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This reset link is invalid or expired. Request a new one.');
      }
      const consumed = await tx.authToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new AppError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This reset link is invalid or expired. Request a new one.');
      const user = await tx.user.findUnique({ where: { email: record.email } });
      if (!user?.passwordHash) throw new AppError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This reset link is invalid or expired. Request a new one.');
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.authToken.updateMany({
        where: { email: record.email, purpose: 'RESET_PASSWORD', usedAt: null },
        data: { usedAt: now },
      });
    });
    res.json({ data: { message: 'Password updated. Sign in with your new password.' } });
  } catch (error) {
    next(error);
  }
}

function setAuthCookie(res: Response, token: string): void {
  res.cookie('token', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    signed: false,
  });
}

const OAUTH_STATE_COOKIE = 'google_oauth_state';

function clearOAuthStateCookie(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth/google/callback',
  });
}

export function googleRedirect(_req: Request, res: Response): void {
  const state = randomBytes(32).toString('base64url');
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/auth/google/callback',
  });
  const url = getGoogleAuthUrl(state);
  res.redirect(url);
}

export async function googleCallback(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { code, state } = req.query as { code: string; state: string };
    if (!code) {
      clearOAuthStateCookie(res);
      res.redirect(`${env.FRONTEND_URL}/login?error=no_code`);
      return;
    }
    const expectedState = req.cookies?.[OAUTH_STATE_COOKIE];
    if (typeof state !== 'string' || typeof expectedState !== 'string') {
      clearOAuthStateCookie(res);
      res.redirect(`${env.FRONTEND_URL}/login?error=invalid_state`);
      return;
    }
    const stateBytes = Buffer.from(state);
    const expectedBytes = Buffer.from(expectedState);
    if (stateBytes.length !== expectedBytes.length || !timingSafeEqual(stateBytes, expectedBytes)) {
      clearOAuthStateCookie(res);
      res.redirect(`${env.FRONTEND_URL}/login?error=invalid_state`);
      return;
    }
    clearOAuthStateCookie(res);

    const { tokens } = await googleOAuthClient.getToken(code);
    googleOAuthClient.setCredentials(tokens);

    if (!tokens.id_token) {
      res.redirect(`${env.FRONTEND_URL}/login?error=no_id_token`);
      return;
    }

    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || payload.email_verified !== true || !payload.email) {
      res.redirect(`${env.FRONTEND_URL}/login?error=invalid_token`);
      return;
    }

    const email = normalizeEmail(payload.email);
    const user = await prisma.$transaction(async (tx) => {
      const byGoogleId = await tx.user.findUnique({ where: { googleId: payload.sub } });
      if (byGoogleId) {
        return tx.user.update({
          where: { id: byGoogleId.id },
          data: {
            email,
            emailVerifiedAt: byGoogleId.emailVerifiedAt ?? new Date(),
            name: payload.name ?? byGoogleId.name,
            avatarUrl: payload.picture ?? byGoogleId.avatarUrl,
          },
        });
      }

      const byEmail = await tx.user.findUnique({ where: { email } });
      if (byEmail?.googleId && byEmail.googleId !== payload.sub) {
        throw new AppError(409, 'GOOGLE_ACCOUNT_CONFLICT', 'This email is already linked to another Google account');
      }
      if (byEmail) {
        return tx.user.update({
          where: { id: byEmail.id },
          data: {
            googleId: payload.sub,
            emailVerifiedAt: new Date(),
            name: payload.name ?? byEmail.name,
            avatarUrl: payload.picture ?? byEmail.avatarUrl,
          },
        });
      }
      return tx.user.create({
        data: {
          googleId: payload.sub,
          email,
          name: payload.name ?? email,
          avatarUrl: payload.picture ?? null,
          emailVerifiedAt: new Date(),
        },
      });
    });

    const token = signToken({ userId: user.id, email: user.email });
    setAuthCookie(res, token);

    logger.info({ userId: user.id }, 'User logged in via Google');
    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    next(err);
  }
}

export function getMe(req: Request, res: Response): void {
  const { userId } = req.user!;
  // Fetch fresh data
  prisma.user
    .findUniqueOrThrow({ where: { id: userId } })
    .then((user) => {
      res.json({
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          isAdmin: isAdminEmail(user.email),
        },
      });
    })
    .catch(() => {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    });
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie('token', { path: '/' });
  res.json({ data: { message: 'Logged out' } });
}
