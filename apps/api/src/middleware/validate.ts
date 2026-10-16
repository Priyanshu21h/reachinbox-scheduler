import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { ValidationError } from '../core/errors/index.js';

export function validate(schema: ZodSchema, target: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      throw new ValidationError('Validation failed', result.error.flatten().fieldErrors);
    }
    // Overwrite with parsed (coerced/defaulted) values
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}
