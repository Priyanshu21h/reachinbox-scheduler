import { Router } from 'express';
import { prisma } from '@rs/db';
import { authMiddleware } from '../../middleware/auth.js';

export const statsRouter = Router();

statsRouter.use(authMiddleware);

statsRouter.get('/', async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        const [scheduled, sent, failed] = await Promise.all([
            // Keep this count aligned with the Scheduled Emails list, which also
            // includes emails currently being processed.
            prisma.email.count({ where: { userId, status: { in: ['SCHEDULED', 'SENDING'] } } }),
            prisma.email.count({ where: { userId, status: 'SENT' } }),
            prisma.email.count({ where: { userId, status: 'FAILED' } }),
        ]);

        res.json({
            data: {
                scheduled,
                sent,
                failed,
                // Derive this from this user's email rows; BullMQ counts are global.
                queue: scheduled,
            },
        });
    } catch (error) {
        next(error);
    }
});
