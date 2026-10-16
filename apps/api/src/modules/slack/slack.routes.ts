import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { oauthStart, oauthCallback, status, disconnect } from './slack.controller.js';

export const slackRouter = Router();

slackRouter.get('/oauth/start', authMiddleware, oauthStart);
slackRouter.get('/oauth/callback', oauthCallback); // callback doesn't have cookie yet
slackRouter.get('/status', authMiddleware, status);
slackRouter.delete('/disconnect', authMiddleware, disconnect);
