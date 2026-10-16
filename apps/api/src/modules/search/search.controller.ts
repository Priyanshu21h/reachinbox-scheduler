import type { Request, Response, NextFunction } from 'express';
import { searchEmails } from '../../core/search/index.js';
import { SearchEmailsSchema } from '@rs/shared';

export async function search(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = SearchEmailsSchema.parse(req.query);
    const { hits, total } = await searchEmails({
      userId: req.user!.userId,
      q: parsed.q,
      status: parsed.status,
      page: parsed.page,
      limit: parsed.limit,
    });
    res.json({
      data: hits,
      meta: {
        page: parsed.page,
        limit: parsed.limit,
        total,
        totalPages: Math.ceil(total / parsed.limit),
      },
    });
  } catch (err) {
    next(err);
  }
}
