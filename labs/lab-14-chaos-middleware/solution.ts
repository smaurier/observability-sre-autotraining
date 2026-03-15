// =============================================================================
// Lab 15 — Chaos Engineering Middleware (Solution)
// =============================================================================
// Lancez les tests : npx tsx solution.ts
// =============================================================================

import { createTestRunner, simulateRequests, calculateErrorRate } from '../test-utils.ts';

const { test, assert, assertEqual, assertGreaterThan, assertLessThan, summary } = createTestRunner('Lab 15 — Chaos Middleware');

// =============================================================================
// Types
// =============================================================================

interface Request {
  method: string;
  path: string;
  headers: Record<string, string>;
}

interface Response {
  status: number;
  body: string;
  durationMs: number;
}

type Middleware = (req: Request, next: () => Response) => Response;

type CircuitBreakerState = 'closed' | 'open' | 'half-open';

interface CircuitBreaker {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  failureThreshold: number;
  successThreshold: number;
  lastFailureTime: number;
  cooldownMs: number;
}

interface ChaosExperimentConfig {
  name: string;
  latencyInjection?: { probability: number; minMs: number; maxMs: number };
  errorInjection?: { probability: number; statusCode: number };
  duration: number;
}

interface ChaosExperimentResult {
  name: string;
  totalRequests: number;
  baselineErrorRate: number;
  chaosErrorRate: number;
  baselineAvgLatency: number;
  chaosAvgLatency: number;
  sloCompliant: boolean;
  sloTarget: number;
}

// =============================================================================
// Exercice 1 — Injection de latence
// =============================================================================

function createLatencyMiddleware(
  probability: number,
  minMs: number,
  maxMs: number
): Middleware {
  return (req: Request, next: () => Response): Response => {
    const response = next();
    if (Math.random() < probability) {
      const delay = minMs + Math.random() * (maxMs - minMs);
      return {
        ...response,
        durationMs: response.durationMs + delay,
      };
    }
    return response;
  };
}

// =============================================================================
// Exercice 2 — Injection d'erreurs
// =============================================================================

function createErrorMiddleware(
  probability: number,
  statusCode: number = 500
): Middleware {
  return (req: Request, next: () => Response): Response => {
    if (Math.random() < probability) {
      return {
        status: statusCode,
        body: 'Chaos: injected error',
        durationMs: 0,
      };
    }
    return next();
  };
}

// =============================================================================
// Exercice 3 — Simulation d'épuisement de ressources
// =============================================================================

function createResourceExhaustionMiddleware(
  probability: number,
  blockDurationMs: number
): Middleware {
  return (req: Request, next: () => Response): Response => {
    const response = next();
    if (Math.random() < probability) {
      return {
        ...response,
        durationMs: response.durationMs + blockDurationMs,
      };
    }
    return response;
  };
}

// =============================================================================
// Exercice 4 — Circuit Breaker
// =============================================================================

function createCircuitBreaker(
  failureThreshold: number,
  successThreshold: number,
  cooldownMs: number
): CircuitBreaker {
  return {
    state: 'closed',
    failureCount: 0,
    successCount: 0,
    failureThreshold,
    successThreshold,
    lastFailureTime: 0,
    cooldownMs,
  };
}

function recordSuccess(cb: CircuitBreaker): CircuitBreaker {
  const updated = { ...cb };
  if (updated.state === 'half-open') {
    updated.successCount++;
    if (updated.successCount >= updated.successThreshold) {
      updated.state = 'closed';
      updated.failureCount = 0;
      updated.successCount = 0;
    }
  } else if (updated.state === 'closed') {
    updated.failureCount = 0;
  }
  return updated;
}

function recordFailure(cb: CircuitBreaker): CircuitBreaker {
  const updated = { ...cb };
  if (updated.state === 'closed') {
    updated.failureCount++;
    if (updated.failureCount >= updated.failureThreshold) {
      updated.state = 'open';
      updated.lastFailureTime = Date.now();
    }
  } else if (updated.state === 'half-open') {
    updated.state = 'open';
    updated.lastFailureTime = Date.now();
    updated.successCount = 0;
  }
  return updated;
}

function canExecute(cb: CircuitBreaker, now?: number): boolean {
  const currentTime = now ?? Date.now();
  if (cb.state === 'closed') return true;
  if (cb.state === 'half-open') return true;
  // state === 'open'
  return currentTime - cb.lastFailureTime >= cb.cooldownMs;
}

function tryTransitionToHalfOpen(cb: CircuitBreaker, now?: number): CircuitBreaker {
  const currentTime = now ?? Date.now();
  if (cb.state === 'open' && currentTime - cb.lastFailureTime >= cb.cooldownMs) {
    return { ...cb, state: 'half-open', successCount: 0 };
  }
  return cb;
}

// =============================================================================
// Exercice 5 — Chaos Experiment Runner
// =============================================================================

function runChaosExperiment(
  config: ChaosExperimentConfig,
  sloTarget: number
): ChaosExperimentResult {
  const normalNext = (): Response => ({
    status: 200,
    body: 'OK',
    durationMs: 50 + Math.random() * 50,
  });

  const normalReq: Request = { method: 'GET', path: '/api/data', headers: {} };

  // 1. Baseline
  const baselineResults: Response[] = [];
  for (let i = 0; i < config.duration; i++) {
    baselineResults.push(normalNext());
  }
  const baselineErrors = baselineResults.filter(r => r.status >= 500).length;
  const baselineErrorRate = baselineResults.length > 0 ? baselineErrors / baselineResults.length : 0;
  const baselineAvgLatency = baselineResults.reduce((sum, r) => sum + r.durationMs, 0) / baselineResults.length;

  // 2. Chaos
  const middlewares: Middleware[] = [];
  if (config.latencyInjection) {
    middlewares.push(createLatencyMiddleware(
      config.latencyInjection.probability,
      config.latencyInjection.minMs,
      config.latencyInjection.maxMs
    ));
  }
  if (config.errorInjection) {
    middlewares.push(createErrorMiddleware(
      config.errorInjection.probability,
      config.errorInjection.statusCode
    ));
  }

  const chaosResults: Response[] = [];
  for (let i = 0; i < config.duration; i++) {
    let result: Response;
    if (middlewares.length === 0) {
      result = normalNext();
    } else {
      // Chain middlewares
      const chain = middlewares.reduceRight(
        (next: () => Response, mw: Middleware) => () => mw(normalReq, next),
        normalNext
      );
      result = chain();
    }
    chaosResults.push(result);
  }

  const chaosErrors = chaosResults.filter(r => r.status >= 500).length;
  const chaosErrorRate = chaosResults.length > 0 ? chaosErrors / chaosResults.length : 0;
  const chaosAvgLatency = chaosResults.reduce((sum, r) => sum + r.durationMs, 0) / chaosResults.length;

  // 3. SLO compliance
  const errorBudget = 1 - sloTarget;
  const sloCompliant = chaosErrorRate <= errorBudget;

  return {
    name: config.name,
    totalRequests: config.duration,
    baselineErrorRate,
    chaosErrorRate,
    baselineAvgLatency,
    chaosAvgLatency,
    sloCompliant,
    sloTarget,
  };
}

// =============================================================================
// Tests
// =============================================================================

async function main() {
  console.log('\n🔥 Lab 15 — Chaos Middleware\n');

  const normalNext = (): Response => ({
    status: 200,
    body: 'OK',
    durationMs: 50,
  });

  const normalReq: Request = {
    method: 'GET',
    path: '/api/data',
    headers: {},
  };

  // --- Exercice 1 ---
  await test('Ex1: latency middleware ajoute du délai', () => {
    const middleware = createLatencyMiddleware(1.0, 100, 200);
    const response = middleware(normalReq, normalNext);
    assertGreaterThan(response.durationMs, 100);
    assertEqual(response.status, 200);
  });

  await test('Ex1: latency middleware avec probabilité 0 ne change rien', () => {
    const middleware = createLatencyMiddleware(0, 100, 200);
    const response = middleware(normalReq, normalNext);
    assertEqual(response.durationMs, 50);
  });

  // --- Exercice 2 ---
  await test('Ex2: error middleware injecte des erreurs', () => {
    const middleware = createErrorMiddleware(1.0, 503);
    const response = middleware(normalReq, normalNext);
    assertEqual(response.status, 503);
  });

  await test('Ex2: error middleware avec probabilité 0 passe la requête', () => {
    const middleware = createErrorMiddleware(0);
    const response = middleware(normalReq, normalNext);
    assertEqual(response.status, 200);
  });

  // --- Exercice 3 ---
  await test('Ex3: resource exhaustion ajoute du blocage', () => {
    const middleware = createResourceExhaustionMiddleware(1.0, 500);
    const response = middleware(normalReq, normalNext);
    assertGreaterThan(response.durationMs, 500);
    assertEqual(response.status, 200);
  });

  // --- Exercice 4 ---
  await test('Ex4: circuit breaker commence fermé', () => {
    const cb = createCircuitBreaker(3, 2, 5000);
    assertEqual(cb.state, 'closed');
    assertEqual(cb.failureCount, 0);
    assert(canExecute(cb), 'Should be able to execute when closed');
  });

  await test('Ex4: circuit breaker s\'ouvre après seuil d\'échecs', () => {
    let cb = createCircuitBreaker(3, 2, 5000);
    cb = recordFailure(cb);
    cb = recordFailure(cb);
    assertEqual(cb.state, 'closed');
    cb = recordFailure(cb);
    assertEqual(cb.state, 'open');
    assert(!canExecute(cb, Date.now()), 'Should NOT execute when open and cooldown not passed');
  });

  await test('Ex4: circuit breaker passe en half-open après cooldown', () => {
    let cb = createCircuitBreaker(3, 2, 1000);
    cb = recordFailure(cb);
    cb = recordFailure(cb);
    cb = recordFailure(cb);
    assertEqual(cb.state, 'open');

    const futureTime = Date.now() + 2000;
    assert(canExecute(cb, futureTime), 'Should be able to execute after cooldown');
    cb = tryTransitionToHalfOpen(cb, futureTime);
    assertEqual(cb.state, 'half-open');
  });

  await test('Ex4: circuit breaker se referme après succès en half-open', () => {
    let cb = createCircuitBreaker(3, 2, 1000);
    cb = recordFailure(cb);
    cb = recordFailure(cb);
    cb = recordFailure(cb);
    const futureTime = Date.now() + 2000;
    cb = tryTransitionToHalfOpen(cb, futureTime);
    assertEqual(cb.state, 'half-open');

    cb = recordSuccess(cb);
    assertEqual(cb.state, 'half-open');
    cb = recordSuccess(cb);
    assertEqual(cb.state, 'closed');
  });

  // --- Exercice 5 ---
  await test('Ex5: chaos experiment avec injection d\'erreurs', () => {
    const result = runChaosExperiment({
      name: 'error-injection-test',
      errorInjection: { probability: 0.3, statusCode: 500 },
      duration: 1000,
    }, 0.999);
    assertEqual(result.name, 'error-injection-test');
    assertEqual(result.totalRequests, 1000);
    assertGreaterThan(result.chaosErrorRate, result.baselineErrorRate);
    assert(!result.sloCompliant, 'Should not be SLO compliant with 30% error injection');
  });

  await test('Ex5: chaos experiment avec injection de latence', () => {
    const result = runChaosExperiment({
      name: 'latency-injection-test',
      latencyInjection: { probability: 0.5, minMs: 200, maxMs: 500 },
      duration: 500,
    }, 0.999);
    assertGreaterThan(result.chaosAvgLatency, result.baselineAvgLatency);
  });

  summary();
}

main();
