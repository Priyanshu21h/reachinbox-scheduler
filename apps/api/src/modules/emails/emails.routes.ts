import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ScheduleEmailSchema, PaginationSchema } from '@rs/shared';
import { schedule, listScheduled, listSent } from './emails.controller.js';

export const emailsRouter = Router();

emailsRouter.use(authMiddleware);

emailsRouter.post('/schedule', validate(ScheduleEmailSchema), schedule);
emailsRouter.get('/scheduled', validate(PaginationSchema, 'query'), listScheduled);
emailsRouter.get('/sent', validate(PaginationSchema, 'query'), listSent);
