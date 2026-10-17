import type { Request, Response, NextFunction } from 'express';
import { prisma } from '@rs/db';
import { env } from '../config/env.js';

export function isAdminEmail(email: string): boolean {
  const allowedEmails = new Set(env.ADMIN_EMAILS.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
  return allowedEmails.has(email.trim().toLowerCase());
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!env.ADMIN_EMAILS.trim()) {
      res.status(403).json({ error: { code: 'ADMIN_NOT_CONFIGURED', message: 'Admin access is not configured' } });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { email: true } });
    if (!user || !isAdminEmail(user.email)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
