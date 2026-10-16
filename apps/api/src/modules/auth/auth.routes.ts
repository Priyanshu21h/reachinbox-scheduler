import { Router } from 'express';
import { googleRedirect, googleCallback, getMe, logout } from './auth.controller.js';
import { authMiddleware } from '../../middleware/auth.js';

export const authRouter = Router();

authRouter.get('/google', googleRedirect);
authRouter.get('/google/callback', googleCallback);
authRouter.get('/me', authMiddleware, getMe);
authRouter.post('/logout', authMiddleware, logout);
