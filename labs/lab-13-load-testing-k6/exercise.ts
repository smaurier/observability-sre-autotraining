// =============================================================================
// Lab 14 — Load Testing k6 (Exercise)
// =============================================================================
// Lancez les tests : npx tsx exercise.ts
// =============================================================================

import { createTestRunner, calculatePercentile } from '../test-utils.ts';

const { test, assert, assertEqual, assertGreaterThan, assertLessThan, assertIncludes, summary } = createTestRunner('Lab 14 — Load Testing k6');

// =============================================================================
// Types
// =============================================================================

type ScenarioType = 'ramp-up' | 'steady-state' | 'spike' | 'soak';

interface LoadStage {
  duration: string;   // e.g., '1m', '5m', '30s'
  target: number;     // VUs
}

interface K6Scenario {
  name: string;
  type: ScenarioType;
  stages: LoadStage[];
  thresholds: ThresholdDefinition[];
}

interface ThresholdDefinition {
  metric: string;        // e.g., 'http_req_duration', 'http_req_failed'
  condition: string;     // e.g., 'p(95)<500', 'rate<0.01'
  abortOnFail: boolean;
}

interface RequestResult {
  timestamp: number;
  durationMs: number;
  status: number;
  vu: number;           // virtual user id
  iteration: number;
}

interface ThresholdResult {
  metric: string;
  condition: string;
  value: number;
  passed: boolean;
}

interface LoadTestReport {
  scenario: string;
  totalRequests: number;
  totalDurationMs: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
  errorRate: number;
  requestsPerSecond: number;
  thresholdResults: ThresholdResult[];
  passed: boolean;
}

// =============================================================================
// Exercice 1 — Modéliser des scénarios k6
// =============================================================================

function createScenario(name: string, type: ScenarioType): K6Scenario {
  // TODO: Créer un scénario k6 selon le type
  // Pour chaque type, définir des stages prédéfinis :
  //
  // 'ramp-up':
  //   stages: [{ duration: '1m', target: 10 }, { duration: '3m', target: 50 }, { duration: '1m', target: 0 }]
  //
  // 'steady-state':
  //   stages: [{ duration: '1m', target: 50 }, { duration: '5m', target: 50 }, { duration: '1m', target: 0 }]
  //
  // 'spike':
  //   stages: [{ duration: '1m', target: 10 }, { duration: '30s', target: 200 }, { duration: '30s', target: 10 }, { duration: '1m', target: 0 }]
  //
  // 'soak':
  //   stages: [{ duration: '2m', target: 30 }, { duration: '30m', target: 30 }, { duration: '2m', target: 0 }]
  //
  // Thresholds par défaut :
  //   [
  //     { metric: 'http_req_duration', condition: 'p(95)<500', abortOnFail: false },
  //     { metric: 'http_req_failed', condition: 'rate<0.01', abortOnFail: true },
  //   ]
  throw new Error('TODO: Implement createScenario');
}

// =============================================================================
// Exercice 2 — Simuler l'exécution d'un test
// =============================================================================

function simulateLoadTest(
  scenario: K6Scenario,
  options: {
    baseLatencyMs?: number;
    latencyVariance?: number;
    errorRate?: number;
    requestsPerVU?: number;
  } = {}
): RequestResult[] {
  // TODO: Simuler des résultats de test de charge
  // Options par défaut : baseLatencyMs=100, latencyVariance=200, errorRate=0.005, requestsPerVU=10
  //
  // 1. Calculer le nombre total de VUs à partir du max target dans les stages
  // 2. Pour chaque VU (de 0 à maxVUs-1), pour chaque itération (de 0 à requestsPerVU-1) :
  //    - timestamp: Date.now() + (vu * requestsPerVU + iteration) * 100
  //    - durationMs: baseLatencyMs + Math.random() * latencyVariance
  //    - status: Math.random() < errorRate ? 500 : 200
  //    - vu: numéro du VU
  //    - iteration: numéro de l'itération
  // 3. Retourner le tableau de résultats
  throw new Error('TODO: Implement simulateLoadTest');
}

// =============================================================================
// Exercice 3 — Calculer les thresholds k6
// =============================================================================

function calculateThresholds(
  results: RequestResult[],
  thresholds: ThresholdDefinition[]
): ThresholdResult[] {
  // TODO: Calculer les résultats des thresholds
  // Pour chaque threshold :
  //   - Si metric === 'http_req_duration' et condition commence par 'p(' :
  //     - Extraire le percentile (ex: 'p(95)<500' → percentile=95, limit=500)
  //     - Calculer le percentile des durationMs avec calculatePercentile
  //     - passed = valeur < limit
  //   - Si metric === 'http_req_failed' et condition commence par 'rate' :
  //     - Extraire la limite (ex: 'rate<0.01' → limit=0.01)
  //     - Calculer le taux d'erreur (status >= 500)
  //     - passed = valeur < limit
  //   - Sinon, value=0, passed=true (unknown metric)
  throw new Error('TODO: Implement calculateThresholds');
}

// =============================================================================
// Exercice 4 — Pass/fail des thresholds
// =============================================================================

function evaluateThresholds(thresholdResults: ThresholdResult[]): {
  allPassed: boolean;
  failed: ThresholdResult[];
  passed: ThresholdResult[];
} {
  // TODO: Évaluer les résultats des thresholds
  // - allPassed: true si tous les thresholds passent
  // - failed: tableau des thresholds échoués
  // - passed: tableau des thresholds réussis
  throw new Error('TODO: Implement evaluateThresholds');
}

// =============================================================================
// Exercice 5 — Rapport de test de charge
// =============================================================================

function generateLoadTestReport(
  scenario: K6Scenario,
  results: RequestResult[]
): LoadTestReport {
  // TODO: Générer un rapport complet
  // 1. Calculer les statistiques :
  //    - totalRequests: nombre de résultats
  //    - totalDurationMs: max(timestamp) - min(timestamp) parmi les résultats
  //    - avgLatencyMs: moyenne des durationMs
  //    - p50LatencyMs, p95LatencyMs, p99LatencyMs: percentiles
  //    - maxLatencyMs, minLatencyMs: max et min des durationMs
  //    - errorRate: nombre de status >= 500 / total
  //    - requestsPerSecond: totalRequests / (totalDurationMs / 1000) (ou 0 si totalDurationMs = 0)
  // 2. Calculer les thresholdResults via calculateThresholds
  // 3. passed: true si tous les thresholds passent
  throw new Error('TODO: Implement generateLoadTestReport');
}

// =============================================================================
// Tests
// =============================================================================

async function main() {
  console.log('\n📊 Lab 14 — Load Testing k6\n');

  // --- Exercice 1 ---
  await test('Ex1: créer un scénario ramp-up', () => {
    const scenario = createScenario('api-ramp-up', 'ramp-up');
    assertEqual(scenario.name, 'api-ramp-up');
    assertEqual(scenario.type, 'ramp-up');
    assertEqual(scenario.stages.length, 3);
    assertEqual(scenario.stages[0].target, 10);
    assertEqual(scenario.stages[1].target, 50);
    assertEqual(scenario.stages[2].target, 0);
    assertEqual(scenario.thresholds.length, 2);
  });

  await test('Ex1: créer un scénario spike', () => {
    const scenario = createScenario('api-spike', 'spike');
    assertEqual(scenario.type, 'spike');
    assertEqual(scenario.stages.length, 4);
    // Le spike atteint 200 VUs
    const maxTarget = Math.max(...scenario.stages.map(s => s.target));
    assertEqual(maxTarget, 200);
  });

  // --- Exercice 2 ---
  await test('Ex2: simuler un test de charge', () => {
    const scenario = createScenario('test', 'steady-state');
    const results = simulateLoadTest(scenario, {
      baseLatencyMs: 50,
      latencyVariance: 100,
      errorRate: 0.02,
      requestsPerVU: 5,
    });
    assertGreaterThan(results.length, 0);
    // Chaque résultat a les bons champs
    assert(results[0].timestamp > 0, 'timestamp should be positive');
    assert(results[0].durationMs > 0, 'durationMs should be positive');
    assert(results[0].status === 200 || results[0].status === 500, 'status should be 200 or 500');
  });

  // --- Exercice 3 ---
  await test('Ex3: calculer le p95 latency', () => {
    const scenario = createScenario('test', 'steady-state');
    const results = simulateLoadTest(scenario, {
      baseLatencyMs: 100,
      latencyVariance: 200,
      errorRate: 0.005,
      requestsPerVU: 20,
    });
    const thresholdResults = calculateThresholds(results, scenario.thresholds);
    assertEqual(thresholdResults.length, 2);

    const latencyThreshold = thresholdResults.find(t => t.metric === 'http_req_duration');
    assert(latencyThreshold !== undefined, 'Should have latency threshold');
    assertGreaterThan(latencyThreshold!.value, 0);
  });

  await test('Ex3: calculer le error rate', () => {
    const results: RequestResult[] = Array.from({ length: 100 }, (_, i) => ({
      timestamp: Date.now() + i * 100,
      durationMs: 100 + Math.random() * 100,
      status: i < 5 ? 500 : 200, // 5% error rate
      vu: 0,
      iteration: i,
    }));
    const thresholdResults = calculateThresholds(results, [
      { metric: 'http_req_failed', condition: 'rate<0.01', abortOnFail: false },
    ]);
    assertEqual(thresholdResults.length, 1);
    assert(Math.abs(thresholdResults[0].value - 0.05) < 0.01, `Expected ~0.05, got ${thresholdResults[0].value}`);
    assert(!thresholdResults[0].passed, 'Should fail with 5% error rate vs 1% threshold');
  });

  // --- Exercice 4 ---
  await test('Ex4: évaluer les thresholds — tous passent', () => {
    const thresholdResults: ThresholdResult[] = [
      { metric: 'http_req_duration', condition: 'p(95)<500', value: 350, passed: true },
      { metric: 'http_req_failed', condition: 'rate<0.01', value: 0.005, passed: true },
    ];
    const evaluation = evaluateThresholds(thresholdResults);
    assert(evaluation.allPassed, 'All should pass');
    assertEqual(evaluation.passed.length, 2);
    assertEqual(evaluation.failed.length, 0);
  });

  await test('Ex4: évaluer les thresholds — un échoue', () => {
    const thresholdResults: ThresholdResult[] = [
      { metric: 'http_req_duration', condition: 'p(95)<500', value: 650, passed: false },
      { metric: 'http_req_failed', condition: 'rate<0.01', value: 0.005, passed: true },
    ];
    const evaluation = evaluateThresholds(thresholdResults);
    assert(!evaluation.allPassed, 'Should not all pass');
    assertEqual(evaluation.failed.length, 1);
    assertEqual(evaluation.failed[0].metric, 'http_req_duration');
  });

  // --- Exercice 5 ---
  await test('Ex5: générer un rapport de test', () => {
    const scenario = createScenario('api-test', 'ramp-up');
    const results = simulateLoadTest(scenario, {
      baseLatencyMs: 50,
      latencyVariance: 150,
      errorRate: 0.005,
      requestsPerVU: 10,
    });
    const report = generateLoadTestReport(scenario, results);
    assertEqual(report.scenario, 'api-test');
    assertGreaterThan(report.totalRequests, 0);
    assertGreaterThan(report.avgLatencyMs, 0);
    assertGreaterThan(report.p95LatencyMs, report.p50LatencyMs);
    assert(report.errorRate >= 0 && report.errorRate <= 1, 'Error rate should be between 0 and 1');
    assertGreaterThan(report.requestsPerSecond, 0);
    assertEqual(report.thresholdResults.length, 2);
  });

  summary();
}

main();
