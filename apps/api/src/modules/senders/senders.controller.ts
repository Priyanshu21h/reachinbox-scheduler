import type { Request, Response, NextFunction } from 'express';
import * as sendersService from './senders.service.js';
import type { SenderCreateDto, SenderUpdateDto } from '@rs/shared';

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const senders = await sendersService.listSenders(req.user!.userId);
    res.json({ data: senders });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sender = await sendersService.createSender(
      req.user!.userId,
      req.body as SenderCreateDto,
    );
    res.status(201).json({ data: sender });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sender = await sendersService.updateSender(
      req.params['id']!,
      req.user!.userId,
      req.body as SenderUpdateDto,
    );
    res.json({ data: sender });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await sendersService.deleteSender(req.params['id']!, req.user!.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function createEthereal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sender = await sendersService.createEtherealSender(req.user!.userId);
    res.status(201).json({ data: sender });
  } catch (err) {
    next(err);
  }
}
