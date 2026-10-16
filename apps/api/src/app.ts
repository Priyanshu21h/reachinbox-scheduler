import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { apiRouter } from './routes.js';
import { createAdminRouter } from './modules/admin/admin.routes.js';
import { errorHandler } from './middleware/error-handler.js';
import { env } from './config/env.js';
import { logger } from './core/logger/index.js';

export function createApp(): express.Application {
  const app = express();

  app.set('trust proxy', 1);

  // ─── Middleware ───────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // ─── Routes ──────────────────────────────────────────────────────────────
  app.use('/', apiRouter);
  app.use('/admin/queues', createAdminRouter());

  // ─── Error Handler ───────────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
