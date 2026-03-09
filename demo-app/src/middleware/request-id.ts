import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { asyncLocalStorage } from '../lib/context.ts';
import type { RequestContext } from '../types/index.ts';

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  const context: RequestContext = {
    requestId,
    method: req.method,
    path: req.path,
    startTime: Date.now(),
  };
  asyncLocalStorage.run(context, () => {
    next();
  });
}
