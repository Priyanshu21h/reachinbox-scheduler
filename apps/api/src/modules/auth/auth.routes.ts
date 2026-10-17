import { Router } from 'express';
import {
  googleRedirect, googleCallback, getMe, logout,
  requestEmailRegistration, completeEmailRegistration, loginWithEmail,
  requestPasswordReset, completePasswordReset,
} from './auth.controller.js';
import { authMiddleware } from '../../middleware/auth.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { RequestEmailSchema, LoginEmailSchema, CompleteRegistrationSchema, CompletePasswordResetSchema } from './auth.schemas.js';

export const authRouter = Router();

authRouter.get('/google', rateLimit({ name: 'google-oauth', limit: 10, windowMs: 10 * 60 * 1000 }), googleRedirect);
authRouter.get('/google/callback', googleCallback);
authRouter.post('/email/register', rateLimit({ name: 'email-register', limit: 5, windowMs: 15 * 60 * 1000 }), validate(RequestEmailSchema), requestEmailRegistration);
authRouter.post('/email/register/complete', rateLimit({ name: 'email-register-complete', limit: 10, windowMs: 15 * 60 * 1000 }), validate(CompleteRegistrationSchema), completeEmailRegistration);
authRouter.post('/email/login', rateLimit({ name: 'email-login', limit: 10, windowMs: 15 * 60 * 1000 }), validate(LoginEmailSchema), loginWithEmail);
authRouter.post('/email/password-reset', rateLimit({ name: 'password-reset', limit: 5, windowMs: 15 * 60 * 1000 }), validate(RequestEmailSchema), requestPasswordReset);
authRouter.post('/email/password-reset/complete', rateLimit({ name: 'password-reset-complete', limit: 10, windowMs: 15 * 60 * 1000 }), validate(CompletePasswordResetSchema), completePasswordReset);
authRouter.get('/me', authMiddleware, getMe);
authRouter.post('/logout', authMiddleware, logout);
