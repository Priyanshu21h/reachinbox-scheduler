import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes.js';
import { sendersRouter } from './modules/senders/senders.routes.js';
import { emailsRouter } from './modules/emails/emails.routes.js';
import { searchRouter } from './modules/search/search.routes.js';
import { slackRouter } from './modules/slack/slack.routes.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/senders', sendersRouter);
apiRouter.use('/emails', emailsRouter);
apiRouter.use('/search', searchRouter);
apiRouter.use('/slack', slackRouter);
