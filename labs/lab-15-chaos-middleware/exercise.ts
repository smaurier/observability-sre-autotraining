// =============================================================================
// Lab 15 — Chaos Engineering Middleware (Exercise)
// =============================================================================
// Lancez les tests : npx tsx exercise.ts
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
  successThreshold: number; // successes needed in half-open to close
  lastFailureTime: number;
  cooldownMs: number;      // time before transitioning from open to half-open
}

interface ChaosExperimentConfig {
  name: string;
  latencyInjection?: { probability: number; minMs: number; maxMs: number };
  errorInjection?: { probability: number; statusCode: number };
  duration: number; // number of requests to simulate
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
  // TODO: Créer un middleware qui injecte de la latence
  // - Avec une probabilité donnée (0-1), ajouter un délai aléatoire entre minMs et maxMs
  // - Appeler next() pour obtenir la réponse originale
  // - Ajouter le délai au durationMs de la réponse
  // - Si pas de latence injectée, retourner la réponse originale telle quelle
  throw new Error('TODO: Implement createLatencyMiddleware');
}

// =============================================================================
// Exercice 2 — Injection d'erreurs
// =============================================================================

function createErrorMiddleware(
  probability: number,
  statusCode: number = 500
): Middleware {
  // TODO: Créer un middleware qui injecte des erreurs
  // - Avec une probabilité donnée (0-1), retourner directement une réponse d'erreur :
  //   { status: statusCode, body: 'Chaos: injected error', durationMs: 0 }
  // - Sinon, appeler next() et retourner la réponse originale
  throw new Error('TODO: Implement createErrorMiddleware');
}

// =============================================================================
// Exercice 3 — Simulation d'épuisement de ressources
// =============================================================================

function createResourceExhaustionMiddleware(
  probability: number,
  blockDurationMs: number
): Middleware {
  // TODO: Simuler le blocage de l'event loop
  // - Avec une probabilité donnée, simuler un blocage :
  //   - Appeler next() pour obtenir la réponse originale
  //   - Ajouter blockDurationMs au durationMs de la réponse
  //   - Ajouter le header 'X-Chaos-Blocked: true' au body (optionnel, juste ajouter la latence suffit)
  // - Si pas de blocage, appeler next() normalement
  throw new Error('TODO: Implement createResourceExhaustionMiddleware');
}

// =============================================================================
// Exercice 4 — Circuit Breaker
// =============================================================================

function createCircuitBreaker(
  failureThreshold: number,
  successThreshold: number,
  cooldownMs: number
): CircuitBreaker {
  // TODO: Créer un circuit breaker initial (état: closed)
  throw new Error('TODO: Implement createCircuitBreaker');
}

function recordSuccess(cb: CircuitBreaker): CircuitBreaker {
  // TODO: Enregistrer un succès
  // - Si état 'half-open' : incrémenter successCount
  //   - Si successCount >= successThreshold → passer à 'closed', reset failureCount et successCount
  // - Si état 'closed' : rien de spécial (on pourrait reset failureCount)
  // - Retourner une copie mise à jour
  throw new Error('TODO: Implement recordSuccess');
}

function recordFailure(cb: CircuitBreaker): CircuitBreaker {
  // TODO: Enregistrer un échec
  // - Si état 'closed' : incrémenter failureCount
  //   - Si failureCount >= failureThreshold → passer à 'open', enregistrer lastFailureTime
  // - Si état 'half-open' : passer directement à 'open', enregistrer lastFailureTime, reset successCount
  // - Retourner une copie mise à jour
  throw new Error('TODO: Implement recordFailure');
}

function canExecute(cb: CircuitBreaker, now?: number): boolean {
  // TODO: Vérifier si on peut exécuter une requête
  // - Si 'closed' → true
  // - Si 'open' → vérifier si le cooldown est passé (now - lastFailureTime >= cooldownMs)
  //   - Si oui, on considère qu'on peut essayer (half-open)
  //   - Sinon, false
  // - Si 'half-open' → true
  throw new Error('TODO: Implement canExecute');
}

function tryTransitionToHalfOpen(cb: CircuitBreaker, now?: number): CircuitBreaker {
  // TODO: Tenter la transition open → half-open
  // - Si état 'open' et cooldown passé → passer à 'half-open', reset successCount
  // - Sinon, retourner tel quel
  throw new Error('TODO: Implement tryTransitionToHalfOpen');
}

// =============================================================================
// Exercice 5 — Chaos Experiment Runner
// =============================================================================

function runChaosExperiment(
  config: ChaosExperimentConfig,
  sloTarget: number
): ChaosExperimentResult {
  // TODO: Exécuter une expérience chaos
  //
  // 1. Baseline : simuler `config.duration` requêtes normales
  //    - Utiliser une fonction next() qui retourne { status: 200, body: 'OK', durationMs: 50 + Math.random() * 50 }
  //    - Calculer le error rate et la latence moyenne de baseline
  //
  // 2. Chaos : simuler `config.duration` requêtes avec les middlewares chaos
  //    - Créer les middlewares selon la config :
  //      - Si latencyInjection: createLatencyMiddleware(probability, minMs, maxMs)
  //      - Si errorInjection: createErrorMiddleware(probability, statusCode)
  //    - Appliquer les middlewares dans l'ordre (latency d'abord, puis error)
  //    - Calculer le error rate et la latence moyenne
  //
  // 3. Calculer la conformité SLO
  //    - sloCompliant = chaosErrorRate <= (1 - sloTarget)
  //
  // 4. Retourner ChaosExperimentResult
  throw new Error('TODO: Implement runChaosExperiment');
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
    const middleware = createLatencyMiddleware(1.0, 100, 200); // 100% probability
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
    const middleware = createErrorMiddleware(1.0, 503); // 100% probability
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
    assertEqual(cb.state, 'closed'); // pas encore ouvert
    cb = recordFailure(cb);
    assertEqual(cb.state, 'open'); // 3 échecs = ouvert
    assert(!canExecute(cb, Date.now()), 'Should NOT execute when open and cooldown not passed');
  });

  await test('Ex4: circuit breaker passe en half-open après cooldown', () => {
    let cb = createCircuitBreaker(3, 2, 1000);
    cb = recordFailure(cb);
    cb = recordFailure(cb);
    cb = recordFailure(cb);
    assertEqual(cb.state, 'open');

    // Simuler le passage du temps
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
    assertEqual(cb.state, 'half-open'); // pas encore fermé
    cb = recordSuccess(cb);
    assertEqual(cb.state, 'closed'); // 2 succès = fermé
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
