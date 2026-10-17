import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { EmailFilterSchema, ScheduleEmailSchema, SetEmailStarredSchema } from '@rs/shared';
import { schedule, listAll, listScheduled, listSent, downloadAttachment, setStarred } from './emails.controller.js';

export const emailsRouter = Router();

emailsRouter.use(authMiddleware);

emailsRouter.post('/schedule', rateLimit({ name: 'schedule-email-batch', limit: 10, windowMs: 60 * 1000 }), validate(ScheduleEmailSchema), schedule);
emailsRouter.get('/scheduled', validate(EmailFilterSchema, 'query'), listScheduled);
emailsRouter.get('/sent', validate(EmailFilterSchema, 'query'), listSent);
emailsRouter.get('/all', validate(EmailFilterSchema, 'query'), listAll);
emailsRouter.patch('/:emailId/star', validate(SetEmailStarredSchema), setStarred);
emailsRouter.get('/:emailId/attachments/:attachmentId', downloadAttachment);
