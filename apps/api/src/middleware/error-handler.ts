import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../core/errors/index.js';
import { logger } from '../core/logger/index.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ code: err.code, statusCode: err.statusCode }, err.message);
    } else {
      logger.warn({ code: err.code, statusCode: err.statusCode }, err.message);
    }
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // Unknown errors
  // Error objects can contain SQL parameters, OAuth responses, or request details.
  logger.error({ errorName: err.name }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
