import type { Request, Response, NextFunction } from 'express';
import { httpRequestsTotal, httpRequestDuration, httpRequestsInFlight } from '../lib/metrics.ts';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const route = req.route?.path || req.path;
  httpRequestsInFlight.inc();
  const end = httpRequestDuration.startTimer({ method: req.method, route });

  res.on('finish', () => {
    httpRequestsInFlight.dec();
    const status = String(res.statusCode);
    end({ status });
    httpRequestsTotal.inc({ method: req.method, route, status });
  });

  next();
}
