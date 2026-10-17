import type { Request, Response, NextFunction } from 'express';
import * as emailsService from './emails.service.js';
import type { ScheduleEmailDto, EmailFilterDto, SetEmailStarredDto } from '@rs/shared';

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
    const { page, limit, ...filters } = req.query as unknown as EmailFilterDto;
    const { emails, total } = await emailsService.listScheduledEmails(
      req.user!.userId,
      page,
      limit,
      filters,
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
    const { page, limit, ...filters } = req.query as unknown as EmailFilterDto;
    const { emails, total } = await emailsService.listSentEmails(
      req.user!.userId,
      page,
      limit,
      filters,
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

export async function listAll(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { page, limit, ...filters } = req.query as unknown as EmailFilterDto;
    const { emails, total } = await emailsService.listAllEmails(req.user!.userId, page, limit, filters);
    res.json({ data: emails, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
}

export async function downloadAttachment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const file = await emailsService.getEmailAttachment(req.user!.userId, req.params['emailId']!, req.params['attachmentId']!);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.type(file.contentType).attachment(file.fileName).send(file.content);
  } catch (err) {
    next(err);
  }
}

export async function setStarred(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await emailsService.setEmailStarred(
      req.user!.userId,
      req.params['emailId']!,
      (req.body as SetEmailStarredDto).starred,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}
