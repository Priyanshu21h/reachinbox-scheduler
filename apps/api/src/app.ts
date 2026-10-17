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

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  // ─── Middleware ───────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );
  app.use(pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          // OAuth callback query parameters contain one-time codes and signed state.
          url: String(req.url ?? '').split('?')[0],
          remoteAddress: req.remoteAddress,
        };
      },
    },
  }));
  app.use((req, res, next) => {
    const limit = req.path === '/emails/schedule' ? '12mb' : '2mb';
    express.json({ limit })(req, res, next);
  });
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  app.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const origin = req.get('origin');
    // Enforce same-site browser requests; permit origin-less local scripts only in development.
    if (!origin && env.NODE_ENV !== 'production') return next();
    if (origin === new URL(env.FRONTEND_URL).origin) return next();
    res.status(403).json({ error: { code: 'INVALID_ORIGIN', message: 'Request origin is not allowed' } });
  });

  // ─── Root (friendly landing, stops "Cannot GET /") ───────────────────────
  app.get('/', (_req, res) => {
    res.json({
      service: 'reachinbox-api',
      status: 'ok',
      health: '/health',
      queues: '/admin/queues',
      frontend: env.FRONTEND_URL,
    });
  });

  // ─── Routes ──────────────────────────────────────────────────────────────
  app.use('/', apiRouter);
  app.use('/admin/queues', createAdminRouter());

  // ─── Error Handler ───────────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
