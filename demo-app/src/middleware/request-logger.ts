import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.ts';
import { getRequestContext } from '../lib/context.ts';

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ctx = getRequestContext();
  const childLogger = logger.child({ requestId: ctx?.requestId });

  childLogger.info({ method: req.method, url: req.url }, 'request started');

  res.on('finish', () => {
    const durationMs = ctx ? Date.now() - ctx.startTime : 0;
    childLogger.info(
      { method: req.method, url: req.url, statusCode: res.statusCode, durationMs },
      'request completed'
    );
  });

  next();
}
