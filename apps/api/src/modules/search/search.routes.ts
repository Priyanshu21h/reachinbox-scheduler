import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { search } from './search.controller.js';

export const searchRouter = Router();
searchRouter.use(authMiddleware);
searchRouter.get('/emails', search);
