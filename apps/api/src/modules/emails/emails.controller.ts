import type { Request, Response, NextFunction } from 'express';
import * as emailsService from './emails.service.js';
import type { ScheduleEmailDto, PaginationDto } from '@rs/shared';

export async function schedule(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const emails = await emailsService.scheduleEmails(
      req.user!.userId,
      req.body as ScheduleEmailDto,
    );
    res.status(201).json({
      data: emails,
      meta: { count: emails.length },
    });
  } catch (err) {
    next(err);
  }
}

export async function listScheduled(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { page, limit } = req.query as unknown as PaginationDto;
    const { emails, total } = await emailsService.listScheduledEmails(
      req.user!.userId,
      page,
      limit,
    );
    res.json({
      data: emails,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function listSent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { page, limit } = req.query as unknown as PaginationDto;
    const { emails, total } = await emailsService.listSentEmails(
      req.user!.userId,
      page,
      limit,
    );
    res.json({
      data: emails,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
}
