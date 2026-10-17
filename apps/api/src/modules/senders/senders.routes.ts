import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { SenderCreateSchema, SenderUpdateSchema } from '@rs/shared';
import { list, create, update, remove, createEthereal } from './senders.controller.js';

export const sendersRouter = Router();

sendersRouter.use(authMiddleware);

sendersRouter.get('/', list);
sendersRouter.post('/', rateLimit({ name: 'create-sender', limit: 10, windowMs: 60 * 60 * 1000 }), validate(SenderCreateSchema), create);
sendersRouter.put('/:id', validate(SenderUpdateSchema), update);
sendersRouter.delete('/:id', remove);
sendersRouter.post('/ethereal', rateLimit({ name: 'create-ethereal-sender', limit: 10, windowMs: 60 * 60 * 1000 }), createEthereal);
