import { Router } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import { getEmailQueue } from '../../core/queue/index.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/admin.js';

export function createAdminRouter(): Router {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [new BullMQAdapter(getEmailQueue()) as any],
    serverAdapter,
  });

  const router = Router();
  router.use(authMiddleware, requireAdmin);
  router.use('/', serverAdapter.getRouter());

  return router;
}
