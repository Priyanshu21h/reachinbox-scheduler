import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { SenderCreateSchema, SenderUpdateSchema } from '@rs/shared';
import { list, create, update, remove, createEthereal } from './senders.controller.js';

export const sendersRouter = Router();

sendersRouter.use(authMiddleware);

sendersRouter.get('/', list);
sendersRouter.post('/', validate(SenderCreateSchema), create);
sendersRouter.put('/:id', validate(SenderUpdateSchema), update);
sendersRouter.delete('/:id', remove);
sendersRouter.post('/ethereal', createEthereal);
