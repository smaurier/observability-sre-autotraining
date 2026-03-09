// =============================================================================
// Lab 05 — Instrumenter une API Express (SOLUTION)
// =============================================================================
// Ce fichier contient les solutions completes de tous les exercices.
// =============================================================================

import { createTestRunner, assertPrometheusMetric } from '../test-utils.ts';
const { test, assert, assertEqual, assertIncludes, assertGreaterThan, summary } =
  createTestRunner('Lab 05 — Instrumenter une API Express');

// =============================================================================
// Types simules pour Express
// =============================================================================

interface FakeRequest {
  method: string;
  path: string;
  startTime?: number;
}

interface FakeResponse {
  statusCode: number;
  end: () => void;
}

type NextFunction = () => void;

// =============================================================================
// Exercice 1 : Middleware compteur de requetes
// =============================================================================

interface RequestCount {
  method: string;
  path: string;
  status: number;
  count: number;
}

const requestCounts: Map<string, RequestCount> = new Map();

function metricsCountMiddleware(req: FakeRequest, res: FakeResponse, next: NextFunction): void {
  next();

  const key = `${req.method}|${req.path}|${res.statusCode}`;
  const existing = requestCounts.get(key);

  if (existing) {
    existing.count++;
  } else {
    requestCounts.set(key, {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      count: 1,
    });
  }
}

// =============================================================================
// Exercice 2 : Middleware duree de requete
// =============================================================================

interface DurationRecord {
  method: string;
  path: string;
  status: number;
  durationMs: number;
}

const durationRecords: DurationRecord[] = [];

function metricsDurationMiddleware(req: FakeRequest, res: FakeResponse, next: NextFunction): void {
  const start = performance.now();
  next();
  const durationMs = performance.now() - start;

  durationRecords.push({
    method: req.method,
    path: req.path,
    status: res.statusCode,
    durationMs,
  });
}

// =============================================================================
// Exercice 3 : Requetes en cours (in-flight)
// =============================================================================

let inFlightGauge = 0;
let maxInFlight = 0;

function inFlightMiddleware(req: FakeRequest, res: FakeResponse, next: NextFunction): void {
  inFlightGauge++;
  if (inFlightGauge > maxInFlight) {
    maxInFlight = inFlightGauge;
  }
  next();
  inFlightGauge--;
}

// =============================================================================
// Exercice 4 : Format Prometheus /metrics
// =============================================================================

function generatePrometheusMetrics(): string {
  const lines: string[] = [];
  lines.push('# HELP http_requests_total Total HTTP requests');
  lines.push('# TYPE http_requests_total counter');

  for (const [, entry] of requestCounts) {
    const labels = `method="${entry.method}",path="${entry.path}",status="${entry.status}"`;
    lines.push(`http_requests_total{${labels}} ${entry.count}`);
  }

  return lines.join('\n');
}

// =============================================================================
// Exercice 5 : Taux d'erreur par route
// =============================================================================

interface RouteErrorRate {
  path: string;
  totalRequests: number;
  errorRequests: number;
  errorRate: number;
}

function calculateErrorRatesByRoute(): RouteErrorRate[] {
  const routeStats = new Map<string, { total: number; errors: number }>();

  for (const [, entry] of requestCounts) {
    const existing = routeStats.get(entry.path) || { total: 0, errors: 0 };
    existing.total += entry.count;
    if (entry.status >= 400) {
      existing.errors += entry.count;
    }
    routeStats.set(entry.path, existing);
  }

  const result: RouteErrorRate[] = [];
  for (const [path, stats] of routeStats) {
    result.push({
      path,
      totalRequests: stats.total,
      errorRequests: stats.errors,
      errorRate: stats.total > 0 ? stats.errors / stats.total : 0,
    });
  }

  return result;
}

// =============================================================================
// Utilitaire de simulation
// =============================================================================

function simulateRequest(
  method: string,
  path: string,
  statusCode: number,
  handler?: () => void
): { req: FakeRequest; res: FakeResponse } {
  const req: FakeRequest = { method, path };
  const res: FakeResponse = {
    statusCode,
    end() {},
  };

  const next = () => {
    if (handler) handler();
  };

  metricsCountMiddleware(req, res, () => {
    metricsDurationMiddleware(req, res, () => {
      inFlightMiddleware(req, res, next);
    });
  });

  return { req, res };
}

// =============================================================================
// Tests
// =============================================================================

async function main() {
  console.log('\n🧪 Lab 05 — Instrumenter une API Express\n');

  // Reset state
  requestCounts.clear();
  durationRecords.length = 0;
  inFlightGauge = 0;
  maxInFlight = 0;

  // --- Exercice 1 ---
  await test('Ex1 — middleware compte les requetes', () => {
    requestCounts.clear();
    const req: FakeRequest = { method: 'GET', path: '/api/users' };
    const res: FakeResponse = { statusCode: 200, end() {} };

    metricsCountMiddleware(req, res, () => {});
    metricsCountMiddleware(req, res, () => {});

    const key = 'GET|/api/users|200';
    assert(requestCounts.has(key), `Cle ${key} doit exister`);
    assertEqual(requestCounts.get(key)!.count, 2);
  });

  await test('Ex1 — middleware distingue les routes', () => {
    requestCounts.clear();
    metricsCountMiddleware(
      { method: 'GET', path: '/api/users' },
      { statusCode: 200, end() {} },
      () => {}
    );
    metricsCountMiddleware(
      { method: 'POST', path: '/api/orders' },
      { statusCode: 201, end() {} },
      () => {}
    );
    metricsCountMiddleware(
      { method: 'GET', path: '/api/users' },
      { statusCode: 404, end() {} },
      () => {}
    );

    assertEqual(requestCounts.size, 3);
  });

  // --- Exercice 2 ---
  await test('Ex2 — middleware enregistre les durees', () => {
    durationRecords.length = 0;
    const req: FakeRequest = { method: 'GET', path: '/api/test' };
    const res: FakeResponse = { statusCode: 200, end() {} };

    metricsDurationMiddleware(req, res, () => {});

    assertEqual(durationRecords.length, 1);
    assertEqual(durationRecords[0].method, 'GET');
    assertEqual(durationRecords[0].path, '/api/test');
    assert(durationRecords[0].durationMs >= 0, 'La duree doit etre >= 0');
  });

  // --- Exercice 3 ---
  await test('Ex3 — in-flight gauge monte et descend', () => {
    inFlightGauge = 0;
    maxInFlight = 0;
    let capturedInFlight = 0;

    const req: FakeRequest = { method: 'GET', path: '/api/test' };
    const res: FakeResponse = { statusCode: 200, end() {} };

    inFlightMiddleware(req, res, () => {
      capturedInFlight = inFlightGauge;
    });

    assertEqual(capturedInFlight, 1, 'In-flight doit etre 1 pendant le traitement');
    assertEqual(inFlightGauge, 0, 'In-flight doit revenir a 0 apres');
  });

  await test('Ex3 — maxInFlight est enregistre', () => {
    inFlightGauge = 0;
    maxInFlight = 0;

    const req: FakeRequest = { method: 'GET', path: '/api/test' };
    const res: FakeResponse = { statusCode: 200, end() {} };

    inFlightMiddleware(req, res, () => {});

    assertGreaterThan(maxInFlight, 0);
  });

  // --- Exercice 4 ---
  await test('Ex4 — generatePrometheusMetrics format correct', () => {
    requestCounts.clear();
    metricsCountMiddleware(
      { method: 'GET', path: '/api/users' },
      { statusCode: 200, end() {} },
      () => {}
    );
    metricsCountMiddleware(
      { method: 'POST', path: '/api/orders' },
      { statusCode: 201, end() {} },
      () => {}
    );

    const output = generatePrometheusMetrics();
    assertIncludes(output, 'http_requests_total');
    assertIncludes(output, 'method="GET"');
    assertIncludes(output, 'path="/api/users"');
    assertIncludes(output, 'status="200"');
    assertPrometheusMetric(output, 'http_requests_total', {
      method: 'GET',
      path: '/api/users',
      status: '200',
    });
  });

  // --- Exercice 5 ---
  await test('Ex5 — calculateErrorRatesByRoute', () => {
    requestCounts.clear();
    for (let i = 0; i < 3; i++) {
      metricsCountMiddleware(
        { method: 'GET', path: '/api/users' },
        { statusCode: 200, end() {} },
        () => {}
      );
    }
    metricsCountMiddleware(
      { method: 'GET', path: '/api/users' },
      { statusCode: 500, end() {} },
      () => {}
    );
    for (let i = 0; i < 2; i++) {
      metricsCountMiddleware(
        { method: 'POST', path: '/api/orders' },
        { statusCode: 201, end() {} },
        () => {}
      );
    }

    const rates = calculateErrorRatesByRoute();
    const usersRate = rates.find((r) => r.path === '/api/users');
    const ordersRate = rates.find((r) => r.path === '/api/orders');

    assert(usersRate !== undefined, '/api/users doit etre present');
    assertEqual(usersRate!.totalRequests, 4);
    assertEqual(usersRate!.errorRequests, 1);
    assertEqual(usersRate!.errorRate, 0.25);

    assert(ordersRate !== undefined, '/api/orders doit etre present');
    assertEqual(ordersRate!.totalRequests, 2);
    assertEqual(ordersRate!.errorRate, 0);
  });

  summary();
}

main();
