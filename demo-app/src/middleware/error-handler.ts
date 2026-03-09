import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.ts';
import { getRequestId } from '../lib/context.ts';

export function errorHandlerMiddleware(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const requestId = getRequestId();
  logger.error({ err, requestId }, 'unhandled error');
  res.status(500).json({
    error: 'Internal Server Error',
    requestId,
  });
}
