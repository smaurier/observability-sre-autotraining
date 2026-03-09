import { Router } from 'express';
import type { HealthStatus } from '../types/index.ts';

const startTime = Date.now();
const router = Router();

router.get('/live', (_req, res) => {
  res.json({ status: 'ok' });
});

router.get('/ready', (_req, res) => {
  res.json({ status: 'ok' });
});

router.get('/', (_req, res) => {
  const health: HealthStatus = {
    status: 'healthy',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks: {
      memory: {
        status: 'ok',
        latencyMs: 0,
      },
    },
  };
  res.json(health);
});

export default router;
