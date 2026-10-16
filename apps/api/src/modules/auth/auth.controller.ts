import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../../core/db/index.js';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger/index.js';
import { googleOAuthClient, getGoogleAuthUrl } from './auth.service.js';
import type { AuthPayload } from '../../middleware/auth.js';

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
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

export function googleRedirect(_req: Request, res: Response): void {
  const url = getGoogleAuthUrl();
  res.redirect(url);
}

export async function googleCallback(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { code } = req.query as { code: string };
    if (!code) {
      res.redirect(`${env.FRONTEND_URL}/login?error=no_code`);
      return;
    }

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
    if (!payload?.sub) {
      res.redirect(`${env.FRONTEND_URL}/login?error=invalid_token`);
      return;
    }

    const user = await prisma.user.upsert({
      where: { googleId: payload.sub },
      update: {
        email: payload.email ?? '',
        name: payload.name ?? '',
        avatarUrl: payload.picture ?? null,
      },
      create: {
        googleId: payload.sub,
        email: payload.email ?? '',
        name: payload.name ?? '',
        avatarUrl: payload.picture ?? null,
      },
    });

    const token = signToken({ userId: user.id, email: user.email });
    setAuthCookie(res, token);

    logger.info({ userId: user.id, email: user.email }, 'User logged in via Google');
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
        },
      });
    })
    .catch(() => {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    });
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie('token');
  res.json({ data: { message: 'Logged out' } });
}
